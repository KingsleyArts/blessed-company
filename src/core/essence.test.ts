// Port of tests/essence/tests.cpp: the Essence sidebar (essenceConfig, essenceSidebar, essenceApply), the RunFlow hooks and
// the RunBot spending option. One named test per rule, same names and numbers as the C++ suite.
import { describe, it } from 'vitest';
import { StatDefCsv } from '../data/generated';
import { CHECK, NEAR, data as g_data } from './combatTestKit';
import { CombatSim } from './combatSim';
import { applyEssenceToSim, classAllowedStats, kEssenceAppliesToRunningFight } from './essenceApply';
import {
  EssenceConfig, applyStatDefCsv, defaultEssenceConfig, kEssenceRankScale, makeStatDef, shippedEssenceConfig,
} from './essenceConfig';
import { BuyRefusal, EssenceSidebar, kBuyMax } from './essenceSidebar';
import { fmtF } from './printf';
import { makeMeta, metaEquals, parseMeta, resetProgress, serializeMeta } from './metaSave';
import { RunBot } from './runBot';
import { defaultRunConfig, type RunConfig } from './runConfig';
import { FightResult, RunFlow, RunOutcome } from './runFlow';
import { makeRunSimOptions, simulateBotRun, type RunSimResult } from './runSim';
import { ModKind, ModSource, StatId, StatResolver } from './statResolver';

/** A mutable Essence balance (the C++ int& out-parameter). */
const W = (v: number): { value: number } => ({ value: v });

// The mechanic tests run on the COARSE ranks (defaultEssenceConfig(1)); the fine ranks have their own tests.
const Coarse = (): EssenceConfig => defaultEssenceConfig(1);
const CoarseRun = (): RunConfig => ({ ...defaultRunConfig(), essence: Coarse() });

function TestConfig(): EssenceConfig {
  const c = Coarse();
  c.stats.push(makeStatDef({ name: 'DefensePct', stat: StatId.DefensePercent, tier: 1, maxRank: 5, bonusPerRank: 0.05 }));
  return c;
}
function MakeSidebar(): EssenceSidebar {
  const s = new EssenceSidebar(TestConfig());
  s.reset(['Warrior', 'Mage']);
  return s;
}

describe('essence', () => {
  it('costs_per_rank_start_at_20_and_grow_15_percent', () => {
    const d = Coarse().find('Health')!;
    CHECK(d.baseCost === 20);
    NEAR(d.growth, 0.15, 1e-12);
    const expect = [20, 23, 26, 30, 35, 40, 46, 53, 61, 70];
    for (let n = 0; n < 10; ++n) CHECK(EssenceSidebar.rankCost(d, n) === expect[n], `rank ${n}`);
    const s = MakeSidebar();
    CHECK(s.nextCost(0, 'Health') === 20);
    const e = W(1000);
    s.buy(0, 'Health', 1, e);
    CHECK(s.nextCost(0, 'Health') === 23 && e.value === 980);
  });

  it('costs_match_stat_def_csv', () => {
    const cfg = Coarse();
    const before = cfg.clone();
    CHECK(applyStatDefCsv(cfg, StatDefCsv) === 4);
    for (let i = 0; i < cfg.stats.length; ++i) {
      CHECK(cfg.stats[i].baseCost === before.stats[i].baseCost);
      NEAR(cfg.stats[i].growth, before.stats[i].growth, 1e-9);
    }
  });

  it('fine_ranks_are_a_tenth_of_the_old_ones_with_the_same_total_power', () => {
    const fine = defaultEssenceConfig();
    const old = Coarse();
    CHECK(kEssenceRankScale === 10 && fine.rankScale === 10 && old.rankScale === 1);
    for (let i = 0; i < fine.stats.length; ++i) {
      const f = fine.stats[i];
      const o = old.stats[i];
      CHECK(f.maxRank === o.maxRank * 10 && f.maxRank >= 100);
      NEAR(f.bonusPerRank * 10.0, o.bonusPerRank, 1e-12);
      NEAR(f.maxRank * f.bonusPerRank, o.maxRank * o.bonusPerRank, 1e-9);
      CHECK(f.baseCost * 10 === o.baseCost && Math.abs(f.growth * 10.0 - o.growth) < 1e-12);
      let totalFine = 0;
      let totalOld = 0;
      for (let n = 0; n < f.maxRank; ++n) {
        const c = EssenceSidebar.rankCost(f, n);
        CHECK(c >= 1 && c < 100000);
        totalFine += c;
      }
      for (let n = 0; n < o.maxRank; ++n) totalOld += EssenceSidebar.rankCost(o, n);
      CHECK(totalFine >= totalOld && totalFine <= totalOld * 1.25);
      for (let dec = 0; dec < 10; ++dec) {
        let decade = 0;
        for (let n = dec * 10; n < dec * 10 + 10; ++n) decade += EssenceSidebar.rankCost(f, n);
        const ratio = decade / EssenceSidebar.rankCost(o, dec);
        CHECK(ratio >= 0.95 && ratio <= 1.25);
      }
    }
  });

  it('fine_ranks_make_hundreds_of_upgrades_affordable', () => {
    const s = new EssenceSidebar(defaultEssenceConfig());
    s.reset(['Warrior', 'Mage', 'Priest']);
    const e = W(1500);
    const stats = ['Damage', 'AttackSpeed', 'Health', 'Threat'];
    let any = true;
    while (any) {
      any = false;
      for (let ch = 0; ch < 3; ++ch) for (const st of stats) if (s.buy(ch, st, 1, e).bought > 0) any = true;
    }
    CHECK(s.totalRanks() >= 300);
    const rich = W(100000);
    const all = new EssenceSidebar(defaultEssenceConfig());
    all.reset(['Warrior', 'Mage', 'Priest']);
    let bought = 0;
    for (let ch = 0; ch < 3; ++ch) for (const st of stats) bought += all.buy(ch, st, kBuyMax, rich).bought;
    CHECK(bought === 1000 && all.totalRanks() === 1000);
    CHECK(all.buy(0, 'Health', 1, rich).refusal === BuyRefusal.MaxRank);
    CHECK(all.nextCost(0, 'Health') === 0);
    const one = new EssenceSidebar(defaultEssenceConfig());
    one.reset(['Warrior']);
    const e2 = W(100000);
    one.buy(0, 'Damage', 60, e2);
    CHECK(one.rank(0, 'Damage') === 60 && one.nextCost(0, 'Health') === 2 && one.nextCost(0, 'Damage') > 2);
    for (const r of one.rows(0, e2.value)) {
      if (r.stat !== 'Damage') continue;
      NEAR(r.currentBonus, 0.6, 1e-9);
      NEAR(r.nextBonus, 0.61, 1e-9);
      CHECK(r.maxRank === 100);
    }
    one.buy(0, 'Damage', kBuyMax, e2);
    const r = new StatResolver();
    r.setBase(StatId.Damage, 10.0);
    one.applyTo(0, r);
    NEAR(r.get(StatId.Damage), 20.0, 1e-9);
  });

  it('fine_ranks_scale_the_stat_def_csv_numbers', () => {
    const cfg = defaultEssenceConfig();
    CHECK(applyStatDefCsv(cfg, StatDefCsv) === 4);
    for (const d of cfg.stats) CHECK(d.baseCost === 2 && Math.abs(d.growth - 0.015) < 1e-12 && d.maxRank === 100);
    const csv = 'Name,Tier,AllowedClasses,EssenceBaseCost,EssenceCostGrowth,GoldUnlockCost,MaxRank,BonusPerRank,Cap\n' +
      'Health,0,All,30,0.20,0,8,5,-1\n';
    applyStatDefCsv(cfg, csv);
    const h = cfg.find('Health')!;
    CHECK(h.baseCost === 3 && Math.abs(h.growth - 0.02) < 1e-12 && h.maxRank === 80 && Math.abs(h.bonusPerRank - 0.005) < 1e-12);
    const coarse = Coarse();
    applyStatDefCsv(coarse, csv);
    CHECK(coarse.find('Health')!.baseCost === 30 && coarse.find('Health')!.maxRank === 8);
  });

  it('growth_is_per_stat_and_per_character', () => {
    const s = MakeSidebar();
    const e = W(10000);
    s.buy(0, 'Health', 3, e);
    CHECK(s.nextCost(0, 'Health') === 30);
    CHECK(s.nextCost(0, 'Damage') === 20);
    CHECK(s.nextCost(1, 'Health') === 20);
  });

  it('buy_amounts_x1_x10_x100_and_max', () => {
    const s = MakeSidebar();
    const e = W(100000);
    let r = s.buy(0, 'Damage', 1, e);
    CHECK(r.bought === 1 && r.spent === 20 && r.newRank === 1 && r.refusal === BuyRefusal.None);
    r = s.buy(0, 'Damage', 10, e);
    CHECK(r.bought === 9 && s.rank(0, 'Damage') === 10);
    let sum = 0;
    for (let n = 0; n < 10; ++n) sum += EssenceSidebar.rankCost(s.config().find('Damage')!, n);
    CHECK(100000 - e.value === sum);
    r = s.buy(1, 'Health', 100, e);
    CHECK(r.bought === 10 && s.rank(1, 'Health') === 10);
    r = s.buy(1, 'Damage', kBuyMax, e);
    CHECK(r.bought === 10);
  });

  it('partial_affordability', () => {
    const s = MakeSidebar();
    const e = W(20 + 23 + 26 + 29);
    let r = s.buy(0, 'Health', 10, e);
    CHECK(r.bought === 3 && r.spent === 69 && e.value === 29 && r.newRank === 3);
    e.value = 20 + 23 + 26 + 30 + 35 + 5;
    r = s.buy(0, 'Damage', kBuyMax, e);
    CHECK(r.bought === 5 && e.value === 5);
    const p = s.preview(1, 'Damage', 10, 70);
    CHECK(p.bought === 3 && s.rank(1, 'Damage') === 0);
  });

  it('refusals_with_reasons', () => {
    const s = MakeSidebar();
    const e = W(5);
    let r = s.buy(0, 'Health', 1, e);
    CHECK(r.bought === 0 && e.value === 5 && r.refusal === BuyRefusal.NotEnoughEssence && r.reason !== '');
    e.value = 100000;
    s.buy(0, 'Health', kBuyMax, e);
    const left = e.value;
    r = s.buy(0, 'Health', 1, e);
    CHECK(r.refusal === BuyRefusal.MaxRank && e.value === left && r.reason !== '');
    CHECK(s.buy(5, 'Health', 1, e).refusal === BuyRefusal.NoCharacter);
    CHECK(s.buy(0, 'Nonsense', 1, e).refusal === BuyRefusal.UnknownStat);
    CHECK(s.buy(0, 'Health', 0, e).refusal === BuyRefusal.BadAmount);
    CHECK(s.buy(1, 'Threat', 1, e).refusal === BuyRefusal.NotAllowedForClass);
    CHECK(s.buy(0, 'Threat', 1, e).bought === 1);
  });

  it('tier_lock_and_class_allow_list', () => {
    const s = MakeSidebar();
    const e = W(100000);
    CHECK(s.isUnlocked('Damage') && !s.isUnlocked('DefensePct'));
    const r = s.buy(0, 'DefensePct', 1, e);
    CHECK(r.refusal === BuyRefusal.StatLocked && e.value === 100000);
    s.setUnlockedStats(['DefensePct']);
    CHECK(s.buy(0, 'DefensePct', 2, e).bought === 2);
    s.setClassAllowedStats(new Map([['Mage', ['Damage', 'Health']]]));
    CHECK(s.buy(1, 'DefensePct', 1, e).refusal === BuyRefusal.NotAllowedForClass);
    CHECK(s.buy(1, 'AttackSpeed', 1, e).refusal === BuyRefusal.NotAllowedForClass);
    CHECK(s.buy(1, 'Damage', 1, e).bought === 1);
    s.setClassAllowedStats(classAllowedStats(g_data));
    CHECK(s.availability(0, 'Threat') === BuyRefusal.None);
    CHECK(s.availability(1, 'Threat') === BuyRefusal.NotAllowedForClass);
    for (const st of ['Damage', 'AttackSpeed', 'Health']) CHECK(s.availability(1, st) === BuyRefusal.None, st);
    const s2 = MakeSidebar();
    const rows = s2.rows(1, 1000);
    let sawLocked = false;
    let sawThreat = false;
    for (const row of rows) {
      if (row.stat === 'DefensePct') sawLocked = !row.unlocked && !row.canBuy;
      if (row.stat === 'Threat') sawThreat = true;
    }
    CHECK(sawLocked && !sawThreat && rows.length === 4);
  });

  it('rows_describe_rank_cost_and_bonus', () => {
    const s = MakeSidebar();
    const e = W(1000);
    s.buy(0, 'Damage', 2, e);
    for (const r of s.rows(0, e.value)) {
      if (r.stat !== 'Damage') continue;
      CHECK(r.rank === 2 && r.maxRank === 10 && r.nextCost === 26);
      NEAR(r.currentBonus, 0.2, 1e-9);
      NEAR(r.nextBonus, 0.3, 1e-9);
      CHECK(r.canBuy);
    }
    CHECK(s.rows(0, 3)[0].canBuy === false);
    CHECK(s.rows(0, 3)[0].reason === 'Not enough Essence');
  });

  it('ranks_apply_as_essence_percent_modifiers', () => {
    const s = MakeSidebar();
    const e = W(1000);
    s.buy(0, 'Damage', 3, e);
    const r = new StatResolver();
    r.setBase(StatId.Damage, 10.0);
    s.applyTo(0, r);
    CHECK(r.modifierCountForSource(ModSource.Essence) === 1);
    NEAR(r.get(StatId.Damage), 13.0, 1e-9);
    s.applyTo(0, r);
    CHECK(r.modifierCountForSource(ModSource.Essence) === 1);
    NEAR(r.get(StatId.Damage), 13.0, 1e-9);
    s.applyTo(1, r);
    CHECK(r.modifierCountForSource(ModSource.Essence) === 0);
  });

  it('upgrades_change_the_units_in_a_fight', () => {
    const a = new CombatSim(g_data, 7);
    const b = new CombatSim(g_data, 7);
    a.addPartyUnit('Warrior');
    a.addPartyUnit('Mage');
    b.addPartyUnit('Warrior');
    b.addPartyUnit('Mage');
    const sb = MakeSidebar();
    const e = W(100000);
    sb.buy(0, 'Health', 4, e);
    sb.buy(1, 'Damage', 5, e);
    const hp0 = a.maxHp(a.getUnits()[0]);
    const dmg1 = a.getUnits()[1].stats.get(StatId.Damage);
    applyEssenceToSim(b, sb);
    NEAR(b.maxHp(b.getUnits()[0]), hp0 * 1.4, 1e-6);
    NEAR(b.getUnits()[1].stats.get(StatId.Damage), dmg1 * 1.5, 1e-6);
    NEAR(b.getUnits()[0].hp, b.maxHp(b.getUnits()[0]), 1e-6);
    NEAR(b.getUnits()[1].hp, b.maxHp(b.getUnits()[1]), 1e-6);
    const w = b.mutableUnit(0)!;
    w.hp = 100.0;
    sb.buy(0, 'Health', 1, e);
    const before = b.maxHp(w);
    applyEssenceToSim(b, sb);
    NEAR(w.hp, 100.0 + (b.maxHp(w) - before), 1e-6);
    for (let i = 0; i < 6; ++i) {
      a.addEnemy('Grunt', 1);
      b.addEnemy('Grunt', 1);
    }
    a.startFight();
    a.runToEnd();
    b.startFight();
    b.runToEnd();
    CHECK(b.getTime() < a.getTime());
  });

  it('a_purchase_applies_to_a_running_fight', () => {
    const s = new CombatSim(g_data, 3);
    s.addPartyUnit('Warrior');
    s.addPartyUnit('Mage');
    for (let i = 0; i < 4; ++i) s.addEnemy('Grunt', 1);
    s.startFight();
    for (let i = 0; i < 60; ++i) s.step();
    CHECK(kEssenceAppliesToRunningFight);
    const dmg = s.getUnits()[0].stats.get(StatId.Damage);
    const sb = MakeSidebar();
    const e = W(1000);
    sb.buy(0, 'Damage', 2, e);
    applyEssenceToSim(s, sb);
    NEAR(s.getUnits()[0].stats.get(StatId.Damage), dmg * 1.2, 1e-6);
  });

  it('flow_spends_run_essence_and_tracks_earned', () => {
    const flow = new RunFlow(CoarseRun());
    flow.setEssenceContext([], classAllowedStats(g_data));
    flow.start(5, false);
    CHECK(flow.getSidebar().characterCount() === 2);
    CHECK(flow.buyEssence(0, 'Health', 1).refusal === BuyRefusal.NotEnoughEssence);
    for (let i = 0; i < 4; ++i) flow.onEnemyKilled();
    CHECK(flow.getRun().essence === 20);
    const r = flow.buyEssence(0, 'Health', 1);
    CHECK(r.bought === 1 && flow.getRun().essence === 0 && flow.getEssenceSpent() === 20 && flow.getEssenceEarned() === 20);
    flow.abandon();
    CHECK(flow.getResults().essenceEarned === 20);
    CHECK(flow.buyEssence(0, 'Health', 1).refusal === BuyRefusal.NoCharacter);
  });

  it('ranks_reset_every_run_and_essence_does_not_carry_over', () => {
    const flow = new RunFlow(CoarseRun());
    flow.start(5, false);
    for (let i = 0; i < 40; ++i) flow.onEnemyKilled();
    flow.buyEssence(0, 'Health', 3);
    flow.buyEssence(1, 'Damage', 2);
    CHECK(flow.getSidebar().totalRanks() === 5);
    flow.abandon();
    flow.start(6, false);
    CHECK(flow.getSidebar().totalRanks() === 0 && flow.getRun().essence === 0 && flow.getEssenceSpent() === 0);
    CHECK(flow.getSidebar().nextCost(0, 'Health') === 20);
  });

  it('a_character_that_joins_mid_run_starts_with_zero_ranks', () => {
    const flow = new RunFlow(CoarseRun());
    flow.setEssenceContext([], classAllowedStats(g_data));
    flow.start(2, false);
    for (let i = 0; i < 100; ++i) flow.onEnemyKilled();
    flow.buyEssence(0, 'Health', 2);
    const bot = new RunBot();
    for (let steps = 0; flow.active() && steps < 5000 && !flow.partyHasPriest(); ++steps) {
      if (flow.fightPending()) {
        const sp = flow.pendingFightSpec();
        for (let i = 0; i < sp.enemies.length + sp.waveEnemies.length; ++i) flow.onEnemyKilled();
        flow.onFightFinished(FightResult.Won);
        continue;
      }
      const c = bot.choose(flow, 1.0);
      if (c.teleport) flow.teleport();
      else if (c.node >= 0) flow.travel(c.node);
      else break;
    }
    CHECK(flow.partyHasPriest());
    CHECK(flow.getSidebar().characterCount() === 3 && flow.getSidebar().className(2) === 'Priest');
    CHECK(flow.getSidebar().rank(2, 'Health') === 0 && flow.getSidebar().rank(0, 'Health') === 2);
  });

  it('a_priest_unlocked_run_has_three_characters_from_the_start', () => {
    const flow = new RunFlow(CoarseRun());
    flow.start(2, true);
    CHECK(flow.getSidebar().characterCount() === 3);
  });

  it('meta_unlocked_stats_round_trip_and_reset', () => {
    const m = makeMeta();
    CHECK(m.unlockedStats.length === 0);
    m.unlockedStats = ['DefensePct', 'CritChance'];
    const p = parseMeta(serializeMeta(m));
    CHECK(p.ok && metaEquals(p.meta, m) && p.meta.unlockedStats.length === 2);
    const s = new EssenceSidebar(TestConfig());
    s.reset(['Warrior']);
    s.setUnlockedStats(p.meta.unlockedStats);
    CHECK(s.isUnlocked('DefensePct') && s.isUnlocked('Damage'));
    resetProgress(m);
    CHECK(m.unlockedStats.length === 0);
    CHECK(parseMeta('TolMeta=1\ngold=5\n').meta.unlockedStats.length === 0);
  });

  it('tier1_stats_are_locked_until_unlocked_and_apply_flat_bonuses', () => {
    const cfg = shippedEssenceConfig();
    CHECK(cfg.find('Damage') && cfg.find('CritChance') && cfg.find('HealPower') && cfg.find('SpiritDuration'));
    CHECK(cfg.find('CritChance')!.tier === 1 && cfg.find('CritChance')!.kind === ModKind.Flat);
    const s = new EssenceSidebar(cfg);
    s.reset(['Warrior', 'Mage', 'Priest']);
    const e = W(100000);
    CHECK(s.buy(0, 'CritChance', 1, e).refusal === BuyRefusal.StatLocked && e.value === 100000);
    s.setUnlockedStats(['CritChance', 'HealPower', 'DefensePct', 'HealthRegen', 'Range', 'SpiritDamage']);
    CHECK(s.buy(0, 'CritChance', 10, e).bought === 10);
    CHECK(s.buy(2, 'CritChance', 1, e).refusal === BuyRefusal.NotAllowedForClass);
    CHECK(s.buy(2, 'HealPower', 20, e).bought === 20);
    CHECK(s.buy(0, 'HealPower', 1, e).refusal === BuyRefusal.NotAllowedForClass);
    CHECK(s.buy(0, 'SpiritDamage', 1, e).refusal === BuyRefusal.NotAllowedForClass);
    CHECK(s.buy(1, 'Range', 4, e).bought === 4);
    CHECK(s.buy(0, 'DefensePct', 5, e).bought === 5 && s.buy(0, 'HealthRegen', 3, e).bought === 3);
    const w = new StatResolver();
    w.setBase(StatId.CritChance, 0.0);
    w.setBase(StatId.DefensePercent, 40.0);
    w.setBase(StatId.HealthRegen, 0.0);
    s.applyTo(0, w);
    NEAR(w.get(StatId.CritChance), 0.05, 1e-9);
    NEAR(w.get(StatId.DefensePercent), 41.0, 1e-9);
    NEAR(w.get(StatId.HealthRegen), 0.3, 1e-9);
    const p = new StatResolver();
    p.setBase(StatId.HealPower, 0.0);
    s.applyTo(2, p);
    NEAR(p.get(StatId.HealPower), 0.2, 1e-9);
    const m = new StatResolver();
    m.setBase(StatId.Range, 300.0);
    s.applyTo(1, m);
    NEAR(m.get(StatId.Range), 310.0, 1e-9);
    for (const r of s.rows(0, e.value)) {
      if (r.stat === 'HealthRegen') {
        CHECK(r.unit === ' HP/s');
        NEAR(r.currentBonus, 0.3, 1e-9);
        NEAR(r.nextBonus, 0.4, 1e-9);
      }
      if (r.stat === 'Damage') CHECK(r.unit === '');
    }
    CHECK(defaultEssenceConfig().stats.length === 4 && cfg.stats.length === 13);
  });

  const Play = (seed: number, spend: boolean, priest: boolean): RunSimResult => {
    const meta = makeMeta();
    meta.priestUnlocked = priest;
    return simulateBotRun(g_data, meta, makeRunSimOptions({ seed, botSpendsEssence: spend }));
  };

  it('bot_spending_option_and_determinism', () => {
    const off = Play(4, false, false);
    CHECK(off.ranksBought === 0 && off.essenceSpent === 0);
    const a = Play(4, true, false);
    const b = Play(4, true, false);
    CHECK(a.log.join('\n') === b.log.join('\n') && a.ranksBought === b.ranksBought);
    CHECK(a.results.essenceEarned >= a.essenceSpent);
    if (a.results.essenceEarned >= 20) CHECK(a.ranksBought >= 1);
    const flow = new RunFlow(CoarseRun());
    flow.start(1, false);
    for (let i = 0; i < 6; ++i) flow.onEnemyKilled();
    const bot = new RunBot();
    bot.spendEssence = true;
    CHECK(bot.spend(flow) === 1);
    CHECK(flow.getSidebar().rank(0, 'Health') === 1 && flow.getRun().essence === 10);
    CHECK(bot.spend(flow) === 0);
    const idle = new RunBot();
    CHECK(idle.spend(flow) === 0);
  });

  // The C++ main() prints the bot distribution over 20 seeds (real combat). These are the native lines (tests\essence\tests.exe on
  // this data, Nov 18): the port must reproduce them exactly, which covers RunFlow, RunAuto, RunBot, the sidebar and CombatSim together.
  const kNativeDistribution = [
    'bot 20 seeds, first run Warrior+Mage, no spending: wipes 20 wins 0, avg rooms cleared 16.95, avg ranks 0.0, avg essence spent 0; floors: F1 x1 F2 x8 F3 x9 F4 x2',
    'bot 20 seeds, first run Warrior+Mage, spending: wipes 20 wins 0, avg rooms cleared 21.35, avg ranks 94.3, avg essence spent 532; floors: F2 x7 F3 x8 F4 x3 F5 x2',
    'bot 20 seeds, Priest unlocked, no spending: wipes 20 wins 0, avg rooms cleared 29.80, avg ranks 0.0, avg essence spent 0; floors: F2 x1 F3 x13 F4 x6',
    'bot 20 seeds, Priest unlocked, spending: wipes 20 wins 0, avg rooms cleared 31.90, avg ranks 155.8, avg essence spent 883; floors: F2 x1 F3 x12 F4 x7',
  ];
  it('bot_distribution_matches_native', () => {
    const lines: string[] = [];
    for (let priest = 0; priest < 2; ++priest) {
      for (let spend = 0; spend < 2; ++spend) {
        const floors = new Map<number, number>();
        let wipes = 0;
        let wins = 0;
        let rooms = 0;
        let spent = 0;
        let ranks = 0;
        for (let seed = 1; seed <= 20; ++seed) {
          const r = Play(seed, spend !== 0, priest !== 0);
          floors.set(r.results.floorReached, (floors.get(r.results.floorReached) ?? 0) + 1);
          rooms += r.results.roomsCleared;
          spent += r.essenceSpent;
          ranks += r.ranksBought;
          if (r.results.outcome === RunOutcome.Wiped) ++wipes;
          else if (r.results.outcome === RunOutcome.Victory) ++wins;
        }
        const fl = [...floors.keys()].sort((x, y) => x - y).map((k) => ` F${k} x${floors.get(k)}`).join('');
        lines.push(`bot 20 seeds, ${priest ? 'Priest unlocked' : 'first run Warrior+Mage'}, ${spend ? 'spending' : 'no spending'}: ` +
          `wipes ${wipes} wins ${wins}, avg rooms cleared ${fmtF(rooms / 20, 2)}, avg ranks ${fmtF(ranks / 20, 1)}, ` +
          `avg essence spent ${fmtF(spent / 20, 0)}; floors:${fl}`);
      }
    }
    for (let i = 0; i < 4; ++i) CHECK(lines[i] === kNativeDistribution[i], `${lines[i]}\n  !=\n${kNativeDistribution[i]}`);
  }, 600_000);
});
