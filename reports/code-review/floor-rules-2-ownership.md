# Review: origin/floor-rules-2 vs origin/main, lens ownership and callers/performance

Verdict: send back (one BLOCKING ownership finding; no code defects found).

## Findings

### BLOCKING 1. Files outside the run-programmer's ownership (CLAUDE.md ownership table)
Touched by the Warrior HP commit ("Warrior base HP 300 to 250 (DRAFT, director)"):
- `data/ClassData.csv` (Warrior BaseHP 300 to 250): data-designer.
- `Source/BlessedCompany/Core/datatable_structs.h` (comment line 27): data-designer.
- `reports/data-sync.md` (new file): data-designer.
- `tests/stat-resolver-event-bus/tests.cpp:237` (literal 300 to 250): not in the run-programmer's paths. The owner is the architect (the resolver and event bus). Flag to the architect.
Failure scenario: a single-copy data-designer working in parallel edits the same CSV and `data-sync.md`, causing merge conflicts and a lost value. The task asked for no source edits to the data, but a value change also needs the data-designer to own it ("Values: a defined value would change").
Fix: split that commit out. The data-designer applies the CSV, struct note and data-sync entry, and the architect applies the test literal. Without the CSV change the resolver test (which reads data/ClassData.csv) fails, so the four files must land together. `docs/` is NOT touched (0 files), as required. Everything else is in range: Core/FloorGenerator.*, Core/Run*, Core/Essence*, Run/RunManager.*, tests/run, tests/floor-generator, tests/essence.

### MINOR 2. Docs and test still describe Rest rooms
- `docs/COMBAT-HOOKS.md:155`, `docs/DESIGN-DECISIONS.md:23`, `docs/gdd.md:95` still say Rest rooms heal 30 percent and revive. The code comments cite "director, Nov 13" for the retirement. The docs are director-owned, so this is a proposed edit (see doc questions).
- `Source/BlessedCompany/UI/TolMapLayout.h:199-206` (`RoomLabel` case 3 "Rest room"), `UI/TolHud.cpp:1017` (green plus), `Run/TolRunTypes.h:15` (`ETolRoomType::Rest`), `Combat/CombatManager.*` (`RestRoom`), `CombatSim::RestRoom` and unit tests still reference Rest. All of this compiles and is dead but harmless. `RoomType::Rest` is kept so the numeric values still line up with ETolRoomType (static_cast in RunManager.cpp:314). Nothing to fix now; remove at the freeze if wanted.

### MINOR 3. Empty rescue-floor start room is drawn as a Combat room
The empty start is `RoomType::Combat` with pack size 0 (FloorGenerator.cpp:500 and 538). RunFlow.h:376-384 clears it on entry (`Passed`, no fight, no pay), so Unreal does not break: HandleEntry hits `Passed` and does nothing. However the map draws the crossed-swords icon and the label "Combat room" (TolMapLayout.h RoomLabel) on the room the party starts in. The room is also visible as "known unvisited" before entry if the start is not auto-entered. Cosmetic. The ui-programmer could draw an empty cleared room when `bIsStart` and no pack. Read only, not run.

### MINOR 4. Exit-room revive is redundant in the Unreal flow
`RunManager.cpp:584-591` calls `PostWinRevive()` on `EntryKind::Exit`. `HandleFightFinished` (about line 691) already calls it after the boss win, and `CombatSim::PostWinRevive` returns 0 unless state is Won and a healer lives (CombatSim.h:390). Entering the Exit room after the boss therefore revives nobody who was not already revived, and a dead Priest is never recovered by it. The comment "the Exit room is the only recovery room" is true only if the post-fight revive is not counted. This is not a crash and is deterministic. It may not match the director's intent (doc question 1). `RunSim.h` mirrors it (`exitRevived`), so tests and Unreal behave the same.

## Callers of removed or changed API
Grepped Source/, tests/, scripts/, data/, sim/, spec-tests/, docs/. No leftovers:
- `Node::row` removed: no consumer. The only `.row` hits are UI `EssenceRow::row` rects, unrelated.
- `cutsFloor`, `reachableAvoiding`, `EntryKind::Rest`, `AutoReason::Rest`, `AutoParams::restBelow`: no references outside the changed Core files. TolAutoRunCommand.cpp and RunManager.cpp do not use them.
- `EntryKind::Rest` removed: RunManager.cpp switch updated (Fight, Exit, Treasure, Passed, Rejected, default). No missing case.
- `kRollableRoomTypes` 3: all users go through the constant (`weights.data()`, `fill(100.0 / kRollableRoomTypes)`). `Config::weights` is std::array<…,3>. The data-driven weight tiers are in Config, with no CSV counterpart.
- ETolRoomType switch in TolHud.cpp still lists Rest, so it compiles and all six cases are covered. Mirrors tol::RoomType (unchanged order).
- New Config and Floor fields have defaults, so no existing aggregate or designated initializer breaks.
- Essence: `kEssenceRankScale=10`. `maxRank` flows through the sidebar rows into `FTolEssenceRow.MaxRank` and `FormatRank` ("37/100"). x1/x10/x100/Max in `Buy` is bounded by `maxRank` (100) per call, and PreviewBuy loops at most 100 times per refresh (4 Hz, not per frame). 100 ranks fit the row layout (text only). tests/ui passes. The Unreal layout was read only.

## Build and test results (g++ 17, -O2 -Wall -Wextra, run from repo root; no warnings)
| Suite | Result | Time |
|---|---|---|
| stat-resolver-event-bus (data/ClassData.csv) | pass | <0.1 s |
| floor-generator | pass (47,017,001 checks) | 34 s (main: 17 s, 13.8M checks) |
| run | pass (49,833 checks) | 3.8 s |
| essence (data) | pass (575 checks) | 6.7 s |
| combat | pass (2,884 checks) | 0.4 s |
| ui (-ISource/BlessedCompany/UI) | pass | <0.1 s |
| units warrior, priest, assassin, barbarian, summoner, archer, brute, shaman (arg `data`) | all pass | seconds |

Could only read, not build: all Unreal-facing files (UI/TolHud.cpp, TolMapLayout.h, TolEssenceLayout.h, Run/RunManager.*, TolRunTypes.h, TolAutoRunCommand.cpp). I found no compile errors by inspection.

## Performance
Bench of `generate()` (3000 seeds per floor, with and without Priest, -O2): average 0.017-0.051 ms per floor, worst 1.9 ms (floor 1 with Priest, and floor 2 rescue 1.3 ms). Floor 10 (boss, tile-placed) 0.000 ms. Fallback layout used 0 of 60,000. Generation happens once per floor, not per tick, and it is O(rooms) with no per-tick allocation. The floor-generator test is 2x slower than main (34 s against 17 s) because it makes about 3.4x as many checks. It is acceptable but lengthens the review gate; consider fewer seeds (MINOR, no failure scenario).
The essence sidebar with about 730 ranks per run: the run test (full bot runs) takes 3.8 s and essence 6.7 s, so no scaling problem.

## Doc questions (not findings)
1. The docs (COMBAT-HOOKS.md:155, DESIGN-DECISIONS.md:23, gdd.md:95) still define Rest rooms and the Rest-based recovery for a lost Priest. The code retires Rest and makes the Exit room the recovery room, but the Exit revive only works with a living Priest after a won fight, so a lost Priest has no recovery. Is that intended, and should Exit instead revive regardless of the Priest, as Rest did? The docs need the director's edit either way.
2. Essence fine ranks (100 ranks at +1 percent) is marked DRAFT and "for the director to confirm". StatDef.csv still holds the coarse numbers (MaxRank/BonusPerRank), divided by the scale in code. The data-designer should record this in data-sync.md.
