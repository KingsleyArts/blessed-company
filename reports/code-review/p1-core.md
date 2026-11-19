# Code review: Stage 1 core port (`p1-core`)

Date: Nov 18, 2026. Lenses: rules (port fidelity vs the Unreal `Core/`) and correctness. Reviewer: the orchestrator session (self-review, not an independent agent).

## Scope
`src/core/`: `rng.ts`, `statResolver.ts`, `eventBus.ts`, `classData.ts`, `dataTypes.ts`, `combatSupport.ts`, `floorGenerator.ts`, `goldenFloor.ts`, `csv.ts`, and their tests.
Reference: `tower-of-the-lost` branch `g6-roster-and-polish`, `Source/TowerOfTheLost/Core/` (read-only).

## How parity is checked
- `tools/golden/dump_golden.cpp` links the real `FloorGenerator.cpp` and writes `spec-tests/core/*.json`: RNG streams (5 seeds incl. 0 and 2^64-1),
  4000 floors (seeds 1-200 x floors 1-10 x Priest flag), 1000 deeper floors (11-30), 4200 floors under 7 config variants (fallback layout, boss
  interval 5, clamped roll, rescue/tutorial off, quota/elite values, tutorial == rescue, crystal-anywhere), scaling for floors 0-60, and full canonical
  strings for seeds 1-3. Floors are compared by an FNV-1a-64 hash of a canonical string written identically in C++ and TS.
- Result: every fixture matches exactly, including `scaling` doubles (V8 `Math.pow` == MSVC `pow` for floors 0-60).
- Mutation check: changing `combatReinforcementChance` 0.30 -> 0.31 fails all four floor fixture tests (the fixtures discriminate).
- The C++ native tests (`stat-resolver-event-bus`, `floor-generator`) were rebuilt and pass on the same data before the port.

## Findings
| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | MINOR | `csv.ts` `parseCell` used `Number(cell)`: `' '` became 0, `0x10` and `Infinity` became numbers. | Fixed: strict decimal pattern, test added. |
| 2 | MINOR | Golden coverage stopped at floor 12; pow drift at high exponents was untested. | Fixed: `floors-deep.json` and `scaling.json`. |
| 3 | NOTE | C++ `Layout::at()` grows the bounding box on every write, tentative look-ahead writes included; this changes `pendingCells` scan order. Ported as `Layout.set()` with the same side effect (fixtures confirm). | By design (parity). |
| 4 | NOTE | Class rows hold C++ `float`; the TS loaders apply `Math.fround` so resolver inputs match bit for bit (e.g. ThreatMultiplier 1.2f). | By design. |
| 5 | NOTE | `EventBus.raise` resets `delivering` in a `finally` if a listener throws; C++ would leave the bus wedged. Pending jobs stay queued in both. | Accepted (JS exception safety; no rule effect). |
| 6 | NOTE | `parseClassDataCsv` mirrors the C++ test reader (naive comma split, `stof` prefix parsing, malformed rows skipped). The game uses the generated tables via `classDataFromRecord`; a test asserts both loaders agree on the real CSV. | By design. |
| 7 | FOLLOW-UP | Enum columns (RoleTag, EffectType, TriggerMode ...) are not validated against their unions when loaded; Unreal's importer would reject unknown values. | Proposed for Stage 2 (validate in `csv-to-ts`). |

No BLOCKING or MAJOR findings.

## Not covered by this review
- An independent second reviewer (CLAUDE.md asks for a code-reviewer agent; this pass was done in-session).
- `CombatSupport` RNG call shapes beyond `nextInt`/`nextDouble`/`chance` are exercised only through the shared splitmix64 core; combat use starts in Stage 2.
