# Code review: miracles between fights (`p6-miracles-between-fights`)

Date: Nov 19, 2026. Lenses: rules and correctness. Self-review by the orchestrator session, not an independent agent.

## The change

The director asked on Nov 19 that a miracle be usable outside combat whenever the gauge can pay for it. Unreal allows miracles only while a fight is running, so this is a director-approved rule change.

- **`src/core/combatSim.ts`**
  - New `miracleWindowOpen(kind, betweenFights)`.
  - `castMiracle` takes an optional `betweenFights` flag that defaults to false, so golden scenarios and bots behave exactly as before.
  - With the flag set, Healing and Shield also work when the fight state is Won or NotStarted. They are still refused after a wipe or a timeout.
- **`src/core/runManager.ts`**
  - New `miracleReady(kind)`, which the HUD uses to light the buttons and allow arming.
  - `castMiracle` passes the flag while a run is active.
  - A Shield cast between fights is recorded in `heldShields`, kept through `prepareNextFight` (which would otherwise clear it), and starts counting down when the next fight begins.
- **`src/game/hud.ts`:** the buttons, arming and the auto-disarm now ask `rm.miracleReady` instead of checking for a running fight.

## Decisions (orchestrator's recommendation, director to confirm)

1. **Smite still needs a running fight.**
   - A cleared room has no enemies to strike.
   - While the party walks, the next room's enemies are already staged. Allowing Smite then would mean damaging them before the fight starts, which is a bigger rule change than the director asked for.
2. **A Shield cast between fights lasts its full time into the next fight.**
   - Otherwise it would be wiped when the next fight is prepared, and the gauge would be wasted with nothing to show for it.
   - The shield timer only counts down during a fight, so the shield starts at its full 5 s when the fight begins.

## Checks

- **New test:** `runManager.test.ts` "Heal and Shield can be cast between fights…" checks:
  - the ready flags
  - that a heal lands and the gauge is spent
  - that Smite is refused
  - that a held Shield survives staging and is still active in the next fight
- **In-browser check:** after the start-room fight is won, keys 1 and 2 arm the miracles. Heal took a hero from 125 to 225 HP, and Shield set 5 s.
- **Suites:** `npm run test:fast` passes (551 passed, 2 skipped), lint and typecheck are clean, and the combat golden parity is unchanged (its scenarios use the default flag).

## Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | INFO | A shield that was still active when a fight ended is cleared as before; only shields cast between fights are carried into the next one. | As intended. |
| 2 | INFO | Healing between fights raises `HealApplied` with source kNoUnit, which does not fill the gauge (miracles never do). | As intended. |

There are no BLOCKING or MAJOR findings.
