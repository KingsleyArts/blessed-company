// RunBot port (Core/RunBot.h): deterministic auto-player, a thin wrapper over chooseAuto, plus the optional Essence spending
// heuristic (a cycle of (class, stat) targets, one rank at a time, waiting when the target is not affordable yet).
import { BuyRefusal } from './essenceSidebar';
import { AutoAction, AutoReason, chooseAuto, defaultAutoParams, type AutoMode, type AutoParams } from './runAuto';
import type { RunFlow } from './runFlow';

export interface BotChoice {
  teleport: boolean;
  /** Adjacent room to walk to; -1 with teleport false means "nothing to do". */
  node: number;
  target: number;
  reason: AutoReason;
}

export class RunBot {
  params: AutoParams = defaultAutoParams();
  spendEssence = false;
  spendCycle: Array<[string, string]> = [
    ['Warrior', 'Health'], ['Mage', 'Damage'], ['Warrior', 'AttackSpeed'], ['Mage', 'AttackSpeed'],
    ['Priest', 'Health'], ['Warrior', 'Damage'], ['Mage', 'Health'], ['Priest', 'Damage'],
  ];
  private cursor = 0;

  /** The seed is unused (the decision is deterministic); kept for the C++ call sites. */
  constructor(seed: bigint | number = 0) {
    void seed;
  }

  choose(flow: RunFlow, partyHpFraction: number, mode?: AutoMode): BotChoice {
    const d = chooseAuto(flow, partyHpFraction, this.params, mode);
    const c: BotChoice = { teleport: d.action === AutoAction.Teleport, node: -1, target: -1, reason: d.reason };
    if (d.action === AutoAction.Move) {
      c.node = d.step;
      c.target = d.target;
    }
    return c;
  }

  /** Returns the number of ranks bought. Call it right after a won fight. */
  spend(flow: RunFlow): number {
    if (!this.spendEssence || this.spendCycle.length === 0 || !flow.active()) return 0;
    let bought = 0;
    let skipped = 0;
    for (let guard = 0; guard < 2000 && skipped <= this.spendCycle.length; ++guard) {
      const [cls, stat] = this.spendCycle[this.cursor % this.spendCycle.length];
      const ch = flow.getRun().party.indexOf(cls);
      if (ch < 0) {
        ++this.cursor;
        ++skipped;
        continue;
      }
      const r = flow.buyEssence(ch, stat, 1);
      if (r.bought > 0) {
        ++this.cursor;
        ++bought;
        skipped = 0;
        continue;
      }
      if (r.refusal === BuyRefusal.NotEnoughEssence) break;
      ++this.cursor;
      ++skipped;
    }
    return bought;
  }
}
