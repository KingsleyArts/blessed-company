# Blessed Company - Phaser Implementation Plan (draft for director approval)

Written Nov 18, 2026. Goal: a playable web build of Blessed Company in Phaser that matches the Unreal prototype's rules, then
carries the goddess-RPG features forward. The Unreal repo (`tower-of-the-lost`, branch `g6-roster-and-polish`) is the reference; its engine-agnostic
`Source/TowerOfTheLost/Core/` (about 6,000 lines of C++ headers) is the porting source, and its native tests are the behaviour spec.

## Approach and decisions to confirm
- **Stack (recommended):** TypeScript, Vite, Phaser 3 (latest stable 3.x; check whether Phaser 4 is stable and stay on 3 if unsure), Vitest for tests.
  Rules code lives in `src/core/` with **no Phaser imports**, mirroring the C++ `Core/` rule. Phaser scenes only draw and send input.
- **Look:** 2D. Heroes and enemies as sprites (goblin flipbooks exist; others are placeholder shapes), rooms as tile or flat-colour rects. This
  replaces the 3D plane/cube rooms; the room theme (goblin cave) becomes a palette and prop list.
- **Port, do not redesign.** Every rule difference from the Unreal build is a bug unless the director approves it.
- **Determinism:** the C++ RNG is splitmix64. Port it with `BigInt` (or two 32-bit halves) so equal seeds give identical floors. Golden values come
  from the C++ build (see stage 1).
- **Time:** fixed 1/30 s sim step, accumulator in the scene, speed multipliers 1x/2x/4x and a 10x test speed.
- **Saves:** the same key=value `MetaSave` v2 format, stored in `localStorage` (versioned key). Soak bots never touch it.
- **Hosting:** static build, deployable to GitHub Pages or itch.io. No server.
- **Open for the director:** (a) Phaser 3 vs 4; (b) keep canvas-drawn HUD or use DOM overlays for the Temple/menus (recommended: DOM for Temple and
  tuning menu, canvas for in-combat bars); (c) target resolution and mobile support (the GDD wanted wide rooms for PC and mobile); (d) whether the
  repo keeps the `tol.` style debug console (recommended: a query-string and an on-screen debug panel instead).

## Stages
Each stage has a "done when". Do not start a stage before the previous one's tests pass. Commit after each working piece; the director merges.

### Stage 0 - Scaffold (about half a day)
- Vite + TS + Phaser + Vitest, ESLint/Prettier, `npm run dev|build|test|soak`. CI is optional (GitHub Actions running tests and build).
- Folder layout: `src/core/` (pure rules), `src/data/` (generated from `data/*.csv`), `src/game/` (Phaser scenes), `src/ui/`, `public/assets/`.
- A CSV loader plus a build-time script that turns `data/*.csv` into typed TS (replacing the DataTable import). `|` lists, `-1` means TBD.
- Update `CLAUDE.md` build and test commands, the `Source/` and `tests/` rows, and `README.md` for the new stack (docs/ edits need the director's ok).
- **Done when:** `npm test` runs one trivial test, `npm run dev` shows an empty Phaser canvas, `npm run build` produces a static bundle.

### Stage 1 - Core foundations (about 1 day)
Port first, with tests ported from `tests/stat-resolver-event-bus`, `tests/floor-generator`: `StatResolver`, `EventBus`, `ClassData`, `datatable_structs`,
`FloorGenerator` (splitmix64 `Rng`), `CombatSupport` seeds.
- Generate golden fixtures from the C++ build (seed -> floor layout, resolved stats) into `spec-tests/` as JSON, and assert the TS port matches them.
- **Done when:** floor generation for seeds 1-200 and floors 1-10 matches the C++ output exactly, resolver tests pass.

### Stage 2 - Combat simulation (about 2 days; the biggest stage)
Port `CombatSim.h` (1,851 lines), `CombatData.h`, `CastTimes.h`, `MiracleGauge.h`: targeting, threat, Warrior melee-first rule, damage pipeline, attack speed,
cooldowns, enrage, cast times and windups, Divine Healing / Shield / Smite, shields, KO, summons, the six class behaviours and four enemy types.
- Port `tests/combat` and `tests/units/*`. Add a headless "fight" runner that prints a combat log.
- Parity check: run the same scenarios in C++ and TS (fixed seed, fixed party, N fights) and compare win rate and event counts; exact-event parity is
  the goal, a tolerance only with a written reason.
- **Done when:** all ported combat and unit tests pass and the parity scenarios agree.

### Stage 3 - Run, economy and meta (about 1.5 days)
Port `RunFlow`, `RunState`, `RunSim`, `RunConfig`, `RunAuto`, `RunBot`, `RunMapView`, `EssenceSidebar`, `EssenceConfig`, `EssenceApply`, `GearApply`, `Temple`,
`Roster`, `MetaSave`. Faith / Essence / Gold labels, rescue floor 2 (20% opening heal, 30% HP rescue), boss floor 10, kill quota, crystal rule, party roster
(4 heroes, 3 slots), save and load (`localStorage`, v1 and v2 load).
- Port `tests/run`, `tests/essence`. Port the soak bot (`tol.AutoRun` equivalent) as `npm run soak -- --runs 40 --mult 1.3`.
- **Done when:** ported tests pass; a soak on a fresh save reproduces the Unreal numbers (floor 1 often fails with no upgrades; Temple bot reaches floor 3 by run ~4)
  within a stated tolerance, recorded in `reports/sim/`.

### Stage 4 - Playable combat view (about 2 days)
First Phaser scenes: `BootScene` (assets), `RunScene`. Room view (one room at a time, door walk transitions and dimmed neighbours), unit sprites with health and cast
bars (melee bars hidden on sprite units), floating damage and heal numbers, the HUD frame (top bar, speed/pause/Auto, portraits with cooldown bars and HP,
minimap with fog, arrows, Teleport, Essence menu, miracle buttons and gauge, run-over card).
- Goblin flipbooks (idle/walk/attack/hurt/dead, facing sync only for the living; a corpse keeps its side). Placeholder shapes for the rest.
- **Done when:** a full run can be played from floor 1 to a wipe with mouse and keyboard (keys 1-3 for miracles), and Auto plays a floor unattended.

### Stage 5 - Temple, party picker and save (about 1.5 days)
`TempleScene` (or DOM): stat ranks with x1/x10/x100/Max, gear levels, party strip (4 heroes, 3 slots, saved), Faith display, Reset-progress (two-click confirm), results
card -> Temple -> New run loop, music (floors 1-9 and boss floor 10), settings (volume).
- **Done when:** the retry loop works across a browser reload: die, spend Faith, reload, the purchases and the party are still there.

### Stage 6 - Parity pass and playtest (about 1 day)
- Side-by-side run of Unreal and Phaser builds with the director; fix feel gaps (hurt cooldown, animation timing, cast bars, camera).
- Testing-only tuning menu while paused (enemy multiplier 1.3, cast-time scale, heal scale, gauge fill, miracle cost, Smite radius, sprite size). Hidden in production.
- Code review of core ports per CLAUDE.md (rules + correctness lenses) into `reports/code-review/`.
- **Done when:** the director signs off that the Phaser build plays like the Unreal build.

### Stage 7 - Goddess RPG features not yet built (after parity; order set by the director)
From `docs/GODDESS_RPG_PROTOTYPE_CHECKLIST.md`: Faith blessings catalog and milestone payouts; Gold wallet payouts, equipment items and shop; Assassin
and Priestess gear rows; resolve the open roster questions (Assassin unlock, rescue with a full party); more miracles; tooltips; balance pass and soak validation;
more enemy and hero art; the real cave environment; remaining unreviewed code.

### Stage 8 - Release
Static build to GitHub Pages or itch.io, asset and licence register (`reports/assets/register.md`) filled in, trademark check for "Blessed Company",
video, docs (decisions recorded in DESIGN-DECISIONS.md by the director). The director publishes.

## Asset carry-over
Copy from the Unreal repo `Assets/` into `public/assets/` only what the register says is cleared: `Sprites/goblin_grunt*` (source and licence are DIRECTOR TO FILL),
the two music tracks ("Into the Depths", "No Turning Back"; pack licence in the register). Anything with an unclear licence stays out of the public repo until the
director fills the register row.

## Risks
- **CombatSim parity** (largest port, many rule subtleties): mitigate with golden scenarios from C++ and porting tests first.
- **BigInt performance** in the RNG: only used at floor generation and seeding; fine.
- **Float differences:** use plain JS doubles but keep the same operation order; avoid `Math.fround` unless a test shows C++ float drift matters.
- **Scope creep:** Stage 7 waits until Stage 6 is signed off.
- **Browser audio autoplay:** start music after the first click.
