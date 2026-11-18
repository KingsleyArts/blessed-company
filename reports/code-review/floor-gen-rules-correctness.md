# Code review: floor-gen-rules (commits 4b5e84c, f4cd363, ce65e56), lens: correctness

Verdict: merge (no BLOCKING or MAJOR findings).

Checked: Core/FloorGenerator.{h,cpp}, tests/floor-generator/tests.cpp (plus the 1-line comment edits in Run/TolRunTypes.h and tests/run/tests.cpp).

## Test results
- tests/floor-generator built with g++ -std=c++17 -Wall -Wextra: no warnings; "All tests passed (13763405 checks)", fallback used on 0 of 18000 floors.
- My own harness (scratchpad h.cpp, ASan+UBSan, floors 1-12, hasPriest on and off, 72000 floors; seeds s*7919+1):
  - roomRoll hits every value 10..20 (about 6000 each) and always equals the non-dead-end count placed (off-by-one in the 10-20 roll: none).
  - Every node reachable from start; id == index and ids are row-major; door/next symmetric and the neighbour's gx/gy match the direction; no opening faces an empty cell.
  - Exactly one crystal, never on the start, reachable. Exactly one start. Start never Elite.
  - Rest in the far half (depth*2 >= maxDepth) on every floor, including after rescue-room conversion (0 misses). Smallest max door distance seen: 3.
  - Floor 2 without Priest: exactly one Elite, flagged, rescueNode matches. With Priest: zero Elites.
  - killQuota in [1, totalEnemies] on every non-boss floor.
  - Forced fallback (layoutAttempts = 0) for targets 1..20: valid, symmetric, nonDead == target.
  - No sanitizer reports.
- Floor 10 (boss): RNG draw order is unchanged from origin/main (same nextInt then rollPack); only shape/isDeadEnd are newly set. Output stream is the same.

## Findings (all MINOR)

1. MINOR - FloorGenerator.cpp:130-141, 193-244 (Layout grid has no bounds check). `Layout::at()` indexes `mask[y*kGrid+x]` with no range check and kGrid = 96, start at 48. Safe for the default 10..20 (and for roll up to roughly 45), but `Config::roomCountMax` of about 90+ writes out of bounds (the fallback staircase walks 1 cell per room east and 1 south). Failure input: `cfg.roomCountMin = cfg.roomCountMax = 100`. No data file sets this today; it is a config-only hazard.

2. MINOR - FloorGenerator.cpp:428: the return value of `buildFallback` is discarded. If it were ever invalid, `generate` would continue and index `idAt` with -1 / out of range. I verified it is valid for targets 1..20, so this is defensive only (an assert or a clamp of roll would close it).

3. MINOR - FloorGenerator.cpp:548-574 vs the Config comment at FloorGenerator.h:147-155 and the 2b comment. If `rescueFloor >= eliteMinFloor` (for example rescueFloor = 3, no Priest), rolled Elites exist, the nearest becomes the rescue room and the others stay Elite, so the floor does not hold "exactly one Elite" as Config documents. Default config (rescueFloor 2, eliteMinFloor 3) is unaffected. Config-only.

4. MINOR - FloorGenerator.cpp:529-535 Rest fallback passes 1 and 3 (any non-start Combat/Treasure, not far) can put the only Rest outside the far half. Unreachable in practice: the farthest room's predecessor is far and cannot also be an Elite (no adjacent Elites), so pass 0 or 2 always finds a candidate (0 misses in 72000 floors). Dead-code risk only.

## Doc questions (not findings)
- Floors 1-2 draw Elite at weight 10 and then rewrite it to Combat (line 509), so Combat is 73.6% against the table's 61.1% (test output "floor 1 type 0"). On floors 3+ the adjacency and cap rewrites also shift Elite 23.5% to 16.5% and Combat up. Is the intended behaviour "rewrite to Combat" or "renormalise the weights over allowed types"? Code matches its own comments, docs are silent.
- The 2b comment says the rescue room is "the FIRST Elite the player meets (nearest the start)", but on default config it is a random non-cutting Combat room, not the nearest. Which does DESIGN-DECISIONS 7/8 intend?

## Checked and clean
- RNG: single map stream per floor; draw order deterministic; no unordered containers; `hasPriest` changes the stream only on the rescue floor and is part of the documented determinism key.
- Retry loop terminates (layoutAttempts bound, inner guard bound; each inner iteration places one cell).
- Crystal: drawn among non-start rooms (the "unreachable" fallback to the start cannot occur, floors have >= 12 rooms).
- Kill quota: ints only, no overflow possible at these sizes; zero-enemy floor returns 0; Elite exclusion cap leaves quota >= 1.
- Performance: about 1 ms per floor; pendingCells rescans the bounding box each placement (O(cells) per step), fine at <= 40 rooms.
