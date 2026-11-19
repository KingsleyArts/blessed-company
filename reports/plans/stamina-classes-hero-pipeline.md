# Proposal: hero stamina, a larger class list, and an automated hero-creation pipeline (DRAFT, Nov 19)

Written by the orchestrator for the director. Nothing here is built. `docs/` is the director's: copy what you approve into the GDD or
`DESIGN-DECISIONS.md`. Every number marked DRAFT is a starting guess for tuning, not a decided value. Each open question lists options
with the recommended one first.

Three parts:
1. **Stamina and rest:** stops the player from using the same three heroes forever.
2. **Class list:** candidate classes drawn mostly from D&D, plus Final Fantasy and World of Warcraft.
3. **Hero-creation pipeline:** what has to exist before the agent can be built, so that creating a hero runs end to end and you only approve or deny the result.

---

## Part 1: Stamina and rest

### Why
The game is a hero-management sim, but nothing currently pushes the player to change the party. Once they find a strong three, they
keep it. Stamina makes rotating heroes the right play without forbidding favourites.

### What this changes in the current design
- `GODDESS_RPG_DESIGN_TRANSITION.md` lists "single-hero training, rest, fatigue" as cut, "not coming back unless approved". This proposal
  brings back a **party** version, so it needs your explicit approval.
- It is a rule addition beyond the Unreal port, so the golden parity fixtures do not cover it. Existing rules stay identical; stamina
  only changes stats through a new modifier.
- "Rest" already names the in-run Rest room. To keep them apart, the new stat is called **Stamina** and the conditions are **Rested**,
  **Weary** and **Exhausted**.

### Proposed rules (all numbers DRAFT)
| Rule | Draft |
|---|---|
| Stamina per hero | 0 to 100. A newly recruited hero starts at 100. |
| Cost | Each hero in the party loses **8 per floor cleared** (a full 10-floor clear costs 80). A wipe costs an extra **10**. |
| Recovery | Each hero who **sat out** an expedition gets **+35**. Heroes who went get nothing. Recovery counts expeditions, not real time: no timers and no reason to wait. |
| Rested (80 or more) | **+10%** damage and max HP for the whole expedition. This is the reward for rotating. |
| Normal (30 to 79) | No change. |
| Weary (1 to 29) | **-15%** damage and max HP. |
| Exhausted (0) | **-30%** damage and max HP. The hero **can still go**: no hard lockouts. |
| When it applies | Condition is checked once, when the expedition starts, and stays fixed for that expedition. |
| Rest rooms | Unchanged: HP and revive only, no stamina. |
| Temple hooks | A Faith upgrade, "Hearth" (**+5 recovery per level**), and a hero condition bar on the Heroes tab. This covers checklist item T5, "hero condition". |

Why this shape:
- **Rewards resting more than it punishes being tired.** Players accept a bonus they can lose more readily than a penalty they must avoid.
- **No hard lockout.** Runs are auto-battles repeated many times, and a hero who refuses to go feels bad in that loop.
- **Cost per floor.** Deep runs tire heroes more than quick ones, which links stamina to how far the player pushes.

### Roster math: the condition this needs
- Today the player owns 4 heroes and takes 3, so only one sits out. Stamina would just mean "swap the tired one for the one left over".
- Rotation becomes a real choice at roughly **two heroes per party slot, about 6 to 9 owned**.
- Those don't have to be 9 different classes. With **named heroes as individuals of a class** (see Q3), two Paladins can share one kit, and the second covers while the first rests.
- That is also what makes the Part 3 pipeline useful: it produces new heroes for existing classes cheaply, and new classes only occasionally.

### What it touches when built
| Area | Change |
|---|---|
| `src/core` | Hero record with stamina; costs applied at run end; condition modifier in the stat resolver. Needs a code-review report. |
| Save file | A new `MetaSave` version that stores stamina for each hero. |
| Temple | Condition bar on the Heroes tab; the Hearth upgrade. |
| Auto-run bot and soak | A rule for rotating the party, so headless soaks stay meaningful. |
| Tests | Cost, recovery, condition thresholds, and save migration. |

### Open questions (Part 1)
1. **What does stamina count?**
   - a) Floors cleared to spend it, expeditions sat out to recover it (recommended)
   - b) Real time (mobile-style timers)
   - c) Expeditions only, flat cost
2. **What happens at 0?**
   - a) A big penalty, still allowed to go (recommended)
   - b) Locked out until rested
   - c) Allowed to go, with a chance of injury
3. **Is a hero a person or a class?**
   - a) Named heroes, each belonging to a class; several heroes can share a class (recommended)
   - b) One hero per class, as today
4. **How many heroes can the player own, and how many go on an expedition?**
   - a) Up to 9 owned, 3 go (recommended)
   - b) Up to 12 owned, 4 go (the GDD's original party of 4)
   - c) Keep 4 owned, 3 go
5. **How are new heroes obtained?**
   - a) A recruitment board at the Temple that refreshes after each expedition; recruit with gold (recommended; this is where pipeline heroes appear)
   - b) Rescues on floors, like the Priestess
   - c) Unlocked with Faith
6. **Are upgrades shared across heroes?**
   - a) Stat upgrades per class (all Paladins share them), gear per hero (recommended; swapping in a fresh Paladin doesn't feel like a downgrade)
   - b) Everything per hero
   - c) Everything shared by the party
7. **Should there be a Rested bonus?**
   - a) Yes, +10% (recommended)
   - b) No, penalties only
8. **What does a wipe cost?**
   - a) An extra 10 stamina (recommended)
   - b) Nothing extra
   - c) The hero is Injured and sits out the next expedition
9. **How is stamina shown?**
   - a) A bar plus the condition word, numbers on hover (recommended)
   - b) Numbers only
   - c) The condition word only

---

## Part 2: Class list

### How the three references are used (IP)
- CLAUDE.md: **no trademarks or third-party names in the game.** The references give us **archetypes and roles**, not names, ability names, characters or art.
- **D&D:** the class names in the 5e System Reference Document (Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, Wizard) are ordinary words. The SRD is released under CC-BY-4.0. If we ever copy SRD **text**, it needs the attribution line. Recommendation: write all our own text.
- **Final Fantasy and World of Warcraft:** use the archetype, rename it. Some job and class names are generic words, but several are strongly tied to one franchise; examples are in the banned-terms list under Part 3. Those get our own names.
- This is a working rule, not legal advice. The trademark check on the game's name is already an open item in `reports/assets/register.md`; check the class names in the same pass.

### What the engine can do today
Abilities are built from shared effects in `data/AbilityEffectData.csv`. Any new class has to fit this vocabulary, or it needs new engine work first.

| Vocabulary | What exists now (`src/core/combatSim.ts`) |
|---|---|
| Effect types | Damage, Heal, AddThreat, ApplyModifier, SpawnSummon |
| Effect targets | Self, SelfIfEnemyInRange, AllAllies, AllEnemies, AreaAroundSelf, AreaAroundTarget, WeakestEnemy |
| Unit targeting | Closest, Weakest, Strongest, HealerFirst, ArcherFirst |
| Stats a modifier can change | Damage, AttackSpeed, Health, Threat, DefensePct, CritChance, CritFactor, HealthRegen, CooldownReduction, Range, HealPower, plus Taunt, DamageTakenReduction, Lifesteal |
| Missing, often wanted | Single-target ally heal (no "weakest ally" target), damage over time, stun or slow, debuffs on enemies (unconfirmed whether ApplyModifier works on enemies), leaps or movement abilities, a summon that heals |

### Current six
- Warrior (Tank)
- Priest (Healer)
- Assassin (melee damage)
- Barbarian (melee damage)
- Summoner (Support)
- Mage (ranged damage)

In D&D terms these already cover Fighter, Cleric, Rogue, Barbarian and Wizard.

### Candidate new classes
Engine fit:
- **Now:** data rows only.
- **Small:** one new effect type or target.
- **System:** a new mechanic.

Ability sketches are DRAFT. Working names are generic. The left column shows what inspired each class, not what it is called in the game.

| # | Working name | Role | Inspired by | Ability sketch (from the vocabulary above) | Engine fit |
|---|---|---|---|---|---|
| 1 | Paladin | Tank / healer | D&D Paladin, WoW Paladin, FF Knight | **Bulwark of Light:** all allies take 15% less damage for 4 s, plus a small group heal | Now |
| 2 | Grave Knight | Tank (self-sustain) | WoW's undead plate knight, D&D Oathbreaker | **Blood Oath:** 25% lifesteal for 5 s, plus threat on every nearby enemy | Now |
| 3 | Druid | Healer (over time) | D&D Druid, WoW Druid, FF Geomancer | **Grove's Breath:** all allies regenerate HP for 6 s | Now |
| 4 | Bard | Support (buffs) | D&D Bard, FF Bard and Dancer | **Battle Hymn:** all allies +20% attack speed for 6 s | Now |
| 5 | Chronomancer | Support (tempo) | FF Time Mage, WoW's time-magic support | **Hasten:** all allies' cooldowns tick faster for 6 s | Now if a timed CooldownReduction modifier works; to confirm |
| 6 | Monk | Melee damage (evasive) | D&D Monk, WoW Monk, FF Monk | **Flurry:** +80% attack speed and +20% defense for 3 s | Now |
| 7 | Duelist | Melee damage (burst) | FF Samurai, D&D Fighter (Battle Master) | **Iai Strike:** big damage on every enemy around the Duelist | Now (keep it distinct from the Warrior's Cleave) |
| 8 | Lancer | Melee damage (dive) | FF's jumping lancer, D&D Fighter | **Skyfall:** leaps onto the weakest enemy and deals area damage | Damage now; the **leap** is Small |
| 9 | Ranger | Ranged damage (physical) | D&D Ranger, WoW Hunter | **Volley:** small damage to all enemies; Multi-Shot upgrades | Now |
| 10 | Sorcerer | Ranged damage (chain) | D&D Sorcerer, FF Black Mage | **Chain Spark:** a bolt that bounces between enemies, using the existing BounceShot stats | Now |
| 11 | Artificer | Ranged / summon | FF Machinist, D&D-style tinkerer | **Deploy Turret:** a summoned turret (reuses SpawnSummon) | Now (turret stats need data) |
| 12 | Warlock | Ranged damage (curse) | D&D Warlock, WoW Warlock | **Hex:** damage over time on the target | Small (damage over time) |
| 13 | Spellblade | Hybrid melee / magic | FF's red-robed hybrid mage, D&D Eldritch Knight | **Arcane Edge:** a melee hit, then a small heal on the weakest ally | Small (weakest-ally target) |
| 14 | Totemist | Support (zones) | WoW Shaman, FF Geomancer | **Healing Totem:** a summoned totem that heals nearby allies | System (healing summon) |
| 15 | Necromancer | Summon damage | D&D Wizard (necromancy), classic MMO necromancer | **Raise Fallen:** turns a dead enemy into a short-lived ally | System (summon from a corpse) |
| 16 | Mimic | Wildcard | FF's enemy-skill learner | **Echo:** casts the last enemy ability it was hit by | System (learned abilities) |

Notes:
- "Shaman" is already a goblin enemy (`data/EnemyData.csv`), so the WoW-style class is called Totemist.
- Rows 1 to 7 and 9 to 11 give **ten classes that need data only**, about 16 classes in all. Rows 12 and 13 each need one small engine change. Rows 14 to 16 are later.
- **19 places in 7 `src/core` files** check class names directly (`roster.ts`, `essenceConfig.ts`, `castTimes.ts`, `runConfig.ts`, `runManager.ts`, `autoRun.ts`, `runBot.ts`). They have to read from data before new classes can be added without code edits. This is prerequisite E1 below.

### Open questions (Part 2)
10. **How many classes should the first wave add?**
    - a) Four that need data only: Paladin, Druid, Ranger, Bard (recommended; one per role gap)
    - b) All ten that need data only
    - c) Pick from the table
11. **Can new classes need engine work?**
    - a) First wave data only; Warlock and Spellblade in the second wave (recommended)
    - b) Allow small engine changes now
12. **Should the game use the familiar class names (Paladin, Druid, Ranger) or invented ones?**
    - a) Familiar generic words, with franchise-specific names replaced (recommended)
    - b) All invented names

---

## Part 3: The automated hero-creation pipeline

### The goal, as I understand it
You give a short request ("a new healer", "two heroes for the Ranger class"), or nothing (the pipeline picks a roster gap). Then:
- The pipeline produces a complete hero:
  - name
  - class (existing or new)
  - abilities
  - stats and data rows
  - bio and voice lines
  - character design
- It proves the hero works and is balanced.
- It hands you **one review packet**. You approve or deny; nothing in between needs you.
- Approve: the hero goes into the game. Deny: it's archived with your reason.

For your assignment, the process itself is part of the deliverable, so it also has to be **logged, repeatable and measurable**.

### Design principles
1. **The language model writes; code checks.** Every step a model produces is followed by a deterministic check (schema, data build, tests, simulation). A model never grades its own work alone.
2. **Narrow vocabulary.** Abilities can only use effect types, targets and stats that exist in the engine. A hero needing anything else is flagged "needs engine work" in the packet, not invented.
3. **Staging, not the live game.** The pipeline writes only to `content-staging/heroes/<id>/`. Only an approval copies the hero into `data/` and `data/narrative/`. This keeps the ownership table intact (the data-designer owns `data/*.csv`) and makes deny a clean delete.
4. **Fix itself or fail.** A failed check sends the step back with the error, up to a retry limit. If it still fails, the packet says **failed and why**. It never stops halfway to ask you, because you only want to act at the end.
5. **Everything is recorded.** Each run saves its inputs, every model output, every check result, the model used, token counts and timing. That is your evidence for the assignment.

### Stages
| # | Stage | Done by | Output | Checked by |
|---|---|---|---|---|
| 0 | Request | You, or the roster-gap finder (code) | `request.json`: role, class (optional), count | Schema |
| 1 | Concept | Concept agent | Fantasy, role, which archetypes inspired it, how it differs from existing heroes | Critic agent: originality, tone, teen rating |
| 2 | Kit | Kit agent | ClassData, AbilityData and AbilityEffectData rows, using the existing vocabulary only | Code: CSV schema, `npm run data`, typecheck, a headless test fight |
| 3 | Name and lore | Writer agent | Name, title, short bio, 3 to 5 voice lines | Code: banned-terms and name-uniqueness check. Critic: tone. |
| 4 | Character design | Visual agent | Design sheet: silhouette, palette (hex), outfit, weapon, how it reads at small size, how it differs from others, plus the image prompt or sprite spec | Critic: matches the style guide and stands apart from existing heroes |
| 5 | Art | Depends on Q16 | Sprite or portrait | Code: size, format, transparency. Logged in the asset register. |
| 6 | Balance | Code (`npm run fight`, `npm run soak`), plus a tuner agent | Win rate, damage, healing and threat against reference parties on fixed seeds | Code: must land inside the balance band (Q17). The tuner may adjust numbers within limits for N rounds. |
| 7 | Review packet | Code | One page: hero card, design, stats, simulation charts, data diff, flags, cost | Code: every section present |
| 8 | Decision | **You** | Approve or deny, with a reason | Code: approve copies staging into the game on a branch and opens a PR. Deny archives the hero and your reason. |

### What has to exist before the agent can be built
In order. E = engine, P = pipeline, D = your decisions.

| # | Item | Why it's a prerequisite |
|---|---|---|
| D1 | Answers to Q1 to Q18 | The agents need fixed rules to work within. |
| D2 | **Style guide** for character art (proportions, palette rules, line weight, a few reference images such as the Temple background) | Without it, each generated design will look like it's from a different game. |
| D3 | **Balance band**: what "balanced" means in numbers | The balance gate needs a pass/fail line. |
| E1 | Classes driven by data: remove the 19 hard-coded class-name checks | Otherwise every new class needs code edits, which breaks automation. |
| E2 | Hero record (name, class, stamina, gear, appearance id) separate from class, with the save migrated to a new version | "Named heroes" depends on it (Q3). |
| E3 | Heroes tab that handles many heroes (list, filter, condition bars) | The tab currently shows 4 cards. |
| E4 | Sprite support for heroes keyed by data (heroes are cubes today; only the Goblin Grunt has sprites) | Generated art needs a place to go. |
| E5 | Stamina rules (Part 1) | So the pipeline's heroes slot into rotation. |
| P1 | Hero package schema (JSON Schema): every field a hero needs | Every stage reads and writes it. The checks validate against it. |
| P2 | Check scripts: schema, `npm run data` on staging, banned terms, unique names, image format | The "code checks" half of principle 1. |
| P3 | Simulation harness that loads a staged hero into `fight` and `soak` without touching `data/` | The balance gate. |
| P4 | Review packet generator, plus approve and deny commands | Your one touch point. |
| P5 | Run log format and storage | The assignment evidence. |
| P6 | Agent definitions and prompts, one per stage, each with "done when", "decide yourself" and "stop" rules like the existing `.claude/agents/*.md` | **The agent itself: the last step, as you asked.** |
| P7 | Trial run: generate about 10 heroes, measure pass rate, retries, time, cost and your approval rate; then tune | Proves the process before it counts. |

### How it would run (recommended)
- A TypeScript script in this repo, `npm run hero:new -- --role Healer`, built on the **Claude Agent SDK**. It runs the stages in order:
  - Each model stage returns JSON that must match the P1 schema.
  - Checks and simulations run as ordinary scripts between stages.
  - The same command works on your PC, on a schedule, or in GitHub Actions.
- A Claude Code skill (`/new-hero`) that only calls the script is the alternative. It's easier to start with, but harder to run unattended and to measure.
- Approve and deny through a **GitHub pull request** opened by the pipeline. The packet is the PR description:
  - **Merge** = approve. **Close with a comment** = deny, and that comment becomes the recorded reason.
  - The pipeline never merges. Opening a PR on your own repo is part of the process you approve once, up front.

### Existing agents this overlaps with
- narrative-writer: names and lore
- data-designer: data rows
- sim-balancer: balance
- asset-producer: art
- code-reviewer: review

Options:
- **a)** New pipeline-only agents that write to staging only (recommended). The existing agents' files stay untouched, and the ownership table gets one new row for `content-staging/`.
- **b)** Reuse the existing agents with a "pipeline mode".

Either way, adding agents to `.claude/agents/` and the new row to CLAUDE.md are your edits.

### Banned-terms list (starter, for P2)
These are franchise-specific, so the check rejects them in any name, ability or text:
- Final Fantasy-specific job and ability names, for example the colour-named mage jobs and Dragoon used as a class name
- World of Warcraft-specific class names, for example Death Knight and Demon Hunter
- Any named character, place, faction or deity from the three franchises
- D&D trade dress and product names (non-SRD monsters, settings, named deities)

The check also rejects names that duplicate existing heroes, enemies or upgrades. You'd own the final list.

### Open questions (Part 3)
13. **What does the assignment require?**
    - a) The working pipeline plus a write-up with the run logs and trial metrics (recommended guess)
    - b) A live demo
    - c) Something else: please share the brief or the grading criteria, since they change what P5 and P7 must record
14. **What starts a run?**
    - a) A command with an optional role or class (recommended)
    - b) Automatically when the roster has a gap
    - c) On a schedule
15. **Can the pipeline create new classes, or only new heroes for existing classes?**
    - a) Heroes for existing classes first, new classes as a separate mode with a stricter balance gate (recommended)
    - b) Both from the start
16. **How is the art made?**
    - a) An external image-generation service. You pick it, create the account and key, and it's logged in the asset register. Most "real" designs, but costs money and keeping one style is harder.
    - b) Procedural sprites (code-drawn from the design sheet's palette and silhouette). Fully automated, free, no licence questions, simpler look.
    - c) The design sheet and prompt only; art made by hand later. Breaks end to end.
    - **Recommended:** b now, so the pipeline is fully end to end, with a slot to switch to a) once you pick a service. Claude cannot make raster images itself.
17. **What counts as balanced?**
    - a) Party win rate with the new hero within ±5 points of the reference party over the same fixed seeds, and no single stat (damage, healing, threat) above 1.5× the best existing hero in its role (recommended draft)
    - b) Looser: only rule out "never wins" and "always wins"
18. **What should the review packet be?**
    - a) The PR description, plus an HTML review page with the hero card and charts (recommended)
    - b) A markdown file in `reports/heroes/`
    - c) The PR alone

### Suggested build order
1. You answer the questions; I fold the answers into this document for you to copy into `docs/`.
2. E1 and E2 (data-driven classes, hero record and save), each with tests and a code-review report.
3. E5 stamina and E3 Heroes tab.
4. P1 to P5: schema, checks, simulation harness, packet, logs. Each is testable without any agent.
5. E4 hero sprites, plus the chosen art route.
6. P6 the agents.
7. P7 the trial run and metrics.

This order keeps the agent last, as you asked, and lets every gate it depends on be built and tested first.
