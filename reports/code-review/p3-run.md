# Code review: Stage 3 run layer port (`p3-run`)

Date: Nov 18, 2026. Lenses: rules (port fidelity vs the Unreal build) and correctness. Reviewer: the orchestrator session. This is a self-review, not an independent agent.

## Scope

All files are in `src/core/` except the soak script.

- **Run and meta layer:**
  - `cstd.ts`, `essenceConfig.ts`, `essenceSidebar.ts`, `essenceApply.ts`, `gearApply.ts`
  - `metaSave.ts`, `temple.ts`, `roster.ts`
  - `runConfig.ts`, `runState.ts`, `runFlow.ts`, `runAuto.ts`, `runBot.ts`, `runMapView.ts`, `runSim.ts`
- **Soak driver:** `autoRun.ts` and `scripts/soak.ts`.
- **Suites:** `essence.test.ts` (tests/essence, 22 tests), `run.test.ts` (tests/run, 64 tests), `autoRun.test.ts` and `autoRun.parity.test.ts`.

References, all read-only:

- `tower-of-the-lost`, branch `g6-roster-and-polish`: `Core/` and `tests/run`, `tests/essence`.
- `Run/RunManager.cpp` and `Combat/CombatManager.cpp`, the reference for the soak driver.

## How parity is checked

**1. Native C++ reports.** The C++ suites for tests/run and tests/essence were built with MSVC x64 against this repo's `data/` and run. Their printed reports are pinned as exact string assertions in TS:

- Bot runs over 20 seeds, in two modes: wipes, rescues, average gold, average fights, floor histogram and cause-of-death histogram.
- Rescue win rates: 92% of 50, 96% and 84%.
- Elite fights per run: 2.12.
- The essence bot distribution: four modes, with average ranks and Essence spent.

Together these are about 200 full real-combat runs, which exercise RunFlow, RunAuto, RunBot, the sidebar and CombatSim end to end. Every number matches.

**2. Unreal soak.** The TS soak (`autoRun.ts`) reproduces the Unreal g6 soak of Nov 18 exactly: 3164 runs, floor 1: 1250, floor 2: 1811, floor 3+: 103, best floor 4. See `reports/sim/p3-soak.md`.

This also checks the parts that are not in `Core/`:

- the CombatManager config (float enemy multiplier, random spawn, cast times);
- the entry door;
- the order of essence and gear pushes;
- post-win revive;
- the run-manager step order.

**3. Ported tests.** Every `RUN` entry in tests/run and tests/essence is ported, with the same names, seeds and numbers. tests/ui (UI layout) is out of scope for this stage.

## Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | MINOR | `cstd.ts` `strtod` does not parse C99 hex floats (`0x1p3`). The C++ parsers in `MetaSave`/`StatDefCsv` would accept one. No shipped file or save writes hex floats, and `serializeMeta` writes `%.4f`. | Open. Accepted gap; documented in the file. |
| 2 | MINOR | `Math.pow` (V8) and MSVC `pow` can differ by an ulp. They feed `EssenceSidebar.rankCost` (`floor(x + .5)`) and `partyLuckNextCost` (`lround`). A one-ulp difference changes a cost only if `x` sits exactly on a .5 boundary. Every pinned report and the 3164-run soak match, so no shipped value hits this. | Open. Watch item: if a CSV change ever moves a cost onto a tie, the native report tests catch it. |
| 3 | NOTE | C++ `const Floor& f = flow.CurrentFloor()` references stay valid across a teleport, but a TS object reference does not track the new floor. The ported tests only use `f` before teleporting, so behaviour is the same. | Checked. |
| 4 | NOTE | `std::map` iteration order is ported with `sortedKeys()` wherever order is visible: meta serialization, report histograms and gear keys. | Checked. |
| 5 | NOTE | `EssenceSidebar.buy` takes a wallet object `{ value }` in place of the C++ `int&`. Call sites in `runFlow.ts` write the result back. | Checked by the essence suite. |
| 6 | NOTE | The soak rounds `enemyMult` and the wave time to float with `Math.fround`, because Unreal passes them through `float` (`tol.EnemyMult` is a float cvar; `FCombatWave.AtSeconds` is a float). Without this the parity soak would drift. | By design (parity). |
| 7 | MINOR (fixed) | `autoRun.ts` had its own copy of `partyHpFraction`, and `run.test.ts` had a local `lround`. | Fixed: both now import the shared helpers. |
| 8 | NOTE | `AutoRunParams.fresh` resets a meta that is already empty: the Unreal bot session also starts from zero, so `fresh` changes nothing there either. Kept for parity with the console flag; the CLI does not expose it. | By design. |
| 9 | FINDING for the director | The Unreal g6 soak row labelled `tol.CastTimes 0` matches the TS soak with cast times **on**, run for run. The cast-times-off TS soak gives 1160 / 1820 / 184. The Unreal cvar probably did not take effect in that run. | Reported in `reports/sim/p3-soak.md`. No code change. |

No open BLOCKING or MAJOR findings.

## Not covered by this review

- An independent second reviewer. CLAUDE.md asks for a code-reviewer agent; this pass was done in-session.
- B2 (the Temple-bot climb). It was measured on the Nov 16 build, before the g5 economy merge, so it is not a parity target. See the soak report.
- Design questions the port does not answer:
  - how the Assassin is obtained;
  - the floor-2 rescue when three heroes are already picked;
  - the Temple gear rows for the Assassin and Priestess.

  The port keeps the Unreal behaviour on all three: the Assassin is owned from the start, a benched Priestess is not rescued again, and the Temple sells gear for Warrior and Mage only.
