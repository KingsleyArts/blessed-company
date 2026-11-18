# Review: floor-gen-rules (4b5e84c, f4cd363, ce65e56), lens: rules

Verdict: **merge** (no BLOCKING or MAJOR). Native floor-generator test build (g++ -std=c++17) passes: "All tests passed (13763405 checks)".

Checked against the director rules, gdd.md and DESIGN-DECISIONS. Floor 10 is the same as on main (arena + Exit, crystal requires boss kill); the only additions are the shape/isDeadEnd fields. Ownership of the five files touched is not part of this lens.

## Matches the rules (verified in code)
- 13 shapes, no straight corridors (FloorGenerator.h kShapeMasks); start is random among the 9 non-dead-end shapes (cpp:196).
- Roll of 10-20 non-dead-end rooms (cpp:420-421); growth is outward; dead ends are placed only once the roll is reached (cpp:216-218); total can exceed roll.
- Matching openings and no wall facing an opening are enforced by `constraints`/`fits` and re-checked in `layoutValid` (cpp:173-191). Multi-neighbour cells use a shape fitting all, with redraws and a staircase fallback.
- Dead ends use the same depth weights; start is Combat; no adjacent Elites or Treasures; Elite cap max(1, 0.20*rooms) (cpp:494, 509-510).
- Far-half Rest by BFS walking distance (cpp:493, 525-539).
- Rescue: on floor 2 without the Priest exactly one Elite; with the Priest none (eliteMinFloor 3). Elite nearest the start with lowest id on ties is implemented (cpp:550-553).
- Crystal in any non-start room including Elite/rescue (cpp:600-611); reachable because every room is door-connected.

## Findings

### MINOR-1: far-half Rest can silently fail (cpp:536-538)
If every non-start Combat/Treasure room in the far half is an Elite/Rest/etc., the pool falls to pass 1 (any Combat room, not far), so the "at least one Rest in the far half" rule is not met. Scenario: a tiny floor (roll 10 minimum, so unlikely) where far-half rooms are all Elite/Treasure-only. Low probability; no assert/test covers it.

### MINOR-2: rescue "exactly one Elite" breaks when eliteMinFloor is lowered (cpp:550-553)
With eliteMinFloor <= 2 and no Priest, the nearest rolled Elite becomes the rescue room but the other rolled Elites remain, so floor 2 has several Elites, against DESIGN-DECISIONS 200 "exactly one". Not reachable with the default config (3). Either document that this is a config-only case or demote extra Elites.

### MINOR-3: rescue fallback can remove the only far Rest (cpp:566-569)
If no Combat/Treasure/spare Rest room exists, the last-resort pool picks any non-start room, possibly the only far Rest or the whole pool of Rests. Practically unreachable (floors have 10+ rooms with ~55% Combat).

### MINOR-4: rescue is placed randomly, not "nearest" in the default path
With default config the rescue room is a random non-cutting Combat room, not the room nearest the start. Doc line 174 ("first Elite room the player meets") is satisfied trivially because it is the only Elite, so no defect. Noted only because the header comment describes it as "nearest".

### MINOR-5: Elite cap counts dead-end caps in `roomCount`
Cap is max(1, 0.2 * total rooms), including dead ends, matching the director wording ("rooms"). If the director meant the rolled non-dead-end count, the cap is a little looser. Placeholder anyway.

## Doc notes (not graded)
- Open conflicts you already know: DESIGN-DECISIONS 174 vs 200 (floor 2 Elite guarantee), line 200 wording about crystal/Elite, quota cap "an Elite is never required". Code follows the director rules: computeKillQuota still caps the quota by enemies outside non-rescue Elites (cpp:105-111), which keeps the old line 200 behaviour even though the "never only way forward" rule was removed. That is consistent with the quota text but note the header comment (eliteMinFloor) now says Elites may sit on the only path while the quota still avoids them.
- gdd.md lines 87-97 (row graph, "no dead ends", "at most one elite per row") are superseded by DESIGN-DECISIONS 189; the Elite cap re-expression is the placeholder awaiting the director's number (flagged in code).
- DESIGN-DECISIONS 174 still says "Floor Generator only caps Elites at one per row"; stale.
- "Floors 1-9 only": code applies the new layout to every non-boss floor (11-19 too, boss interval 10). Presumably intended; confirm if bossInterval changes to 5, floors 6-9 then lose nothing but floor 5 becomes boss.

## Peripheral edits
Run/TolRunTypes.h and tests/run/tests.cpp changes are comment-only and accurate.
