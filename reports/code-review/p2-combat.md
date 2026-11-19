# Code review: Stage 2 combat port (`p2-combat`)

Date: Nov 18, 2026. Lenses: rules (port fidelity vs the Unreal `Core/`) and correctness. Reviewer: the orchestrator session (self-review, not an independent agent).

## Scope
`src/core/`: `combatSim.ts` (port of `CombatSim.h`, 1,851 lines), `combatData.ts`, `castTimes.ts`, `miracleGauge.ts`, `fmath.ts`, `printf.ts`,
`combatSupport.ts` (log formatting), `combatScenario.ts`, `combatTestKit.ts`, and the ported suites. `scripts/fight.ts` (headless runner).
Reference: `tower-of-the-lost` branch `g6-roster-and-polish`, `Source/TowerOfTheLost/Core/` and `tests/combat`, `tests/units/*` (read-only).

## How parity is checked
- `tools/golden/dump_combat.cpp` compiles the real header-only `Core/` with MSVC x64 and runs 102 scripted scenarios: 8 parties x 4 packs x cast
  times on/off, seeds 100-119, every spawn door with waves, fixed waves, a long enrage fight, enemy stat multipliers, a deep-floor wipe, miracles
  (with and without cast times), four multi-fight runs (post-win revive, rest room, prepare-next-fight, a rescue joining before fight 2) and the three
  trigger modes. For each it writes the definition plus FNV-1a-64 hashes of the full combat log, the summary and the end state of every unit (all
  doubles as IEEE bit patterns), and the gauge, enrage step and kill count.
- `combatGolden.test.ts` replays every definition in TS: **102 of 102 match bit for bit** (log, summary, unit state, ticks, fight states, first death).
  No tolerance is used anywhere in the parity check.
- Mutation check: `healThreatFactor` 0.25 -> 0.2501 fails 76 of 102 scenarios (the fixtures discriminate).
- Ported tests: `tests/combat` 91 of 91 `RUN` entries; units Warrior 7, Brute 27, Archer 27 (+2 skipped), Assassin 46, Barbarian 41, Priest 37,
  Shaman 26, Summoner 25 (every `RUN` entry ported). The two Archer tests are the C++ `ARCHER_PENDING_TESTS` block, which is compiled out by default
  in C++ too; they are kept as `it.skip`.

## Findings
| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | MAJOR (found and fixed during the port) | First golden run: 102 of 102 failed on positions a few ulps apart. V8 `Math.hypot` differs from MSVC `std::hypot` in 754 of 2,000 sampled inputs (a correctly rounded hypot still differs in 339). Measured: MSVC x64 `std::hypot` returns exactly `sqrt(x*x+y*y)` (0 of 2,000). | Fixed: `fmath.ts` `hypot = sqrt(x*x+y*y)`, used everywhere the C++ calls `std::hypot`. All 102 match. |
| 2 | MINOR (fixed) | Log time stamps used `toFixed(2)`, which rounds exact decimal ties differently from the C runtime's `%6.2f`. | Fixed: `printf.ts` `fmtF` (ties to even on the exact binary value), with tests. |
| 3 | NOTE | `std::round(float*1e6)/1e6` for `smiteThreshold` is ported with `Math.round`; the two differ only for negative halves and the code path requires `SmiteThreshold > 0`. | Equivalent. |
| 4 | NOTE | Both C++ `std::stable_sort` calls on ability effects go through one TS helper using `Array.prototype.sort`, which is stable (ES2019+). | Equivalent. |
| 5 | NOTE | C++ `lround`, integer division and `static_cast<int>` are ported as explicit helpers (`lround`, `idiv`, `Math.trunc`), never `Math.round` or `|0` on values that can be negative. | Checked. |
| 6 | NOTE | Float data columns are loaded with `Math.fround` so every resolver input equals the C++ `float` widened to `double`. | By design (parity). |
| 7 | MINOR | `CombatLog.add` drops the oldest entry with `Array.shift()` once the ring buffer is full: O(capacity) per add. At the in-game capacity (4,096) this is negligible; the golden runs and `npm run fight` use 2^22 and never fill it. A true ring buffer would only matter if a later stage keeps a large log in the game loop. | Open (performance only; no rule effect). Revisit in Stage 4 if profiling shows it. |
| 8 | NOTE | Unit suites in C++ pin the Priest to design values in their `ReadFile` (Attack/sec 0.8, Group Heal 1.2 or 2). The shipped CSV already holds 0.8 and 1.2, so every pin finds no match in C++ either. Ported as `pinnedData` with the same first-occurrence replace, so a future data change behaves the same in both. | By design (parity). |
| 9 | FOLLOW-UP (carried from p1-core #7) | Enum columns are still not validated against their unions in `csv-to-ts`. The combat readers mirror the C++ readers' fallbacks (unknown RoleTag -> Tank/Melee, unknown EffectType -> Damage), so behaviour matches Unreal's C++ path, but a typo in a CSV would pass silently. | Open; proposal awaits the director. |

No open BLOCKING or MAJOR findings.

## Not covered by this review
- An independent second reviewer (CLAUDE.md asks for a code-reviewer agent; this pass was done in-session).
- Design questions the port deliberately does not answer (they stay with the director): cast-time feel, hurt cooldown and animation feel, how the
  Assassin is obtained, the floor-2 rescue with three heroes picked, Temple gear rows for the Assassin and Priestess. The port reproduces the C++
  behaviour for all of them.
- Unreal-side presentation code (`Source/TowerOfTheLost/Combat/`, actors, widgets): not part of `Core/`, ported in Stage 4.
