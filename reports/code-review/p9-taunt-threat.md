# Code review: Taunt raises threat to highest +1 (Nov 20)

The director asked (Nov 20) for Taunt to put the Warrior at each enemy's highest threat +1 **and** force every enemy to attack the
Warrior for the Taunt duration.

Scope:
- `data/AbilityData.csv`: Taunt EffectIds `Taunt_3|Taunt_2` became `Taunt_3|Taunt_1|Taunt_2`.
- `data/AbilityEffectData.csv`: `Taunt_1` Value 100 became 1.
- `src/core/heroSheet.ts`: the Taunt description.
- Tests:
  - `src/core/combatTestKit.ts` gains `unrealTauntData`.
  - `combatGolden.test.ts`, `autoRun.test.ts`, `autoRun.parity.test.ts`, `run.test.ts` and `essence.test.ts` now use `unrealTauntData`.
  - `combat.test.ts`, `combatRules.test.ts` and `units/warrior.test.ts` are updated.

No combat code changed. `Taunt_1` is the existing `AddThreat` effect: "raise the caster's threat on each enemy to its current highest
plus Value". It was dropped from Taunt on Nov 12 but kept in data and tests.

Lenses: rules, correctness.

## Result

No BLOCKING or MAJOR findings.

## Rules lens

- **Highest +1.** `AddThreat` reads the largest entry in each enemy's threat table, including the Warrior's own, and sets the Warrior to
  that + Value. If the Warrior already leads, they gain exactly +1. The new test
  `WarriorTauntRaisesThreatToEachEnemysHighestPlusOne` checks this on three enemies with different tables, and checks that the Mage's
  threat is unchanged.
- **Forced targeting for the duration** is unchanged (`Taunt_3`, 4 s). The effect order is the forced attack, then the threat raise,
  then the damage reduction, all in one cast.
- **After the forced attack ends,** enemies stay on the Warrior until someone out-threats the +1 lead. The Warrior test that used to
  expect the enemies to return to the Mage now expects them to stay. Tested.
- **Enemies that spawn during the taunt** are forced onto the Warrior, but they did not get the threat raise. Only enemies alive at the
  cast are raised. That matches "for the duration" and is noted for the director.
- **The +1 is small.** One Mage bolt after the taunt ends can take an enemy back. This is by design: highest +1, as asked.

## Unreal parity

The golden combat scenarios and the exact Unreal soak and distribution tests were made with the Unreal-era Taunt. They now run on
`unrealTauntData`, which is the same data with only the Taunt row as Unreal had it. So they still prove the rules engine matches the
C++ build. The new Taunt is covered by its own tests.

The C++ reference repo is not changed. The C++ build's Taunt now differs from this build's, by data only.

## Balance (for the director)

The same tests, run with the new Taunt:

| Measure | Old Taunt | New Taunt |
|---|---|---|
| First runs, Warrior+Mage, 20 seeds: average rooms cleared | 12.75 | 16.95 |
| First runs, Warrior+Mage, 20 seeds: floors reached | F1 1, F2 12, F3 3, F4 4 | F1 1, F2 8, F3 9, F4 2 |
| Bot runs: average gold | 181 | 240 |
| Bot runs: average fights | 13.8 | 17.9 |
| Rescue fight wins, carried HP 40–100% | 84% | 92% |
| Rescue fight wins, carried HP 20–60% | 68% | 84% |

In a 60-run `npm run soak` (mult 1.3, cast times on), the floor distribution was the same as before (F1 38%, F2 55%, F3+ 7%). Best
floor was 4 instead of 3, and the first run to reach floor 3 was run 9 instead of run 11.

The early game gets easier mostly because the party survives longer per run. There is no change to the enemies.

## Verified

- `npm test`: 603 passed, 2 skipped (25 files).
- `npm run lint` and the typecheck pass.
