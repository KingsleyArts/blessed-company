# Code review: floor-rules-2 (origin/main...origin/floor-rules-2), lens: correctness

Verdict: **send back** (1 MAJOR). Everything else held up.

## Test results (g++ 13 -std=c++17 -Wall -Wextra, reviewed at 3de6a50)
- Resolver (with data/ClassData.csv), floor-generator, essence, combat, ui, run suites: all pass, zero warnings.
- run and essence suites also pass under ASan+UBSan (no reports).
- Own ASan/UBSan harness (scratchpad, not in repo): 300 seeds x floors 1-30 x hasPriest both ways x bossInterval {10,5,3,2,1,0,7}, plus
  layoutAttempts=0 (fallback only, with and without Priest), roomCount 1..1, and 20000 seeds x floors 1-3 for fallback frequency.
  Invariants checked: full door symmetry and reachability, no Rest, boss floor = 2 rooms (Boss start dead end + Exit with crystal, quota 0), roll == non-dead-end count,
  Elite cap, no Elite below floor 3 (except rescue), rescue layout (empty dead-end start, only neighbour is the single non-dead-end Elite rescue room, crystal never in start),
  tutorial (Grunt only, pack within 1..2, no Elite, no wave, roll within 5..8), quota in [1, enemies avoidable without Elites], determinism for same seed+floor+hasPriest.
  Result: 0 violations in default-style configs. The staircase fallback is valid for both kinds; the default config never reaches it (0 of 120000 floors).

## Findings

### MAJOR 1. Exit-room revive is a no-op in the real run flow; the stated "only recovery room" does nothing
- Files: Source/BlessedCompany/Run/RunManager.cpp:584-590, Core/RunSim.h:67-72 (ExitRoomRevive), tests/run/tests.cpp:208-250.
- Both call `CombatSim::PostWinRevive()`. That function already ran when the boss fight was won (RunManager::HandleFightFinished line ~691, RunSim.h:151) and revived everyone while the Priest lived. Entering the Exit room runs it a second time on the same Won sim: nothing is dead any more, so it returns 0. If the Priest was dead at the boss win she stays dead in the Exit room too (it needs a living healer).
- Failure scenario: floor 10, Warrior and Mage die during the boss fight, Priest lives. Boss falls, post-win revive brings both back at 1 HP (before the Exit room). Exit room adds nothing. Second scenario: Priest dies in the boss fight, the others live: no revive at the win, none in the Exit room, the lost Priest never returns. The removed Rest room was the documented recovery for a lost Priest (DESIGN-DECISIONS line 23); nothing replaces it. `RunSimResult::exitRevived` will always be 0.
- The test `test_exit_room_revives_the_fallen_only_when_the_priest_is_alive` passes vacuously: it kills the Mage by hand AFTER the Won state and then calls ExitRoomRevive, a state the game cannot reach (units cannot die after the fight ends, and the win already revived them).
- Fix options (director decides, see doc question 1): either make the boss-win skip the revive so that only the Exit room revives (then the test would be real), or drop the claim and the dead code. HP is also no longer healed anywhere (Rest healed 30 percent).

### MINOR 2. Essence cost is a staircase at fine ranks, not the stated curve
- Core/EssenceConfig.h ScaleToFineRanks + EssenceSidebar.h RankCost. With base 2 and growth 1.5 percent, costs are: ranks 0-14 cost 2, 15-37 cost 3, 38-54 cost 4, 55-67 cost 5, 68-79 cost 6, 80-88 cost 7, 89-97 cost 8, 98-99 cost 9 (total 457). The 15 percent compounding is mostly lost to integer rounding for the first 15 ranks of every stat (flat cost). The header says "cost per unit of power is unchanged": it is unchanged only on average (457 vs 404 total, +13 percent). Never 0, no overflow (clamped at 2e9, ranks capped at 100, `static_cast<int>(v) * k` safe). ApplyStatDefCsv divisors consistent; a CSV base cost below the scale (for example 5) gives cost 1 for 27 ranks.
- Not game-breaking; flag for the sim-balancer and the director.

### MINOR 3. Layout grid has no bounds check
- Core/FloorGenerator.cpp:130-141 (`kGrid = 96`, `Layout::at`). With roomCountMin=roomCountMax=100 and layoutAttempts=0, ASan reports a heap-buffer-overflow write in buildFallback (line 295). Default config (max 20 rooms) is far inside the grid, so it cannot happen today; it becomes a crash if a designer raises roomCountMax above about 45. Suggest clamping the roll to a safe maximum.

### MINOR 4. Config corner: rescueFloor == tutorialFloor
- With both set to the same floor and no Priest, the rescue Elite gets a reinforcement wave on the "no waves" tutorial floor (wave rule is checked per type, Elite always gets one). Not reachable with defaults (1 vs 2). Document or guard.

### MINOR 5. Dead UI and Combat code for Rest
- UI/TolMapLayout.h:206 ("Rest room" label), UI/TolHud.cpp:1017 (ETolRoomType::Rest case), Run/TolRunTypes.h:15, CombatSim::RestRoom and its tests still exist. Harmless because the generator never makes Rest, and the enumerator is kept on purpose to hold numeric values. RunFlow treats a stray Rest node as an empty room (Passed), which is safe.
- `StartRunWithFights` returns false when the first room is empty (only if rescueFloor is set to 1); default config unaffected.

### Ownership check (orchestrator to confirm, not judged by this lens)
- data/ClassData.csv (Warrior BaseHP 300 to 250), Core/datatable_structs.h and reports/data-sync.md are data-designer files; commit 3de6a50 is labelled "DRAFT, director". If it was not made by the data-designer on the director's instruction, that is a BLOCKING ownership violation. tests/stat-resolver-event-bus/tests.cpp was edited alongside (architect/combat area).

## Verified OK (no finding)
- Boss floor: two tiles (East dead-end arena, West dead-end Exit) built through the tile code; draws only the pack from the RNG (no roll); bossInterval 1, 2, 3, 5, 7 and 0 (disabled) all correct, rescue/tutorial never run on a boss floor.
- Rescue layout generation, bounded retries (default 200, then deterministic fallback), look-ahead on forced cells, validity re-check.
- Rest removed: weights are over Combat/Elite/Treasure and renormalized (55/10/15 gives 68.75/12.5/18.75 percent), RoomType numeric values kept, pickWeighted indices map 0..2 correctly.
- Elite cap max(1, floor(0.2 x rooms)), quota ceil(0.4 x enemies) capped at enemies outside non-rescue Elites, crystal never in start.
- Empty fight room (rescue floor start): EnterCurrent marks it cleared and returns Passed, no Essence, no Gold, no room counted, quota counts kills only. Works from Start() and from Teleport() into floor 2; RunManager DoTeleport/StartPendingFight no-ops safely; RunAuto/RunBot reach the single exit and the rescue room (bot rescued the Priest in 19 of 20 runs, the 20th died earlier).
- Priest absent case in Exit revive: no crash, returns 0.

## Doc questions
1. The Exit room "revives the fallen only if the Priest lives" has no effect while the post-win revive also exists (MAJOR 1). What should it do: replace the post-win revive for the boss fight only, or give extra recovery (for example revive even without a Priest, like the old Rest)? Should HP healing exist anywhere now?
2. docs/DESIGN-DECISIONS.md lines 23 and 36, docs/COMBAT-HOOKS.md line 155 and gdd.md lines 95, 104, 276 still describe the Rest room; the Nov 13 retirement is not in the docs (docs are the director's).
3. Essence fine ranks (kEssenceRankScale = 10): runtime base cost 2 versus the StatDef.csv value 20, max rank 100 versus 10. Marked DRAFT in the code; the director needs to confirm, and the staircase in MINOR 2 may matter.
