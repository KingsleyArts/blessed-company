# Review: floor-rules-2 (705a432), Exit revive at 20% with full transient reset
Lenses: correctness + rules + ownership, one pass. Diff 266f976..origin/floor-rules-2.

Verdict: send back (one MAJOR: an unrequested behaviour change in existing fights). Everything else is sound.

## Tests run (g++ -O2, all from a clean worktree of 705a432)
floor, run (49863 checks), essence (575), ui, combat soak (47,462,170 checks), stat-resolver (data/ClassData.csv), tests/units/* (8 suites): ALL PASS.
Same suites on the base 266f976: all pass. Combat, floor, ui and stat output is byte-identical to base; run and essence output differ (see MAJOR 1).

## Findings

### MAJOR 1. ResetTransientState adds `u.goalTimer = 0.0` to PrepareNextFight, which changes every fight after the first
Core/CombatSim.h:416 (called from PrepareNextFight, :460). The old inline reset did not touch goalTimer, so a party unit carried its movement-goal timer from the last fight into the next. Now it restarts at 0, so the goal is recomputed on the very first tick of every later fight. This is not a "must not change behaviour" refactor. It alters movement timing, and so fight outcomes, for ALL units, including units that were never revived and the 1-HP Priest revive path the director said must stay unchanged.
Evidence: the seeded bot runs in tests/essence and tests/run changed:
- "Warrior+Mage, no spending": avg rooms cleared 41.95 -> 32.95; floors F1x1 F2x2 F3x1 F4x4 F5x5 F6x7 -> F1x1 F2x4 F3x5 F4x2 F5x2 F6x5 F8x1.
- "spending": wins 19 -> 18, avg ranks 693.1 -> 660.4.
- "Priest unlocked, no spending": floors shifted (avg fights 58.7 -> 61.0).
- No test asserts these numbers, so the suites still pass.
Proof of cause: on a scratch copy with only the goalTimer line removed, the essence and run bot outputs are byte-identical to base again. The rest of the refactor is neutral. Running sims and balance numbers (sim-balancer, G4 balance pass) would silently shift.
Fix: either drop goalTimer from the shared reset, or reset it only inside ReviveUnit. Alternatively get a director decision that "fresh" means goalTimer 0 in PrepareNextFight too; that is a design call, not a silent refactor, so it should be explicit. A freshly SPAWNED unit does have goalTimer 0, so the director's "match a freshly prepared unit" wording supports the revive-side reset; the fight-start side is what needs the decision.
The tauntLeft addition changes nothing (it is only set on enemies, which are discarded at PrepareNextFight).

### MINOR 1. The tests do not pin the literal 20%
tests/run/tests.cpp: `ExitHp()` is `kExitReviveHpFraction * MaxHp`, so the constant is compared against itself. Mutating kExitReviveHpFraction 0.20 -> 0.25 in RunSim.h passes all run tests. Add `CHECK(kExitReviveHpFraction == 0.20)` or an absolute expected HP (for example 20% of a known max).

### MINOR 2. Comment overstates "freshly prepared"
ReviveUnit leaves x/y where the unit died (PrepareNextFight resets position). Harmless because a PrepareNextFight always follows, but "indistinguishable apart from hp, alive and position" is accurate only for position. No action needed.

## Checked and OK
- ReviveUnit order: reset (buffs removed), then alive, then HP computed from MaxHp after the Buff clear, so a timed Buff cannot inflate it. min(MaxHp, 0.2*MaxHp) is safe. Health is clamped to at least 1, so HP never reaches 0. Essence is included (Essence modifier survives RemoveBySource(Buff); test adds +50 Essence).
- Excludes enemies, summons and retired (`removed`) units; returns false for living units. ExitRoomRevive collects ids first, then revives (no mutation during iteration). Idempotent (second call returns 0).
- Other units' `target == id` is cleared, and the other units' `threat[id]` is zeroed (bounds-checked). Deque units_ keeps ids as indices, so there is no invalidation.
- The combat-log Note is written per unit ("Exit room revive: <label> back at N HP").
- ResetTransientState vs the old inline reset: nothing the old code cleared is missing (target, hasGoal, timers, taunt, dmgReduction, lifesteal, buffRefs, retreating, tauntForced, extra timers, InitAbilityTimers, Buff modifiers, damageFrom, threat, tallies, kills). Nothing that should persist across fights is cleared: HP, alive, Essence, gear and position handling are untouched. Order of InitAbilityTimers before the Buff removal matches the old order. Deterministic: no RNG use.
- Post-win Priest revive (PostWinRevive, 1 HP, kReviveHp) untouched; dead Priest means no non-boss revive (unchanged, tested in (3)). Wipe never reaches Exit (RunFlow gate unchanged).
- Unreal side (read-only): RefreshActors() is a public inline wrapper over SyncActors(), which re-pushes HP, MaxHp and alive per unit (change-detected on Hp/bAlive, so the revived units do update, and a dead actor is un-hidden via SetSimState). The removed PostWinRevive() call there only did revive-nobody plus SyncActors, so nothing was lost. The Exit case has no other dependence on it. Kills/results use RunFlow's event counters, not Unit.kills/damageDone, so clearing the tallies at Exit does not affect the results screen. The only other PostWinRevive call is the normal win path (RunManager.cpp:696), unchanged. Not buildable here; no compile check of the Unreal files.
- Core/ includes no Unreal headers in the change.

## Doc question (not a finding)
After the BOSS fight, a living Priest runs the normal post-fight revive (RunManager.cpp:696), putting fallen allies at 1 HP; entering Exit then does not touch them because they are alive. Result: with a living Priest, a unit killed in the boss fight ends at 1 HP (and with no transient reset), while with a dead Priest it gets 20% and a full reset. Is that intended, or should the boss-fight post-win revive be skipped so Exit revives everyone at 20%? Tests only cover the Priest-dead and Priest-fallen cases. The director's text ("living units are not healed", "after a cleared room a living Priest revives at 1 HP") reads either way.

## Mutation check of the new tests (scratch copies in the scratchpad; repo untouched)
- ReviveUnit without ResetTransientState: 7 failures.
- HP fixed at 1: 5 failures.
- No Buff clear: fails (line 341).
- No target clear on others: fails (line 345).
- No threat-entry clear: fails (line 346).
- No ability-timer reset: fails (line 344).
- Fraction 0.25: NOT caught (MINOR 1).

## Ownership
Edits: Core/CombatSim.h and Combat/CombatManager.h (combat-programmer files; director-authorized; the CombatManager change is a 1-line public wrapper, minimal). Core/RunSim.h, Core/RunFlow.h (comment only) and Run/RunManager.cpp belong to the run-programmer; tests/run belongs to the run-programmer. Nothing else is touched. The CombatSim.h change exceeds the minimum only in that it refactors PrepareNextFight into the shared reset and thereby introduces MAJOR 1.
