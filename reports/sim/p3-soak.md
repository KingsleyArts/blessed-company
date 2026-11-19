# Stage 3 soak: TS port vs the Unreal soak (Nov 18, 2026)

The soak bot is `src/core/autoRun.ts`, driven by `npm run soak`. It replays the instant `tol.AutoRun` loop of `URunManager` (Run/RunManager.cpp), making the same calls in the same order:

- Bot session: the soak starts from a fresh in-memory save and never reads or writes a save file.
- Priest: forced locked at the start of every run, so the party is always Warrior + Mage and the Priest is rescued on floor 2.
- CombatConfig is built as `ACombatManager::StartFight` builds it:
  - the enemy multiplier is a float cvar, so it is rounded to float;
  - the shipped cast times are on by default;
  - enemies spawn at random spots;
  - the party enters by the door opposite the way it walked.
- Essence ranks and gear are applied after each fight starts, and again after a gear drop or a bot purchase.
- After a won non-boss fight: `PostWinRevive`.
- Boss Exit room: everyone fallen is revived at 20% HP.
- `--temple` runs `BotVisitTemple` after each run.

## Results

All runs: enemy multiplier 1.3, fresh save, seeds 1..N.

| Mode | Command | Runs | Floor 1 | Floor 2 | Floor 3+ | Best |
|---|---|---|---|---|---|---|
| Unreal defaults: cast on, sidebar buys | `npm run soak -- --runs 3164 --quiet` | 3164 | 1250 (40%) | 1811 (57%) | 103 (3%) | 4 |
| Unreal g6 soak, Nov 18 (reference) | `soak3.ps1 1.3 "" 40` | 3164 | **1250 (40%)** | **1811 (57%)** | **103 (3%)** | **4** |
| Cast off, sidebar buys | `--runs 3164 --cast-times 0` | 3164 | 1160 (37%) | 1820 (58%) | 184 (6%) | 5 |
| No buy, cast on | `--runs 3164 --nobuy` | 3164 | 1313 (41%) | 1783 (56%) | 68 (2%) | 4 |
| No buy, cast off | `--runs 3164 --nobuy --cast-times 0` | 3164 | 1225 (39%) | 1802 (57%) | 137 (4%) | 4 |
| No buy, cast on | `npm run soak -- --runs 40 --mult 1.3 --nobuy` | 40 | 17 | 21 | 2 | 3 |
| No buy, cast off | `--runs 40 --nobuy --cast-times 0` | 40 | 18 | 19 | 3 | 3 |

### Temple bot (`--temple`), 60 runs from each start seed

| Start seed | Cast on: first run to floor 3 / 5 / 10 | Cast off: first run to floor 3 / 5 / 10 |
|---|---|---|
| 1 | 7 / 17 / never | 5 / 7 / 50 |
| 101 | 9 / 12 / 59 | 7 / 11 / 50 |
| 201 | 6 / 13 / 59 | 6 / 10 / 53 |
| 301 | 13 / 16 / never | 5 / 12 / 49 |
| 401 | 8 / 16 / 51 | 5 / 9 / 46 |
| 501 | 7 / 11 / 51 | 7 / 11 / 51 |
| 601 | 10 / 12 / 55 | 10 / 12 / 47 |
| 701 | 11 / 13 / 51 | 5 / 13 / 49 |

The Temple bot always buys the cheapest affordable item. Damage ranks cost 3 Faith each, so it never buys gear or stat unlocks; the same holds in Unreal, where the code is identical. 40 runs from seed 1 with cast times on reach `F1 x2 F2 x5 F3 x1 F4 x8 F5 x6 F6 x8 F7 x5 F8 x4 F9 x1`.

## Against the targets, with tolerance

1. **Unreal g6 soak (Nov 18, current Unreal build): exact match.** Tolerance: zero.
   - All 3164 runs land on the same floors as the Unreal soak: 1250 / 1811 / 103, best floor 4.
   - The pinned test is `src/core/autoRun.parity.test.ts`; `npm test` runs it.
   - This is the strongest check in the port. It needs the same RunFlow, bot, sidebar purchases, combat with random spawns, entry doors, enemy multiplier and revives, all bit for bit.
2. **B1, "floor 1 usually fails with no upgrades": met.**
   - Unreal: 18 of 40 no-buy runs die on floor 1. The CombatManager comment says about 14 of 40.
   - TS: 17 of 40 with cast times on, 18 of 40 with them off.
   - Tolerance: ±4 of 40, which is about one standard deviation of a 40-run binomial at p ≈ 0.4.
   - Over 3164 runs, 39–41% die on floor 1 in every mode.
3. **B2, "Temple bot reaches floor 3 by run ~4, floor 10 by run ~40": not reproduced. Not a port bug.**
   - TS reaches floor 3 by run 5–13 and floor 10 by run 46–59, or not at all within 60 runs.
   - B2 was verified on Nov 16, on the g4-temple build. The g5 merge (Nov 17–18) changed the build after that: the Faith/Essence/Gold economy, cast times and the Miracle Gauge.
   - The current Unreal build has no Temple soak on record, so B2 cannot serve as a parity target.
   - Item 1 shows the run layer matches the current Unreal build exactly. The Temple shop code is ported line for line, and `src/core/run.test.ts` tests it against the C++ cases.
   - Whether B2 still holds as a design target for the current economy is the director's call. Nothing was tuned.

## Findings for the director

- **The Unreal g6 report's "CastTimes 0" label looks wrong.**
  - The Unreal row labelled "`tol.CastTimes 0` (instant actions)" matches the TS run with cast times **on**, run for run.
  - With cast times off, TS gets 1160 / 1820 / 184.
  - The likely cause: the cvar did not take effect in that Unreal run, perhaps set after the loop started.
  - The cast-time Unreal run that stalled at 1 result has no counterpart here: the TS soak with cast times on runs 3164 runs in about 35 s.
- **The bot is far from beating the game on the current numbers.**
  - Without the Temple, floor 3 or higher happens in 2–6% of runs.
  - With the Temple, the climb is slower than the B2 curve.
  - This is a balance question for a later stage. No values were changed.

## How to run

```
npm run soak -- --runs 40 --mult 1.3                 # Unreal defaults (cast times on, sidebar buys)
npm run soak -- --runs 40 --mult 1.3 --nobuy         # B1
npm run soak -- --runs 40 --mult 1.3 --temple        # B2
```

Options:

- `--seed N`: first run seed.
- `--cast-times 0`: turn cast times off.
- `--fullheal`: debug only; restores the party after every win.
- `--quiet`: print the summary only.
- `--json <file>`: write every run record.
