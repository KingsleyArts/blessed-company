# Code review (correctness, re-review): floor-rules-2 e50fd68 (fix for the Exit revive MAJOR)

Change: `git diff 3d9b0b6..origin/floor-rules-2` (CombatSim.h, RunSim.h, RunManager.cpp, tests/run/tests.cpp).

## Verdict: merge (no BLOCKING, no MAJOR)

## Test results (g++ -std=c++17 -O1, e50fd68 in a scratch worktree)
resolver (data/ClassData.csv), floor (47,462,170 checks), run (49,884), essence (575), combat (2,884), ui, units archer/assassin/barbarian/brute/priest/shaman/summoner/warrior: all pass.

## Base equivalence (266f976 vs e50fd68, both built and run)
- tests/run, tests/essence and tests/combat output diffed: identical, including the seeded bot distributions, essence results and the combat soak. The only difference is the run check count (49,843 vs 49,884, the new test).
- Code diff of PrepareNextFight: the extracted ResetTransientState adds one write, `tauntLeft = 0.0`, which the base did not do for party units. Party units never have tauntLeft > 0 (only set when `t->enemy`, CombatSim.h:1367). Behavior is identical. goalTimer is no longer touched by PrepareNextFight (as base) and is reset only in ReviveUnit.
- Non-boss post-fight revive is unchanged: PostFightRevive and the RunManager.cpp guard both fall through to PostWinRevive.

## Boss paths (RunManager.cpp, read-only)
- Won: skip PostWinRevive. The boss floor is exactly two rooms (arena Boss, then Exit with the crystal; FloorGenerator.cpp:443-466), so the only way forward is Travel into Exit, and HandleEntry then calls ExitRoomRevive. Every UI path (MoveDirection line 175, MoveToRoom line 193, bot DoTeleport line 680) goes through HandleEntry. The Exit is marked cleared on first entry, so the revive runs once.
- Wiped / TimedOut: no revive either way, Flow.OnFightFinished finishes the run (Wiped), so the Exit is never reachable. Test covers TimedOut.
- Abandon / quit: Flow.Abandon clears pendingFight_, HandleFightFinished returns early, run ends. Party HP is not saved to meta (only gold), so nobody is "stuck dead".
- bFullHeal debug path still fully heals after a won boss.
- Also confirmed that after the boss win and before the Exit, no other fight room exists on a boss floor, so the dead party cannot be sent into another fight.

## Non-vacuity (mutations on the run suite)
- Remove boss skip in PostFightRevive: fails (lines 309, 310, 314).
- 0.20 -> 0.25: fails (lines 304, 316, 326).
- Drop goalTimer reset in ReviveUnit: fails (lines 317, 382).
- Drop an ResetTransientState field (attackTimer): fails (317, 383).
RunManager.cpp's skip cannot be built or tested here.

## Findings
1. MINOR - Source/BlessedCompany/Run/RunManager.cpp:696 duplicates the boss condition instead of calling tol::PostFightRevive (which the tests cover). If the Core helper changes, RunManager can drift and no native test would notice. Suggest calling a shared helper (the manager goes through ACombatManager::PostWinRevive, so a thin wrapper or a Spec.room parameter would do).
2. MINOR - Run/RunManager.cpp:61 `EnterNode` (low-level tol.StartRun debug API) calls Flow.Travel without HandleEntry. Entering the Exit through it revives no one (and starts no fight), so a debug session can leave a boss-floor party dead. Not on any player or bot path; pre-existing behavior for Exit, but the boss skip makes it more visible.

## Doc questions
None. Director's rules were explicit and the code matches them.
