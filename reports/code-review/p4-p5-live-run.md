# Code review: live run manager and UI text (`p4-combat-view`, `p5-temple-save`)

Date: Nov 19, 2026. Lenses: rules (port fidelity vs the Unreal build) and correctness. Reviewer: the orchestrator session. This is a self-review, not an independent agent.

## Scope

- **`src/core/runManager.ts`:** the playable side of `Run/RunManager.cpp`, plus the real-time parts of `Combat/CombatManager.cpp`:
  - fixed 1/30 s step accumulator
  - StageNextFight while walking
  - PostWinRevive / DespawnDeadParty
  - the Exit-room revive
  - Auto timers
  - Temple and roster purchases
  - meta load and save, with the corrupt save kept aside
- **`src/core/uiText.ts`:** the `tolui` text helpers (counts, bonuses, buy button, result lines, room labels).
- **`src/core/statResolver.ts`:** `clone()` added.
- **Not in scope:** the scene code in `src/game/` and `src/ui/` (view only; CLAUDE.md sends UI layout to no review).

References, all read-only: `tower-of-the-lost` branch `g6-roster-and-polish`:
- `Run/RunManager.cpp`
- `Combat/CombatManager.cpp`
- `UI/TolHud.cpp`
- `UI/TolUiText.h`

## How it was checked

- **`runManager.test.ts`, 7 tests:**
  - real-time tick
  - Auto plays a whole run headless
  - a walk hook stages the next fight and starts it when the walk ends
  - Temple, roster and reload persistence
  - corrupt save kept aside
  - miracles through the manager
  - Auto continues after a teleport into a start room with no fight
- **In-browser runs** (desktop 1280×720 and phone 844×390):
  - manual moves (arrows and mini-map)
  - miracles by keys 1–3 with ground-aimed Smite
  - Auto from floor 1 to a wipe on floor 2
  - results card → Temple → Back → New Run
  - purchases and party kept across a reload
  - two-click Reset progress
- **Suites:** the full fast suite passes (550 passed, 2 skipped), and lint and build are clean.

## Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | MAJOR (inherited from Unreal) | After Auto teleports, `AdvanceStep` returns false and waits for the new floor's start-room fight to schedule the next step. Some floors have an empty start-room pack, so `EnterCurrent` marks the room cleared with no fight, and Auto stops for good (seeds 7, 11 and 99 on floor 2). The Unreal code has the same flow. | Fixed: after a teleport, keep stepping when no fight is pending. Regression test added. Listed in the playtest report as a rule-level change for the director to confirm. |
| 2 | MINOR | `syncMeta` makes the Priestess active on rescue only if a slot is free. Same as Unreal; the full-party case is an open design item. | No change (open design item). |
| 3 | MINOR | The step timer runs on unscaled time, so Auto pacing ignores the 1/2/4/10x combat speed and uses only `meta.defaultSpeed`. Same as Unreal (`Params.Speed`). | No change. |
| 4 | INFO | `resetAllProgress` (tuning menu, testing builds) starts a run. `resetProgressOnly` (Temple button) does not. Both save at once. | As intended. |
| 5 | INFO | `uiText.formatResultLines` leaves out the Unreal seed and priest-rescued parameters, because the card does not print them. | No change. |

There are no BLOCKING findings and no open MAJOR findings.
