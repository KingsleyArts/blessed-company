# Blessed Company

A goddess-centered hero management sim with incremental RPG progression. You are the goddess: you send a company of heroes
(Warrior, Mage, Priestess, Assassin; three active slots) into procedurally generated dungeon floors, watch them fight automatically,
spend Essence in the run, and spend Faith in the Temple between runs. Gold is a small wallet for equipment.

## Origin
This repo was started Nov 18, 2026 from the Unreal Engine prototype formerly named Tower of the Lost, to carry the docs, data and rules
into a Phaser (web) build under the new name. The Unreal sources, assets and binaries were not copied. Paths such as
`Source/BlessedCompany/Core/...` and the `tol.` console commands in the docs describe that Unreal prototype (its module was named after the old title); use them as
a reference for porting, not as folders that exist here. The `Core/` rules were engine-agnostic C++ and are the porting source for the Phaser rules code.

## Status of the Unreal prototype (Nov 18, 2026)
- Unreal Engine 5.7 prototype on branch `g6-roster-and-polish` (main = g5 economy merge). Native `Core/` tests pass.
- Built: Faith / Essence / Gold economy, Miracle Gauge with Divine Healing, Divine Shield and Divine Smite, cast times, Temple (ranks, gear,
  party picker), saved progress, goblin flipbook sprites with hurt and dead states, goblin cave room theme (placeholder), testing tuning menu.
- Next: Faith blessings and milestones, Gold wallet payouts and shop, balance pass, real art. A Phaser (web) build and the rename to
  Blessed Company are in preparation.
- See `docs/GODDESS_RPG_PROTOTYPE_CHECKLIST.md` for the full task list and `docs/DESIGN-DECISIONS.md` for what was approved.

## Layout
- `docs/` - GDD (`gdd.md`, still the jam-era design), design decisions, the goddess RPG planning docs, `reviews/`
- `data/` - every tunable value as CSV (Unreal DataTable sources); `data/narrative/` for text
- `src/` - Phaser 3 + TypeScript build: `core/` (pure rules), `game/` (scenes), `ui/` (DOM), `data/generated/` (from CSV)
- `Source/`, `tests/` - legacy Unreal-era folders (empty or notes only)
- `spec-tests/` - shared rule scenarios (seed + inputs -> expected outcome)
- `scripts/` - data sync and check scripts
- `reports/` - architecture, sim, perf, QA, playtest, code-review, asset register, milestone and handoff reports
- `.claude/` - agent definitions (`agents/`) and slash commands (`commands/`)

## Develop
`npm install`, then `npm run dev` / `npm test` / `npm run build`. See `CLAUDE.md`.
