// Testing-menu multipliers added Nov 22: the Priest's heal on its own, and ability cast time.
import { describe, it } from 'vitest';
import { CombatSim, defaultCombatConfig } from './combatSim';
import { installShippedCastTimes } from './castTimes';
import { CHECK, Dummy, Freeze, Place, StepSeconds, data } from './combatTestKit';

describe('tuning multipliers', () => {
  it('healMult scales only the Priest heal', () => {
    const heal = (mult: number): number => {
      const cfg = defaultCombatConfig();
      installShippedCastTimes(cfg);
      cfg.autoHealMult.set('Priest', mult);
      const s = new CombatSim(data, 3, cfg);
      const p = s.addPartyUnit('Priest');
      const w = s.addPartyUnit('Warrior');
      Freeze(s, p); Freeze(s, w);
      Place(s, p, 0, 0); Place(s, w, 100, 0);
      Dummy(s, 'Grunt', 800, 0);
      s.startFight();
      s.mutableUnit(w)!.hp = s.maxHp(s.getUnit(w)!) * 0.3;
      let total = 0;
      s.getBus().subscribe('HealApplied', (e) => { if (e.source === p) total += e.effectiveAmount; });
      StepSeconds(s, 2.5);
      return total;
    };
    const a = heal(1), b = heal(2);
    CHECK(a > 0 && b > a * 1.5, `heal ${a} vs ${b}`);
  });
  it('abilityCastMult stretches an ability cast time', () => {
    const t = (mult: number): number => {
      const cfg = defaultCombatConfig();
      installShippedCastTimes(cfg);
      cfg.abilityCastMult.set('Fireball', mult);
      const s = new CombatSim(data, 3, cfg);
      const m = s.addPartyUnit('Mage');
      Freeze(s, m);
      Place(s, m, 0, 0);
      Dummy(s, 'Grunt', 400, 0);
      s.startFight();
      let at = -1;
      s.getBus().subscribe('AbilityCast', (e) => { if (e.caster === m && e.abilityId === 'Fireball' && at < 0) at = s.getTime(); });
      for (let i = 0; i < 60 * 30 && at < 0; ++i) s.step();
      return at;
    };
    const fast = t(0.5), slow = t(2);
    CHECK(fast > 0 && slow > fast + 0.5, `fireball lands at ${fast} vs ${slow}`);
  });
});
