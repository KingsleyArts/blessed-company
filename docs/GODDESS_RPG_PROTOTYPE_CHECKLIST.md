# Goddess RPG Prototype Checklist

Title approved Nov 17: **Blessed Company** (the old title "Blessed Company" now belongs to a separate Metroidvania). A new repo named `blessed-company` carries the renamed docs for a Phaser build; this Unreal repo keeps the old internal names.

Written Nov 16, 2026 from a code inspection of branch `g4-temple` (not merged to main). Edit this file freely: tick boxes as work lands.

## How to read this file

- `[x]` complete and code-verified. `[ ]` anything else.
- **Reported** = the handoff said it was done. **Verified** = confirmed in the code, the native tests (14 suites pass) or a headless run in this inspection. A task is never `[x]` on a report alone.
- **Status:** Complete, Partial, Missing, Needs Verification.
- **Priority:** P0 required for a complete playable prototype; P1 shows the management-sim direction; P2 optional or after the class.
- **ECON** marks a task that depends on the pending economy decision (Plan section C, Transition doc sections 6 and 7). Do not start an ECON task before that decision is approved.
- Naming warning: in code today `essence` is the **in-run** currency (shown to the player as "Gold") and `gold` / `MetaSave::gold` is the **permanent** currency (shown as "Essence"). The proposed design uses the opposite words. See Plan section C.

---

## 1. Project Foundation

- [x] **F1 Native Core builds and tests pass** — P0 · Complete (verified) · `Source/BlessedCompany/Core/`, `tests/*/tests.cpp` (14 suites via `native_all.bat`).
- [x] **F2 Editor and game targets build with UBT** — P0 · Complete (verified Nov 16, both targets Succeeded). Close the editor first or the DLL link fails.
- [x] **F3 Headless run command (`tol.AutoRun`, soak scripts)** — P1 · Complete (verified) · `Run/TolAutoRunCommand.cpp`. Only instant (non-live) runs are fast enough for soaks.
- [x] **F4 Merge `g4-temple` to main** — P0 · Complete (Nov 17, 9d017ee; branch deleted) ·  Nothing from the Temple, rank rework, tutorial floor, rescue heal or music work is on main yet. Acceptance: main builds, 14 suites pass, branch deleted locally and on origin.
- [ ] **F5 Apply the new title (approved: Blessed Company)** — P1 · In preparation (docs copied to the `blessed-company` folder Nov 18; shelved for the Unreal repo, applies to the Phaser build) · Deps: Plan phase 8. Do not rename the module, folders, `.uproject` or class prefixes before approval; plan a separate rename step (Plan phase 8).
- [ ] **F6 Document the new design (this file, Plan, Transition)** — P0 · Partial (Nov 18: README and DESIGN-DECISIONS sections 9-10 updated; `gdd.md` still describes the jam game) · The three planning documents exist; `docs/gdd.md` and `docs/DESIGN-DECISIONS.md` still describe the jam game. Update them after approval.

## 2. Temple and Management Hub

- [x] **T1 Temple screen outside runs, game opens on it** — P0 · Complete (verified) · Reported: yes · `UI/TolHud.cpp` `DrawTempleOverlay`, `Run/TolGameMode.cpp`. Starts with no run.
- [x] **T2 Start an expedition from the Temple** — P0 · Complete (verified) · Reported: yes · `URunManager::StartRun`.
- [x] **T3 Temple stat upgrades (ranks, x1/x10/x100/Max buy)** — P0 · Complete (verified) · `Core/Temple.h`, `UI/TolTempleLayout.h`. **ECON:** currency and wording change if Faith is approved.
- [x] **T4 Temple gear levels (weapon and armor per class, level cap 5)** — P0 · Complete (verified) · `Core/Temple.h`, `Core/GearApply.h`. **ECON:** under the proposal these are bought with Gold, not Faith.
- [ ] **T5 Temple shows party roster, hero condition and equipment together** — P1 · Missing · Deps: P2, E1. Acceptance: one screen shows every owned hero, level, equipment and current HP condition.
- [ ] **T6 Temple tooltips / explainers (what each currency does)** — P1 · Missing · Deps: ECON decision. Acceptance: hovering a currency or upgrade explains it in one sentence.

## 3. Hero Systems

- [x] **H1 Hero data from CSV (name, class, stats, abilities)** — P0 · Complete (verified) · Reported: yes · `data/ClassData.csv`, `Core/ClassData.h`, `Core/datatable_structs.h`.
- [x] **H2 Warrior (tank, Taunt)** — P0 · Complete (verified) · `tests/units/warrior`.
- [x] **H3 Mage (ranged, Fireball)** — P0 · Complete (verified) · covered by the combat tests (there is no `tests/units/mage` folder). Damage works; no projectile visual.
- [x] **H4 Priestess (heal, GroupHeal)** — P0 · Complete (verified) · `tests/units/priest`. Code calls her the Priest.
- [x] **H5 Stat bonuses (ranks, gear, sidebar) applied to heroes** — P0 · Complete (verified) · `Core/EssenceApply.h`, `Core/GearApply.h`, `Core/StatResolver.h`.
- [x] **H6 Hero HP and KO state; dead heroes teleport to the Exit room or despawn** — P0 · Complete (verified in tests; live visual check still open) · `Core/CombatSim.h`, `Combat/CombatManager.cpp`.
- [x] **H7 Basic attacks and one unique ability per hero** — P0 · Complete (verified) · `data/AbilityData.csv`.
- [x] **H8 Three more heroes already exist: Assassin, Barbarian, Summoner** — P1 · Complete (verified) · beyond what the handoff reported. `tests/units/assassin|barbarian|summoner`. Not reachable by the player (no party selection).
- [ ] **H9 Mage projectile visual** — P2 · Missing (presentation only) · Deps: none. Acceptance: a visible bolt travels from the Mage to the target.
- [ ] **H10 Hero experience and levels** — P1 · Missing · Deps: ECON (does XP replace ranks?). Acceptance: a hero gains levels from kills and the stat gain is visible on the hero panel.
- [ ] **H11 Hero art (sprites)** — P2 · Missing · See `docs/` sprite plan artifact; placeholders are spheres and cubes.

## 4. Party Composition

- [x] **P1 Roster data: owned heroes, active slots, reserves, persisted** — P0 · Complete Nov 18 (`Core/Roster.h`, `MetaSave` `activeParty` key, tests in `tests/run`) · Deps: S1. Files to extend: `Core/MetaSave.h`, `Core/RunFlow.h` (`Start` takes a party list already). Acceptance: save file lists owned heroes and the three active slots.
- [x] **P2 Party selection screen in the Temple (4 heroes, 3 slots)** — P0 · Complete Nov 18, live-checked once (party strip in the Temple, `Party:<Class>` buys); Assassin is owned from the start as a draft; the Priestess stays a rescue and, once rescued, can be benched · Deps: P1. Acceptance: player swaps a hero, starts a run, and the run starts with exactly that party.
- [ ] **P3 Priestess stays a floor-2 rescue; her unlock persists after the first rescue** — P0 · Partial · **Decided Nov 17.** Today she is a floor-2 rescue and is not kept between runs (`kPersistMeta` is off). See Transition doc section 10.
- [ ] **P4 Hero recruitment / unlock path for the 4th hero** — P1 · Missing · Deps: P2, ECON.
- [ ] **P5 Role synergy feedback (tank/healer/damage warnings in the picker)** — P2 · Missing.

## 5. Dungeon Exploration

- [x] **D1 Generated floors, connected rooms, four-direction doors** — P0 · Complete (verified) · Reported: yes · `Core/FloorGenerator.*`, `tests/floor-generator`.
- [x] **D2 Room transitions and party walk** — P0 · Complete (verified) · `UI/TolRoomView.*`, `Run/RunManager.cpp`.
- [x] **D3 Minimap with discovered rooms** — P0 · Complete (verified in HUD code) · `UI/TolMapLayout.h`, `TolHud.cpp` `DrawMinimap`.
- [x] **D4 Floor progression and scaling** — P0 · Complete (verified) · floor scaling 1.25 per floor, enemy multiplier 1.3 (`tol.EnemyMult`).
- [x] **D5 Kill quota, teleport crystal, floor 1 crystal within 2 rooms of the entry** — P0 · Complete (verified, tests).
- [x] **D6 Room-clear and return to the Temple** — P0 · Complete (verified).
- [x] **D7 Optional Auto navigation (Auto button)** — P1 · Complete (verified) · `Core/RunAuto.h`; Auto never buys.
- [ ] **D8 Rescue floor kept (decided Nov 17)** — P0 · Needs Verification · tied to P3. Fix already made: 20% opening heal (`rescueStartHealFraction`).
- [ ] **D9 Boss at floor 10 and a victory state** — P1 · Needs Verification · `endRunAfterBossFloor = true`; boss behavior and a proper victory screen not re-checked.

## 6. Automatic Combat

- [x] **C1 Detection, targeting, melee/ranged ranges** — P0 · Complete (verified) · `Core/CombatSim.h`.
- [x] **C2 Damage pipeline, attack speed, cooldowns** — P0 · Complete (verified).
- [x] **C3 Threat and Warrior protection** — P0 · Complete (verified).
- [x] **C4 Automatic heal and ability use** — P0 · Complete (verified).
- [x] **C5 Enemy behaviors (Grunt, Brute, Archer, Shaman)** — P0 · Complete (verified) · `tests/units/*`.
- [x] **C6 Party defeat ends the run** — P0 · Complete (verified).
- [x] **C7 Pause and speed controls** — P0 · Complete (verified in code: Pause button, 1/2/4x, 10x test speed) · `UI/TolHudLayout.h`. Live visual check not repeated.
- [ ] **C8 Combat log / balance report from the sim** — P2 · Needs Verification.

## 7. Miracle Gauge and Divine Intervention

Nothing in this section exists in code (searched for Miracle and Faith: no matches).

- [x] **M1 Miracle Gauge data model (capacity, fill, spend), pure Core code with tests** — P0 · Missing · Deps: none. Files: new `Core/MiracleGauge.h`, `tests/`. Acceptance: tests cover fill, cap, spend, reset between expeditions; never touches Faith. Done Nov 17: `Core/MiracleGauge.h`, tests in `tests/combat`.
- [x] **M2 Gauge fills from combat events** — P0 · Missing · Deps: M1. Hook: event bus (`Core/EventBus.h`, `docs/COMBAT-HOOKS.md`). Acceptance: damage dealt and healing done fill the gauge at the documented rates. Done Nov 17: 1 per party hit, 2 per party heal (placeholders); miracles and enemies never fill it.
- [x] **M3 Divine Healing miracle** — P0 · Missing · Deps: M1. Acceptance: manual activation heals the party or the lowest-HP living hero; refused when the gauge is short or nobody is hurt. Done Nov 17: `CombatSim::CastMiracle`, 40 gauge, heals the most injured hero for 40% max HP.
- [x] **M4 Divine Shield miracle** — P0 · Missing · Deps: M1. Acceptance: a chosen or auto-picked hero takes no damage for N seconds; ends on timer or on KO. Done Nov 17: 30 gauge, 5 s of no damage on the most injured unshielded hero.
- [x] **M5 Gauge and miracle buttons on the HUD** — P0 · Missing · Deps: M3, M4. Acceptance: gauge bar, two buttons with cost, greyed when unaffordable, visible feedback on use. Done Nov 17 (code + screenshot): buttons and bar in the top row, keys 1 and 2; floating text on cast.
- [ ] **M6 Edge cases (no living target, fight over, pause, speed 10x, run end resets gauge)** — P0 · Missing · Deps: M3, M4.
- [ ] **M7 More miracles** — P2 · Missing.

## 8. Faith and Permanent Progression

- [x] **FP1 Permanent currency exists and persists across runs (in memory)** — P0 · Complete (verified) · `MetaSave::gold`, paid per room and boss. **ECON:** this is the code that would become Faith.
- [x] **FP2 Introduce Faith (rename or alias, run-over card shows Faith earned)** — P0 · Missing · **ECON** · Deps: economy approval. Acceptance: UI says Faith for the permanent divine currency everywhere; no gameplay change. Done Nov 17 (labels only; code keeps the old names until the rename).
- [ ] **FP3 Faith sources: milestones and partial reward on failure** — P1 · Partial · today it pays per cleared room, even after a wipe. Add milestone bonuses (first boss, new best floor).
- [ ] **FP4 Blessings catalog (permanent party blessings)** — P0 · Partial · Temple stat ranks work as blessings; they need names and descriptions. **ECON.**
- [ ] **FP5 Unlockable blessings / divine capabilities (e.g. miracle capacity)** — P1 · Missing · Deps: M1, FP2.
- [x] **FP6 Save and load of permanent progress** — P0 · Partial · `Core/MetaSave.h` serializer and `Meta/TolMetaStore.cpp` exist and are tested; **disabled** by `kPersistMeta=false` in `Run/RunManager.cpp` on the director's order. Acceptance: enable, save, quit, relaunch, values restored; old-save migration per Plan section C. Saving turned back on Nov 17 (v2 file); soak bots never touch the save.

## 9. Essence and Temporary Expedition Upgrades

- [x] **ES1 In-run currency, per kill and per room payout** — P0 · Complete (verified) · `RunConfig::essencePerKill/PerRoom`, code name `essence`. **ECON:** label flips from "Gold" to "Essence".
- [x] **ES2 In-run sidebar upgrades per hero (ranks, scaling cost, x10/x100)** — P0 · Complete (verified) · `Core/EssenceSidebar.h`, `Core/EssenceConfig.h`.
- [x] **ES3 Upgrades reset every run** — P0 · Complete (verified) · `EssenceSidebar::Reset`.
- [x] **ES4 Unspent in-run currency is discarded** — P0 · Complete (verified; no conversion). Open design question: convert a share to Faith?
- [x] **ES5 Label swap back (in-run = Essence)** — P0 · Missing · **ECON** · UI strings only (`UI/TolEssenceLayout.h`, `TolHud.cpp`, run-over card). Done Nov 17 (labels only).
- [ ] **ES6 Essence cannot buy permanent things (rule check)** — P0 · Needs Verification · confirm no Essence-to-meta path; add a test.

## 10. Gold and Party Finances

- [ ] **G1 Persistent Gold wallet (separate from Faith)** — P0 if Option B or C approved · Missing · **ECON** · Files: `Core/MetaSave.h`, `Core/RunFlow.h` (results), `Run/RunManager.cpp`.
- [ ] **G2 Gold sources: drops, treasure rooms, boss, expedition rewards** — P0 · Missing · **ECON** · today's treasure rooms and per-room payouts pay the permanent currency, so Gold needs its own payout table in `Core/RunConfig.h`.
- [ ] **G3 Gold sinks: equipment purchase** — P0 · Missing · **ECON** · Deps: E1.
- [ ] **G4 Rule: no Faith or miracle can create Gold** — P0 · Missing · **ECON** · today `partyLuck` includes GoldPerKill/GoldPerRoom bonuses bought with the permanent currency; these must go or be re-labelled.
- [ ] **G5 Repairs / durability / upkeep** — P2 · Missing · recommended defer (death-spiral risk).

## 11. Equipment and Loot

- [x] **E0 Two gear slots per class with permanent levels plus temporary drop levels** — P0 · Complete (verified) · `Core/Temple.h`, `Core/GearApply.h`, `data/GearData.csv` (placeholder modifiers).
- [ ] **E1 Fixed equipment items (weapon, armor) as data with names and stats** — P1 · Missing · Deps: ECON. Replace the level-only stub rows in `data/GearData.csv`.
- [ ] **E2 Simple inventory and equip/unequip per hero** — P1 · Missing · Deps: E1, P1. Acceptance: items owned persist; equipping changes resolved stats.
- [ ] **E3 Equipment from dungeon rewards** — P1 · Partial · gear-level drops from Treasure, Elite and Boss rooms exist (temporary levels); items do not.
- [ ] **E4 Equipment shop with Gold** — P1 · Missing · Deps: G1, E1.
- [ ] **E5 Rarity, affixes, crafting** — P2 · Missing.

## 12. Expedition Results and Retry Loop

- [x] **R1 Results card (floor, cause of death, best floor, rooms)** — P0 · Complete (verified) · `UI/TolEssenceLayout.h` `FormatResultLines`.
- [x] **R2 Earned rewards granted; best floor tracked** — P0 · Complete (verified).
- [x] **R3 Temple and New Run buttons; run state resets** — P0 · Complete (verified).
- [x] **R4 Early failure then Temple purchase then retry works** — P0 · Complete (verified by soak: floor 1 fails often with no upgrades, progress through floor 3 to 10 with the Temple bot).
- [ ] **R5 Results show Faith, Essence kept/lost, Gold earned, hero XP** — P0 · Missing · **ECON** · Deps: FP2, G1.
- [ ] **R6 Retreat option with partial reward** — P1 · Partial · Abandon exists (no carry-over of in-run currency); confirm what it pays.

## 13. User Interface and Feedback

- [x] **U1 Main HUD: floor, resources, party panel, minimap, controls** — P0 · Complete (verified) · `UI/TolHud.cpp` (canvas HUD, not UMG).
- [x] **U2 Ability cooldown indicators** — P0 · Complete (verified in code; purple bar per unit) · `TolHud.cpp` near line 736.
- [x] **U3 Music (Into the Depths floors 1-9, No Turning Back boss floor)** — P1 · Complete (verified; assets via Git LFS, cooked via `Config/DefaultGame.ini`).
- [ ] **U4 Hero selection / stats panel for management** — P0 · Partial · in-run sidebar shows stats; no Temple hero panel. Deps: P2.
- [ ] **U5 Miracle Gauge UI** — P0 · Missing · see M5.
- [ ] **U6 Equipment UI** — P1 · Missing · see E2.
- [ ] **U7 Explainer tooltips** — P1 · Missing.
- [ ] **U8 Real art on UI (panels, icons, portraits)** — P2 · Missing · canvas HUD can take textures; UMG not required.
- [ ] **U9 Rename remaining player-facing "Blessed Company" strings** — P1 · Missing · Deps: F5.

## 14. Gameplay Balancing

- [x] **B1 Floor 1 with no upgrades usually fails (18 of 40 bot runs die on floor 1 at multiplier 1.3)** — P0 · Complete (verified by soak, Nov 16; the bot does not buy in that mode).
- [x] **B2 Temple-bot progression curve (floor 3 by run ~4, floor 10 by run ~40)** — P0 · Complete (verified, Nov 16 soak).
- [ ] **B3 Rescue fight not punishing** — P0 · Needs Verification · 20% opening heal added Nov 16; needs live playtest by the director.
- [ ] **B4 Re-balance after the economy change (Faith/Gold costs, miracle fill rates)** — P0 · Missing · **ECON** · Deps: all of sections 7-10.
- [ ] **B5 Miracle Gauge pacing: a miracle usable roughly once per fight at start, twice with blessings** — P1 · Missing · Deps: M1.
- [ ] **B6 Re-run the soak with a 3-hero party and a 4th hero** — P1 · Missing · Deps: P2.

## 15. Automated and Manual Testing

- [x] **Q1 14 native suites pass** — P0 · Complete (verified Nov 16).
- [ ] **Q2 Tests for every new system (gauge, miracles, wallet, roster, equipment, migration)** — P0 · Missing · each task above carries its own test.
- [ ] **Q3 Headless regression run after each phase (`tol.AutoRun` instant, 40 runs)** — P0 · Partial · scripts exist (scratchpad `soak2.ps1`); move them into `scripts/`.
- [ ] **Q4 Manual playtest script covering the 12-step Definition of Done** — P0 · Missing.
- [ ] **Q5 Clean-launch test of the packaged build** — P0 · Missing · Deps: packaging.
- [ ] **Q6 Code review of Core/Run/Meta changes (CLAUDE.md review gate)** — P0 · Partial · done for g5 and g6 (`reports/code-review/g5-economy-correctness.md`, `g6-roster-correctness.md`); the Nov 14-16 changes are still unreviewed.

## 16. Class Submission

- [ ] **X1 Packaged Windows build runs without extra software** — P0 · Missing.
- [ ] **X2 Gameplay video** — P0 · Missing.
- [ ] **X3 AI-agent workflow documentation (agents used, prompts, reviews, what went wrong)** — P0 · Partial · `CLAUDE.md`, `.claude/agents/`, `docs/reviews/` exist; add a short process write-up.
- [ ] **X4 Asset and AI-tool register** — P1 · Partial · draft at `reports/assets/register.md` (Nov 18); the director fills the DIRECTOR TO FILL rows (goblin sheet source and licence, AI tools).
- [ ] **X5 Submission written and delivered by the student** — P0 · Missing · never done by an agent.

## Later (director, Nov 18)
- Melee swing/windup timer bars are a placeholder for testing. Done Nov 18 for sprite units (goblins): melee bars are hidden, cast bars stay for spells; the Warrior and other cube/sphere units keep the bars until they get sprites.
- Open design questions (Nov 18): how the Assassin is obtained; what happens when the Priestess is rescued with three other heroes picked (replace, wait for a free slot, or guest); Temple gear rows for the Assassin and Priestess.
- Goblin cave theme is placeholder (`UI/TolRoomTheme.h`, `tol.RoomTheme 0|1`); real art waits on the asset decision (`Low Poly Dungeon Pack` in `Assets/` is a candidate).
