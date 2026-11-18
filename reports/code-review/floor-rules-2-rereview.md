# Re-review: floor-rules-2 fix round (d40424a), correctness lens

Verdict: merge (no BLOCKING, no MAJOR).

Method: read the diff a31a91c..origin/floor-rules-2, built and ran every native suite with g++ (resolver with data/ClassData.csv, floor, run, essence, combat, ui, all 8 units/*): all pass. Ran the floor generator under ASan+UBSan with roomCountMin/Max up to 1000, rescueFloor==tutorialFloor==1, with and without Priest, 300 seeds x 3 floors, normal path and layoutAttempts=0 (fallback staircase): no errors, no empty floors. Unreal not buildable here; RunManager reviewed read-only.

## ExitRoomRevive (Core/RunSim.h)
- Unconditional revive of dead party units at kReviveHp=1. Skips enemies, summons (Spirit) and removed units. Matches the director's rule.
- Living units untouched (test sets Warrior to 5 HP and checks it stays 5).
- Double entry: second call returns 0 (tested). No Priest in party: works the same. Boss floors other than 10: the function has no floor condition, and Exit is only reported by RunFlow after the boss is dead, so fine.
- Non-boss rooms never call it (RunSim.h bot and RunManager only on EntryKind::Exit).

## RunManager Exit handling
- Order is right: ExitRoomRevive on the sim first, then M->PostWinRevive() only to trigger SyncActors. After the Exit revive all party members are alive, so Sim::PostWinRevive's ReviveDeadParty revives 0 and heals nobody. It only revives if state is Won, and nobody can die between the boss win and the Exit, so it cannot revive or heal anyone unintended. It touches no Essence or Gold (those are paid by RunFlow on events), so no double count. If state is not Won it returns 0 and SyncActors still runs.
- MINOR 1 (RunManager.cpp:591-592): the revive is not written to the combat log (CombatSim::ReviveDeadParty calls Note, the new loop does not), and revived units keep stale per-fight fields (target, retreating, timers). Harmless because PrepareNextFight resets them before the next fight, but a debug log of "Exit room revive" would be consistent.
- MINOR 2 (Core/RunFlow.h:6-8 header comment): still says the caller "revives the fallen if the Priest is alive". Stale against the new rule. Comment only.
- MINOR 3 (RunManager.cpp:592): the PostWinRevive call is a re-sync hack that relies on SyncActors being called inside it. Works, but a dedicated ACombatManager sync wrapper would be cleaner (Combat/ is not this agent's file, so it was reasonably left).

## kMaxRoll = 40 vs the 96 grid
Start is at cell 48. Layout growth keeps nonDeadEnds <= roll (look-ahead), and every cell is within roll+1 steps of the start (rescue: start dead end, rescue room at +1, then up to 39 more, then one cap), so the farthest cell is at distance <= 41 < 48. The fallback staircase is 40 rooms alternating E/S, ending at most 21 cells from the centre in one axis. Confirmed by the sanitizer run above with roll forced to 40. rollMin is clamped too, so min>max is impossible. No finding.

## Rescue beats tutorial
`tutorial` now includes `&& !rescueLayout`. Tested with rescueFloor==tutorialFloor==1 (the new floor test passes; my sweep also generated cleanly): the rescue floor keeps its Elite plus wave and is not marked isTutorial. Floor 1 without a Priest and rescueFloor != 1 is unchanged. No finding.

## Are the rewritten tests non-vacuous?
Mutations on a copy (scratchpad): (a) ExitRoomRevive as a no-op: tests/run reports 4 FAILED. (b) ExitRoomRevive reverted to the old `return sim.PostWinRevive()`: 4 FAILED. So the Priest-dead and Priest-and-Mage-dead cases genuinely exercise the new behaviour. The fixture asserts the preconditions (Won state, who is dead) before the revive, so it cannot pass vacuously by nobody dying. Wipe case (4) checks Travel to the Exit is Rejected and the run is inactive.

## Other changes
- EssenceConfig.h comment only (documents the integer-cost staircase); no code change.
- Elite counting comment in FloorGenerator.h matches "each Elite counts 1 kill"; no counting change.

## Doc questions
None.
