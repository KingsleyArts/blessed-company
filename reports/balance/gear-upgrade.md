# Gear upgrade chance: balance sheet (floors 1-10, DRAFT)

Rule: a slot's next upgrade is guaranteed while the level it would reach is within the floor's range (0 + 1 x floor). Past it, the chance is 0.6^(levels over), never below 5%. Each level adds +10% of the class base (weapon Damage, armor Health). Boss of floor 10: every party member gets the upgrade, each rolled on their own chance.

## Chance by floor and current slot level

| Floor | Guaranteed to level | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 | L12 | L15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 100% | 60% | 36% | 22% | 13% | 8% | 5% | 5% | 5% | 5% | 5% | 5% | 5% |
| 2 | 2 | 100% | 100% | 60% | 36% | 22% | 13% | 8% | 5% | 5% | 5% | 5% | 5% | 5% |
| 3 | 3 | 100% | 100% | 100% | 60% | 36% | 22% | 13% | 8% | 5% | 5% | 5% | 5% | 5% |
| 4 | 4 | 100% | 100% | 100% | 100% | 60% | 36% | 22% | 13% | 8% | 5% | 5% | 5% | 5% |
| 5 | 5 | 100% | 100% | 100% | 100% | 100% | 60% | 36% | 22% | 13% | 8% | 5% | 5% | 5% |
| 6 | 6 | 100% | 100% | 100% | 100% | 100% | 100% | 60% | 36% | 22% | 13% | 8% | 5% | 5% |
| 7 | 7 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 60% | 36% | 22% | 13% | 5% | 5% |
| 8 | 8 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 60% | 36% | 22% | 8% | 5% |
| 9 | 9 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 60% | 36% | 13% | 5% |
| 10 | 10 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 60% | 22% | 5% |

Read a cell as "a slot that already has L levels, on this floor, gets its next upgrade with this chance".

## A fresh party through floors 1-10 (simulated, every room cleared, drops go to the best-chance slot of their type)

400 simulated runs, party of 4 (8 slots). Floor 10 is the boss floor; the boss rewards all 4 members.

| Floor | Drops per run | Upgrades landed | Wasted (failed rolls) | Avg slot level after | Lowest slot | Highest slot | Gear bonus (avg) | Enemy HP x floor |
|---|---|---|---|---|---|---|---|---|
| 1 | 1.8 | 1.8 | 0.0 | 0.2 | 0.0 | 0.9 | +2% | x1.00 |
| 2 | 4.5 | 4.5 | 0.0 | 0.8 | 0.1 | 1.4 | +8% | x1.08 |
| 3 | 6.5 | 6.4 | 0.0 | 1.6 | 0.9 | 2.3 | +16% | x1.17 |
| 4 | 6.3 | 6.3 | 0.0 | 2.4 | 1.6 | 3.2 | +24% | x1.26 |
| 5 | 6.5 | 6.5 | 0.0 | 3.2 | 2.3 | 4.1 | +32% | x1.36 |
| 6 | 6.7 | 6.7 | 0.0 | 4.0 | 3.1 | 5.0 | +40% | x1.47 |
| 7 | 6.6 | 6.6 | 0.0 | 4.9 | 3.9 | 5.8 | +49% | x1.59 |
| 8 | 6.4 | 6.4 | 0.0 | 5.7 | 4.6 | 6.7 | +57% | x1.71 |
| 9 | 6.7 | 6.7 | 0.0 | 6.5 | 5.4 | 7.6 | +65% | x1.85 |
| 10 | 1.0 | 4.0 | 0.0 | 7.0 | 5.8 | 8.2 | +70% | x2.00 |

Enemy HP x floor is the floor scaling alone (+8% per floor, before the boss spike); the gear bonus is the party average. Treasure, Elite and Boss rooms drop; Combat and Rest do not.

## Run after run (levels are permanent)

Party of 4, every room cleared, 60 trials per row. Each block is a player whose runs all end on the same floor. Landed and wasted are per run; avg level is the party average after that run.

**Every run ends on floor 3**

| Run | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Landed | 12.6 | 9.8 | 6.2 | 4.9 | 3.3 | 2.8 | 2.3 | 2.4 | 1.6 | 1.8 | 1.9 | 1.4 |
| Wasted | 0.0 | 2.6 | 6.3 | 8.5 | 9.7 | 10.0 | 10.3 | 10.3 | 11.1 | 10.4 | 10.7 | 11.8 |
| Avg level | 1.6 | 2.8 | 3.6 | 4.2 | 4.6 | 5.0 | 5.2 | 5.5 | 5.7 | 6.0 | 6.2 | 6.4 |

**Every run ends on floor 5**

| Run | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Landed | 25.0 | 15.9 | 8.1 | 5.1 | 3.5 | 2.9 | 2.6 | 2.2 | 2.2 | 1.7 | 1.9 | 1.7 |
| Wasted | 0.0 | 9.3 | 17.6 | 21.6 | 22.0 | 23.1 | 22.9 | 23.3 | 23.6 | 23.3 | 23.9 | 24.5 |
| Avg level | 3.1 | 5.1 | 6.1 | 6.8 | 7.2 | 7.6 | 7.9 | 8.2 | 8.4 | 8.7 | 8.9 | 9.1 |

**Every run ends on floor 10**

| Run | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Landed | 54.9 | 22.1 | 9.1 | 6.2 | 5.2 | 4.5 | 3.5 | 3.4 | 3.0 | 2.9 | 3.1 | 2.6 |
| Wasted | 0.0 | 32.7 | 44.3 | 48.2 | 47.0 | 48.8 | 49.0 | 49.5 | 49.1 | 47.9 | 48.8 | 49.8 |
| Avg level | 6.9 | 9.6 | 10.8 | 11.5 | 12.2 | 12.8 | 13.2 | 13.6 | 14.0 | 14.4 | 14.8 | 15.1 |
