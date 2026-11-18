# Review: origin/floor-rules-2 vs origin/main, lens: rules

Verdict: send back (1 MAJOR).

## MAJOR

1. An Elite does not count as 1 enemy for the kill quota.
   - Files: Source/BlessedCompany/Core/FloorGenerator.cpp, lines 100-113 and 554 (computeKillQuota, totalEnemies). Source/BlessedCompany/Core/RunFlow.h, lines 268-275 (OnEnemyKilled).
   - Problem: totalEnemies adds pack.size plus reinforcements.size for every room, and floorKills_ goes up once per dead enemy. An Elite room (pack 4-5 plus 2 reinforcements) therefore counts as 6-7 enemies on both sides. The header comment in FloorGenerator.h says "An Elite room's pack counts like any other room's enemies". That is the opposite of the director's decision.
   - Failure scenario: a floor has 5 Combat rooms (3 enemies each = 15) and 1 Elite (7 enemies). The code gives totalEnemies 22 and a quota of ceil(8.8) = 9. With Elite = 1 the total is 16 and the quota is 7. Clearing an Elite also adds 7 to floorKills_ instead of 1, so the quota is met far too early.
   - Fix needed: count one unit per Elite room in totalEnemies, and add one kill (not one per member) when an Elite room is cleared. The code has to decide whether that single kill is paid on room clear. The "avoidable" cap in computeKillQuota also needs redoing on that basis.

## MINOR

2. The Exit-room revive does nothing new.
   - Files: Source/BlessedCompany/Run/RunManager.cpp, lines 584-590 and 691. Source/BlessedCompany/Core/RunSim.h, line 72.
   - Problem: ExitRoomRevive calls PostWinRevive. The same call already runs right after every won fight, including the boss fight (RunManager.cpp:691, RunSim.h:151). By the time the party reaches the Exit room, the fallen were already revived, or the Priest is dead and no revive is possible. The Exit call returns 0 in practice, so the revive effectively happens when the boss dies, not in the Exit.
   - The recovery behaviour the director described is only partly implemented: PostWinRevive still runs after every fight, and CombatSim::RestRoom remains as dead code.
   - See doc question 1.

3. The tutorial roll counts non-dead-end rooms only.
   - File: Source/BlessedCompany/Core/FloorGenerator.cpp, lines 475-476, with the roll counted in buildLayout.
   - Problem: the decision says "5-8 rooms". Dead-end caps are added on top of the roll, so a tutorial floor can have well over 8 rooms (up to roughly 16 or more). It follows the same convention as the 10-20 roll, but the director's wording may mean total rooms.
   - See doc question 2.

4. Essence rank scaling has more in it than the director asked for.
   - File: Source/BlessedCompany/Core/EssenceConfig.h.
   - Director's decision: 10x finer ranks, +1% per rank, 100 ranks, as a DRAFT.
   - Also changed: the base cost goes from 20 to 2 (minimum 1), growth from 15% to 1.5% per purchase, and the Party Luck stats are planned to scale the same way. The cost curve is invented. Total cost to max is 457 against 404 before. The CSV values are divided by the scale in code, not changed in the CSV.
   - It is labelled DRAFT, so this is not a defect. The director should confirm the cost curve.

## Matches the director's decisions (checked in code)

- Elite cap is max(1, floor(0.20 * rooms)), where rooms is the total including dead ends. The code also adds a rule that no two Elites are joined by a door. That rule is an old-rule carry-over, not part of the decision.
- All floors use the 13 tiles. The old generator code is removed, and there is a deterministic staircase fallback.
- Boss floors (floor % bossInterval == 0) are exactly two rooms: an East dead-end arena start and a West dead-end Exit joined by matching openings. There is no roll and no quota (killQuota 0). The crystal is in the Exit, with crystalRequiresBossKill set.
- Rescue floor 2 with hasPriest false:
  - The start is an empty dead end with 0 enemies and no reinforcements. Its only neighbour is the rescue room, a non-dead-end tile that is the single Elite (elitesAllowed false for all other rooms).
  - The rest grows from the rescue room under the normal tile rules. The roll is 10-20 counting the rescue room, and openings match.
  - The whole floor is behind the rescue room, so it must be cleared to leave.
  - With hasPriest true, floor 2 is a normal floor, and Elites only appear from floor 3.
- Tutorial floor 1 with hasPriest false: roll 5-8 (placeholder), Combat packs of 1-2, Grunt-only mix, no Elites, no reinforcement waves. Treasure still rolls.
- Rest never generates. Weights over Combat/Elite/Treasure are renormalized (55/10/15 and 45/20/10), the same ratios as the gdd table minus Rest and Event. Rest entry is treated as an empty room, and EntryKind::Rest is removed.
- The Exit entry revives at 1 HP only with a living Priest and heals nothing (modulo finding 2).
- The Warrior BaseHP 250 is marked DRAFT in data/ClassData.csv, datatable_structs.h and reports/data-sync.md. The matching test assertion was updated.

## Things the code does that the director did not ask for

- The Auto bot lost its Rest rules: restBelow is gone, and the ChooseAuto parameter is now unused.
- The `Layout` grid is a fixed 96x96 and the layout has up to 200 redraw attempts. This is an implementation detail.
- Rest enumerator and `RoomType::Rest` are kept for numeric compatibility. UI TolHud still has a Rest icon branch.
- The Essence rank scaling is bundled into this floor-rules branch (see finding 4).
- Ownership, outside this lens: the branch edits data/ClassData.csv, Core/datatable_structs.h and reports/data-sync.md (data-designer files), tests/stat-resolver-event-bus (not run-programmer) and Run/RunManager.* plus tests/essence (check which agent made the change). If these were made by the run-programmer, the ownership lens should treat them as BLOCKING. The director's Warrior decision may cover the data edits. I did not run tests (rules lens).

## Doc questions

1. After a boss, should ordinary fights still revive the fallen right after each win (DESIGN-DECISIONS line 22, which is not on the superseded list)? Or is the Exit the only place revives happen? "Only recovery room" is clear about rooms, but not about the post-fight revive. If the revive should happen in the Exit and not after the boss fight, the boss-fight win needs to skip PostWinRevive.
2. Does "5-8 rooms" for the tutorial mean non-dead-end rooms (the roll, as the code does) or total rooms?
3. Does an Elite count as 1 enemy in both the total and the kills? Does clearing it add 1 kill? Is the avoidable-Elite quota cap still wanted?
