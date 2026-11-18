# Review: floor-gen-rules (4b5e84c, f4cd363, ce65e56), lens: ownership and callers

Verdict: merge (no BLOCKING or MAJOR).

## Ownership
Files touched (git diff origin/main...origin/floor-gen-rules): Core/FloorGenerator.{h,cpp}, tests/floor-generator/tests.cpp, Run/TolRunTypes.h (comment only), tests/run/tests.cpp (comment only). All are run-programmer paths per CLAUDE.md. No data/, docs/, UI/ or Core/RunMapView.h edits. No violation.

## Callers
- Grep of Source/, tests/, data/, docs/, reports/, scripts/ for every removed Config field (gridCols/Rows Min/Max, extraLinkChance, minLoops, minDeadEnds, minOccupied*, maxElitesPerFloor): no remaining use outside FloorGenerator.*. (roomCountMin/Max kept, defaults changed 8-16 to 10-20.) Nothing in data/*.csv held these.
- Node.shape/isDeadEnd and Floor.roomRoll/usedFallbackLayout are additive; no consumer breaks. RunMapView copies f.cols/f.rows and gx/gy; TolMapLayout/TolHud assume only gx,gy in [0,cols) and Gx east / Gy south, which still hold. Nothing assumes start on the west edge (grep for west/gx==0/entrance in UI, Run, RunMapView: only the updated comments).
- Not verified: Unreal build (no UE on this machine); the UE-side code only gets comment changes, so low risk.

## Tests (g++ -std=c++17 -O1, worktree of the branch)
All pass: floor-generator (13.76M checks, 17.9 s), run (57,343 checks, 2.6 s), essence (98 checks, 4.4 s), stat-resolver-event-bus, ui, combat (2,884 checks).

## Performance (30,000 floors, seeds 1-3000 x floors 1-10)
Average 0.05 ms per floor, worst 2.8 ms; usedFallbackLayout never triggered; avg 21.1 rooms, max 41 rooms, max 22 dead ends. Bot/auto/sim cost fine (run tests 2.6 s; essence bot runs 4.4 s).

## Findings
1. MINOR - UI map shrinks. Source/BlessedCompany/UI/TolMapLayout.h ComputeMapGeometry fits cols x rows into the minimap area (TolHudLayout.h:54, panel 0.275w x 0.34h). Observed grids reach 12 x 12 (old cap 8 x 5). At 1920x1080 the map area is roughly 500 x 280 px, so pitch is about 23 px: rooms about 17 x 13 px, door stubs about 3 px, click hit boxes tiny. Still correct, but hard to read and click on a tall floor. Needs a visual check; the ui-programmer owns any fix (e.g. crop/scroll to known rooms, or cap rows).
2. MINOR - tests/floor-generator/tests.cpp takes about 18 s (13.7M checks), noticeably slow for a per-merge gate. Consider fewer seeds or a quick mode.
3. MINOR - Config comment in FloorGenerator.h says Elite cap eliteMaxFraction 0.20 is a PLACEHOLDER needing the director's number; ce65e56 also removes the Elite-never-only-way rule (director-authorised in the commit message). Confirm docs/DESIGN-DECISIONS.md 8 was updated by the director, otherwise code and doc disagree (doc question below).

## Doc questions
- Does DESIGN-DECISIONS 8 now state the dropped "Elite never the only way forward" rule and the 13-tile / 10-20 rolled-room rules? I did not edit or check docs; code follows the commit messages.
