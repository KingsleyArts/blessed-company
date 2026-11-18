# Soak, Nov 18 (report only, no values changed)

Command: `soak3.ps1 1.3 "" 40 <cast>` (enemy multiplier 1.3, bot party Warrior + Mage, instant speed, 500 s cap), build of branch g6-roster-and-polish.

| Cast times | Runs finished | Floor 1 | Floor 2 | Floor 3+ |
|---|---|---|---|---|
| `tol.CastTimes 0` (instant actions) | 3164 | 1250 (40%) | 1811 (57%) | 103 (3%), best 4 |
| `tol.CastTimes 1` (shipped cast times) | **1** | 1 | 0 | 0 |

Notes
- The cast-time run produced a single result before the 500 s cap, so it says nothing about balance yet. Cause not investigated (possible stall in the bot with casts at instant speed, or a slowdown). Needs a look before the balance pass.
- The instant run ignored `runs=40` (it ran until the cap), so its count is a time-box, not 40 runs.
- With instant actions the bot dies on floors 1 and 2 about 97% of the time: the 1.3 multiplier is hard for a no-spend bot, as in earlier soaks.
