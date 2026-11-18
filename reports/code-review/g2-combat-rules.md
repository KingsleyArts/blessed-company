# Code review: g2-combat-core, lens RULES (doc fidelity)

Change: `git diff main..HEAD` on branch g2-combat-core (G2 commits c36937e, 58fc929, e79d124 on top of the G1 commits). Checked against `docs/COMBAT-HOOKS.md`, `docs/DESIGN-DECISIONS.md` (incl. section 7), `docs/SCHEDULE.md`, `CLAUDE.md` and `data/*.csv`. Read only; tests not run (correctness lens).

## Verdict: send back (one MAJOR, cheap to fix)

The combat core follows the documented rules closely: fixed 1/30 s tick, damage and heal pipelines in the documented order, threat formula (damage x Threat stat x ThreatMultiplier, Warrior 1.5 as the Threat stat, Barbarian 1.2 hidden), Taunt, tank lowest-threat targeting, healing threat at 25 percent to every enemy, 0.5x summon threat, Spirit targeting/wipe/removal rules, enrage 45 s / +10% / 5 s, post-win revive only with a living healer, rest room 30% plus revive, 85% smite rule, 40% ally-low, movement re-evaluation every 0.25 s with 50-unit hysteresis, separate combat RNG stream, floor scaling 1.08^(floor-1), reinforcement waves. Class, enemy, cooldown and movement values are read from `data/` (`ClassData.csv`, `EnemyData.csv`, `AbilityData.csv`, `AbilityEffectData.csv`). The one real problem is where the draft ability values live.

## Findings (most severe first)

### 1. MAJOR: draft ability-effect values are hard-coded in C++, not in `data/`
`Core/CombatSupport.h` `DraftForEffect` (lines ~86-110) and `Core/CombatSim.h` `ResolveValue` (line 962). `data/AbilityEffectData.csv` holds -1 (TBD) for every effect value; the sim substitutes C++ constants (Taunt +100 threat, 30% reduction for 4 s, Group Heal x2, Execute x3, Rage +50% AS / 20% lifesteal for 5 s, Spirit 10 s, Fireball x3). CLAUDE.md: "Every tunable value lives in `data/*.csv`", and drafts are allowed only when the data-designer marks them as drafts in data. Failure scenario: the Sunday balance pass (or the data-designer) edits a CSV cell expecting the effect to change; the `-1` rows still silently resolve to the C++ numbers, and any value left at -1 is unchanged. A future change of a real value to 0 vs "TBD" is also ambiguous because `value < 0` is the TBD test. The values are clearly marked DRAFT in the code and are reasonable, so this is a placement problem, not a bad-value problem.
Fix: data-designer writes these eight drafts into `AbilityEffectData.csv` (Notes keep PLACEHOLDER); delete `DraftForEffect`; treat -1 as "effect not configured" (log and skip) instead of a hidden default. The 10 s Spirit fallback (CombatSim.h line 1107) goes the same way.

### 2. MINOR: other invented values live in `CombatConfig` / code
Marked DRAFT and reasonable, but tunables outside `data/`: `kHealBase` 8 (documented in DESIGN-DECISIONS 3 as the Priest heal, but not in any CSV; also used for the Shaman, comment says DRAFT), `defenseCap` 90 (CombatSim.h line 52; StatDef `DefensePct` Cap is -1/TBD, the resolver's `SetLimits` is the place for it once the data-designer fills Cap), `baseCritFactor` 1.5, `enrageCap` 120, `separation` 100, `areaRadius` 300 (data says "radius TBD"), Spirit block (hp 40, damage 5, 1 attack/s, speed 300, range 150), spawn positions. Acceptable for G2; list them for the director and move into data before the balance pass.

### 3. MINOR: invented constants that are not marked as drafts
- Damage-taken reduction clamp `0.95` (CombatSim.h line 389).
- Movement geometry factors: stand-off 0.8 x range (melee/ally), 0.9 x bound, retreat hold = max(PreferredDistMin, 1.25 x RetreatDistance) (lines 828, 837, 848, 857), Spirit spawn offset 120 (line 1109).
- Enemy target stickiness: a tied-best target is kept rather than re-rolled (line 754). Docs say only "ties broken by the combat stream".
- Threat goes only to the damaged enemy (line 507 comment states it as the rule). COMBAT-HOOKS 7 says "every enemy table the attacker is engaged with"; "engaged" is undefined. The reading is sensible (and matches a Warrior spreading threat by hitting each enemy), but it is an interpretation and is not marked DRAFT. See doc question A.
Failure scenario for the clamp and stickiness: none breaks a rule today; they are silent design choices a later reader will mistake for spec. Add a DRAFT tag or a one-line note.

### 4. MINOR: Priest positioning does not match "stays farthest back"
COMBAT-HOOKS 8b: Priest "Stays farthest back while keeping the lowest-HP ally within Range; strongest safety-seeking." `ComputeGoal` (lines 843-861) for Backline only retreats when an enemy is inside `RetreatDistance`; with no hurt ally it advances until within min(PreferredDistMax, Range)=700 of its target. Scenario: party spawns at x=-800, enemies at +800 (1600 apart); a full-health Priest walks forward to about 700 from the enemy instead of holding back near the party's back line. Not a G2 gate issue (G2 is Warrior and Mage) but it will show when the Priest rescue lands. Fix before G3.

### 5. MINOR: Lifesteal heals raise HealApplied and so generate 25% healing threat on every enemy
Subscribe block, lines 548-550 and 525-533: `ApplyHeal` for lifesteal raises `HealApplied`, so a Rage-ing Barbarian adds healing threat to all enemies on every hit. COMBAT-HOOKS 5/7 say HealApplied drives healing threat but do not say lifesteal counts. Barbarian is not in G2. See doc question D.

### 6. MINOR: runtime data loading path will not work in a packaged build
`Combat/CombatManager.cpp` `LoadData` reads `ProjectDir()/data/*.csv` from disk (same pattern in `TolUnit.cpp`). The comment in CombatData.h says the DataTable importer is the real loader in game, but the Combat Manager bypasses the `DT_*` assets. Fine in the editor and headless G2 runs; the G3 packaged backup build "must run without extra software" and will have no `data/` folder unless it is staged. Fix before G3 (read the DataTables, or stage `data/` as non-asset files and add a test for it).

### 7. MINOR: ownership and docs-edit items for the ownership lens / orchestrator
- `docs/DESIGN-DECISIONS.md` (director-owned) was edited in commits 58fc929 and e79d124 with two bullets labelled "Nov 12, director". `data/EnemyData.csv` and `Content/Data/DT_EnemyData.uasset` (data-designer / editor-integrator) were edited in the same commits. All commits have the same git author, so I cannot tell which agent wrote them. If the director dictated these (the bullets say so), keep them; if a builder agent wrote the docs bullets on its own, that is an ownership violation (BLOCKING per the role rules). Please confirm.
- `docs/DESIGN-DECISIONS.md` section 3 still says "packs of about 3 with ~900 total HP"; with Grunt HP 150 a three-Grunt pack is 450 HP. Stale doc line (doc question C).
- `Run/TolGameMode.cpp` (G1 test mode) still spawns Warrior, Priest and Mage, which contradicts the new section 7 rule that a first run starts with Warrior and Mage only. Test-only, but align it.
- `Taunts` (Brute) and `AutoActionId` columns are read but unused; behavior is derived from RoleTag. Not wrong for G2; Brute taunting needs a rule before G3.

## Checked and found faithful (no finding)
- Pipeline order: crit, attacker mods (inside the resolved Damage stat), Defense %, Fortitude floor of 1, apply, DamageDealt and DamageTaken events. Rend Armor and Death Defy are Stretch with no data; the insertion points are marked. Healing Echo is skipped per SCHEDULE.
- Heal: Heal Power, clamp to missing HP, HealApplied with effective amount.
- Grunt data matches DESIGN-DECISIONS section 7 (HP 150, damage 8). Warrior base Threat 1.5 and ThreatMultiplier 1.0, Barbarian 1.2, all from `ClassData.csv`.
- Fight lifecycle: wipe = all party units dead (works for the two-unit start party), summons never count, summons removed at fight end, reinforcements join the same threat tables and count toward quota, win requires no pending waves.
- Combat log is a ring buffer, first-death cause text is kept separately so it survives overflow, log file is written to `Saved/Logs`.
- Combat RNG is separate from the floor streams; fixed tick; frame-rate-independent accumulator (uses an accumulator times speed, which is a reasonable reading of "1, 2 or 4 ticks per frame").

## Doc questions (the code may be right; the docs are ambiguous)
A. Threat distribution: "every enemy table the attacker is engaged with" (COMBAT-HOOKS 7). Is "engaged" = enemies the attacker damaged (current code), or enemies that currently target or are in range of the attacker?
B. Enrage: (1) is the first +10% at 45.0 s (code) or at 50 s? (2) is it additive, 10% x step (code), or compounding? (3) "fails any fight that exceeds the enrage cap" (section 11): is the cap a maximum fight time (code uses 120 s as a draft) or a maximum enrage multiplier? The code reads it as time.
C. DESIGN-DECISIONS section 3 ("~900 total HP" pack) vs the Grunt HP change to 150: update section 3 or leave it as a historical placeholder?
D. Should lifesteal self-heals raise HealApplied (and therefore healing threat and, later, Healing Echo)? Section 5 says echo ticks avoid HealApplied; it is silent on lifesteal.
E. "Heals the lowest-HP ally" (section 5): lowest absolute HP or lowest HP fraction? Code uses the fraction. Cooldown Reduction: the formula is not given; code uses timer rate x (1 + CDR).
F. "Rage: attack speed" and Taunt reduction: is an ApplyModifier value a percent (code: additive percent on the stat) or a multiplier?

## Self-check
Every finding above names a file and line and a scenario or an explicit condition; the only item without a runtime failure is finding 3, kept as MINOR because it marks undocumented design decisions.
