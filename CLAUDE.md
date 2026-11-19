# Blessed Company - Repository Orchestration Rules

This folder is the repository root. The main session is the ORCHESTRATOR; the director (the user) has final say.

> **Stack note (Nov 18, 2026):** the project is now a Phaser 3 + TypeScript + Vite web build (Stage 0 scaffold). Rules live in `src/core/` (no Phaser imports), scenes in `src/game/`, DOM menus in `src/ui/`. The ownership table and gates below are inherited from the Unreal jam; `Source/BlessedCompany/` and `tests/` rows now map to `src/` and `*.test.ts`, and the gate schedule is superseded by `docs/PHASER_IMPLEMENTATION_PLAN.md` stages. `docs/` ownership stays with the director.

## Sources of truth
- The GDD is `docs/gdd.md`, one file edited in place.
- Every tunable value lives in `data/*.csv` (decided Nov 12: CSV is canonical because Unreal imports it as DataTables directly; there is no JSON copy). Lists inside a cell are `|` separated; `-1` means TBD.

## Repository layout

| Path | Contents | Owner |
|---|---|---|
| `docs/` | GDD and `reviews/` | director |
| `data/*.csv` | Tunable values (DataTable sources) | data-designer |
| `src/core/` | Pure TS rules (stat resolver, event bus, floor generator, combat sim); no Phaser imports (lint-enforced) | programmer |
| `src/data/generated/` | Generated from `data/*.csv` by `npm run data`; gitignored | tools-programmer |
| `src/game/`, `src/ui/` | Phaser scenes (canvas) and DOM overlays (Temple, menus) | ui-programmer |
| `src/**/*.test.ts` | Vitest tests next to the rules they cover | programmer |
| `data/narrative/` | Text lines and prompts | narrative-writer |
| `spec-tests/` | Shared rule scenarios as JSON | qa-tester |
| `scripts/` | Data sync and check scripts | tools-programmer |
| `reports/` | Architecture, sim, perf, QA, code-review, milestone reports | the agent that writes each report |
| `.claude/agents/` | Agent definitions | director |

## How work runs: goals, not task lists
- **Each gate is a goal** with a "done when" (see Gates; details in `docs/SCHEDULE.md`). The orchestrator plans the work to reach it: which agents, in what order, how many copies. It keeps going until the gate is met or the work is blocked, and does not wait for the director between steps.
- **Each agent has a goal.** Its definition says what success looks like, what it may decide, and when it must stop and ask. A task prompt names the module or goal plus context the agent cannot find in the repo. It does not list steps.
- **Agents verify their own work** against their "done when" before reporting. A report that says "done" with failing tests is not done.
- **The director is involved at two points:** escalations, and the end-of-day gate review.

## Gates (jam schedule, all times ET)
| Gate | When | Goal in one line |
|---|---|---|
| G1 | end Thu Nov 12 | C++ module builds; stat resolver, event bus, DataTables and Floor Generator exist; a placeholder unit spawns with resolved stats |
| G2 | end Fri Nov 13 | Warrior and Mage beat 3 Grunts with movement, threat and the damage pipeline; a combat log is written |
| G3 | end Sat Nov 14 | Full loop with placeholder art: six classes, four enemies, enrage, node map, crystal and quota, Essence sidebar, gold saved; packaged backup build exists |
| G4 | Sun Nov 15 noon | Freeze: permanent upgrades, death screen, tooltips, boss at floor 10, balance pass done; no new features |
| G5 | Sun, 3+ hours before 8:59 PM | Packaged build clean-launch tested, video recorded, submission filled in and submitted by the director |

Cuts come from the ranked cut order in `docs/SCHEDULE.md`. Cuts are always the director's call. Do not add anything to the plan; a new feature replaces an existing one.

## When to stop and ask the director
Any agent, or the orchestrator, stops and asks when:
- **Design gap:** the docs are unclear or contradict each other, or code and docs disagree. Do not pick one silently.
- **Values:** a defined value would change, or a needed value is missing and nothing in the docs supports a draft. (Drafts the data-designer marks as drafts do not block.)
- **Design results:** a sim or playtest result suggests a design change, not just tuning.
- **Toolchain:** the engine version, a plugin, or a major dependency would change.
- **Ownership:** the work needs files another agent owns and that owner cannot make the change.
- **Schedule:** a gate is at risk, so a cut-order decision is needed.
- **Outward-facing or irreversible:** publishing, uploading, submitting (always the director's action), deleting history, or editing `docs/`.
- **Stuck:** the same failure persists after two serious fix attempts.

Escalate in one message: what is blocked, the question, options with a recommendation, and what continues meanwhile. Only the blocked work pauses. Questions to the director are multiple choice, recommended option first.

## Ownership and parallel work
| Path | Owner |
|---|---|
| `BlessedCompany.uproject`, `Source/*.Target.cs`, `*.Build.cs`, `Core/StatResolver.h`, `Core/EventBus.h`, RNG, `Config/`, `reports/architecture.md` | architect |
| `Source/BlessedCompany/Combat/`, combat logic in `Core/`, `tests/combat/` | combat-programmer |
| `Source/BlessedCompany/Run/`, `Meta/`, `Core/FloorGenerator.*`, `tests/run/`, `tests/floor-generator/` | run-programmer |
| `Source/BlessedCompany/Units/Classes/<Name>*`, `Units/Enemies/<Name>*`, `tests/units/<name>/` | unit-builder (one copy per unit) |
| `data/*.csv` except `RelicData.csv`, `Core/datatable_structs.h`, `reports/data-sync.md` | data-designer |
| `data/RelicData.csv`, `reports/relics/` | relic-designer (design only; run-programmer builds it) |
| `Source/BlessedCompany/UI/`, `Content/UI/<Screen>` | ui-programmer (one copy per screen) |
| `Source/BlessedCompany/Debug/`, `scripts/` except `scripts/release/` | tools-programmer |
| `Content/` except `UI/`, `Art/`, `Audio/`; map and packaging settings; `reports/editor-notes.md` | editor-integrator |
| `Content/Art/`, `Content/Audio/`, `Assets/`, `reports/assets/` | asset-producer |
| `data/narrative/`, `reports/submission/theme-argument.md` | narrative-writer |
| `tests/rules/<area>/`, `spec-tests/<area>/` | qa-tester (one copy per area) |
| `sim/`, `reports/sim/` | sim-balancer |
| `reports/code-review/` | code-reviewer (one copy per lens) |
| `scripts/release/`, `reports/submission/`, `reports/release/` | release-manager |
| `docs/` | director (agents propose edits, never make them) |

- **Single-copy agents:** architect, combat-programmer, run-programmer, data-designer, tools-programmer, editor-integrator, release-manager. Never run two at once; they own shared files.
- **Parallel-safe agents:** unit-builder, ui-programmer (by screen), asset-producer (by set), qa-tester, sim-balancer, code-reviewer, narrative-writer (draft mode). Name the exact module in each prompt, for example "Build the Priest".
- **Before any parallel build:** the architect's shared interfaces and the combat core must exist and be committed.
- **Editor rule:** Unreal assets cannot be merged and an open editor locks C++ builds. Only one agent at a time drives the editor, and the orchestrator tells the director when the editor must be closed for a build.
- **Agents ask; they do not invent.** Missing design detail goes back to the director as a question.

## Review gate
- Changes to `Core/`, `Combat/`, `Run/`, `Meta/` get a code-reviewer (rules + correctness lenses; add ownership and performance after G2 and G3). Data-only, art and UI-layout changes skip review.
- No BLOCKING or MAJOR findings: the orchestrator merges. BLOCKING or MAJOR: back to the builder; after two failed rounds, escalate.
- After each merge run the native tests. If they fail, revert that merge and send the change back.
- Commit after each working system so a bad agent change can be rolled back (the version-control history from Nov 12 may be requested by the Sponsor).

## Jam rules every agent follows
- Game content is created during the contest period (Nov 12 12:00 AM ET to Nov 15 8:59 PM ET). Pre-jam material (design docs, agent and MCP configuration) is declared, not hidden.
- Third-party assets are sourced and recorded in `reports/assets/register.md`; AI tools are not sourced assets but are still listed.
- No trademarks or third-party names in the game, text or video; teen-appropriate; English only.
- The packaged build must run without extra software.
- The submission is made by the director, never by an agent.

## Build and test commands
Run from the repo root (Node 20+).
```
npm install
npm run dev     # CSV -> TS, then Vite dev server (http://localhost:5173)
npm test        # CSV -> TS, then the full Vitest suite (about 2 min: floor-rule sweeps at the C++ seed counts)
npm run test:fast  # everything except the floor-rule sweeps (seconds); golden parity still runs
npm run build   # CSV -> TS, typecheck, static bundle in dist/
npm run lint
npm run soak -- --runs 40 --mult 1.3   # headless tol.AutoRun soak (fresh save); add --nobuy, --temple, --cast-times 0, --seed N, --quiet, --json <file>
npm run test:fast  # also skips autoRun.parity.test.ts (the 3164-run Unreal soak, ~35 s); npm test runs it
npm run fight -- --seed 7 --party Warrior,Priest,Mage --enemies Grunt,Grunt,Brute --floor 2 --cast-times   # one headless fight, prints the log
```
The Unreal build commands and native C++ tests live in the reference repo `C:/dev/tower-of-the-lost` (read-only).

### Golden fixtures (rules parity with the Unreal build)
`spec-tests/core/*.json` come from the real C++ `Core/` in `C:\dev\tower-of-the-lost` (read-only). Regenerate after a deliberate, director-approved rule change:
`powershell -File tools\golden\build_golden.ps1` (needs VS 2022). `src/core/goldenFloor.ts` and `tools/golden/dump_golden.cpp` share the canonical floor format; change both together.

`spec-tests/combat/*.json` (102 combat scenarios, hashed logs and unit state) come from the C++ `CombatSim.h`:
`powershell -NoProfile -File tools\golden\build_combat_golden.ps1`. `src/core/combatScenario.ts` mirrors `Run()` in `tools/golden/dump_combat.cpp`; change both together.
Positions use `src/core/fmath.ts` `hypot` (`sqrt(x*x+y*y)`, what MSVC x64 `std::hypot` returns); never `Math.hypot` in `src/core`, or parity breaks.
