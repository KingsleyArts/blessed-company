# Design Decisions

Answers from the designer to the issue list (`ISSUES.md`). **Confirmed** = the designer said it. **Proposed** = a draft the designer has not fully approved; nothing marked Proposed is settled. Numbers are unsimulated placeholders to tune with a debug grant.

## 1. Confirmed

### Party and classes
| Topic | Decision | Resolves |
|---|---|---|
| Roster | 6 classes, party of 4 (bench 2). Classes swap freely for party building. | GDD-01, GDD-23 |
| Classes | Warrior (tank), Priest (healer), Assassin (low HP, high-damage melee), Barbarian (high HP, average-damage melee), Summoner (support / ranged damage), Mage (high-damage ranged). | GDD-01 |
| Unit actions | Each class has regular auto actions plus one cooldown ability that fits the class. | GDD-13 |
| Target priority | Default target is the closest enemy. Each paid (Essence, at the Temple) unlock adds one more target type to a sortable priority list. Target types include weakest, strongest and healer-first. | GDD-13, GDD-15 |
| Ability triggers | **Cut for the jam (director, Nov 14); on the post-jam list.** The planned modes were On cooldown / Save for boss or elite / Fire when enemy pack is large / Fire when an ally is low. Abilities always fire on their default rule. | GDD-13 |
| Threat | Enemies keep a threat table: Damage dealt × Threat stat. The tank starts with 1.5× threat and Taunt adds a flat spike. All classes deal damage, but tank and healer deal less, so the tank must invest in damage and Threat to hold aggro. | GDD-32 |
| Tank AI | The tank auto-attacks the enemy it has the lowest threat on, so it spreads threat across all enemies. Taunt hits every enemy. | GDD-32 |

### Combat and run state
| Topic | Decision | Resolves |
|---|---|---|
| Fight end | Enrage timer: enemy damage ramps up after a set time. | GDD-03 |
| Attrition | HP carries over between rooms. Dead units revive at 1 HP after a fight, only if the Priest is alive. If the Priest is dead there is no revive. | GDD-11 |
| Rest room | Heals 30% HP and revives any dead units at 1 HP. It is the recovery for a lost Priest. | GDD-11, GDD-12 |
| Run controls | An Abandon Run button (keeps the permanent currency, Essence; no Gold carry-over) and a reset-progress button with a confirm dialog. | GDD-09, GDD-27 |
| Pacing | Fights about 20s at 1x, with a 1x/2x/4x speed toggle in must-have. | GDD-07 |

### Floors and enemies
| Topic | Decision | Resolves |
|---|---|---|
| Floors | Procedurally generated, no fixed floor limit. A boss every 10 floors; the jam build ships 1 boss (floor 10, set as a data value so it can drop to floor 5 if a time limit turns out to exist). Score is best floor reached. | GDD-01, GDD-08 |
| Floor layout | Node map per floor with fog: rooms are revealed as you move, and a teleport crystal is hidden in a random room. No walking on the floor map itself. | GDD-23 |
| Combat movement | Combat has movement (the base GDD's "no movement" was an error). Warrior goes front and grabs enemies, including new arrivals; melee close on their target without trying to build threat; Mage and Summoner keep distance but accept some risk; the Priest stays farthest back. The Barbarian has a hidden threat multiplier set to 1.2× (confirmed) as a tunable `ThreatMultiplier` data value, below the tank and slightly above the rest. Movement speeds and distance bands in `COMBAT-HOOKS.md` section 8b are accepted as starting values to tune in play. Adds work to GDD-02. | GDD-18, GDD-32 |
| Staggered spawns | Some Combat rooms and every Elite room spawn one extra wave of enemies after the fight starts. | GDD-18 |
| Combat implementation | Core combat logic in C++ with Blueprints and DataTables for data and glue; fixed 1/30 s simulation tick; summon aggro, healing threat (25%) and "Ally is low" (below 40% HP) defaults accepted. Details in `COMBAT-HOOKS.md`. | GDD-18 |
| Kill quota | Quota is about 40% of the floor's enemies. Teleport up requires the crystal found AND the quota met. Players choose to explore fully (treasure, Essence, elites) or rush upward. | GDD-12 |
| Room types | Combat, Elite, Treasure, Rest. Event rooms are Stretch. Weights renormalized to 100%. | GDD-23 |
| Scaling | Enemy stats +25% per floor (raised from 8% on Nov 14 so a fresh party hits a wall; the director chose 1.25 over 1.40), with a boss spike every 10 floors. | GDD-12 |
| Enemy types | Grunt (melee DPS), Brute (tank, taunts), Archer (ranged DPS), Shaman (healer). Warden and Swarmling are Stretch. | GDD-23, GDD-15 |
| Seeds | Separate map stream per floor (seed + floor number). Seed entry on the title screen is cut for the jam (director, Nov 14); the seed is still shown on the results card. Promise is "same seed, same map"; combat and loot still vary. | GDD-16 |

### Economy and progression
| Topic | Decision | Resolves |
|---|---|---|
| Gold (coins) | **In-run currency (swapped Nov 14; display names only, see the note below the table).** Earned per kill and per cleared room, spent on stat ranks from the sidebar at any time during the run. Lost when the run ends. | GDD-13 |
| Essence | **Permanent currency (swapped Nov 14).** Paid per room by room type and kept even if the run is abandoned or the party wipes. Spent only at the Temple. | GDD-24, GDD-09, GDD-22 |
| Temple | A menu opened from the run-over card (Spend Essence) and before each run, not an explorable place. Sells gear levels, stat-tier unlocks and the Party Luck bonuses. A failed run always pays Essence, so every run buys something. | new, Nov 14 |
| Stat unlocks | Stats unlocked with Essence at the Temple appear in the run sidebar, where they are bought with Gold. Tier 0 is free from the start. | GDD-14 |
| Stat scope | Stat tiers 0 and 1 are must-have for the jam; tiers 2 and 3 (class-specific and economy stats) stay Stretch (director, Nov 14). | GDD-02, GDD-18 |
| Gear | Two slots per class (weapon + armor) that hold stat upgrades only: no inventory, no item names beyond a flavor line. Per class and per slot there is a permanent Temple level (cap 5, bought with Essence, kept even when the class is benched) plus temporary dungeon levels that last for the run. A level adds a percent of the class's base stat: weapon +10% Damage, armor +10% Health (DRAFT numbers, same math as one sidebar rank = +1%). The gear shop is no longer cut. | new, Nov 14 |
| Treasure drops | Every Treasure room, Elite clear and Boss clear gives one gear level to a random living party member's weapon or armor, applied at once and shown as a short line such as "Iron Sword: Damage up". Treasure also pays its Essence. | new, Nov 14 |
| Party Luck | The four Party Luck stats (the per Kill and per Room bonuses to both currencies) are Temple purchases only, capped at +100%. They are not sold in the run sidebar. | new, Nov 14 |
| Relics | Still cut for the jam. Treasure gear drops take their role as the in-run reward. | GDD-10, GDD-13, GDD-29 |

**Currency swap note (Nov 14):** the player sees Gold (in run) and Essence (permanent). The code, the save file and `StatDef.csv` keep the old internal names: `gold` is the permanent amount and "essence" is the in-run balance. Only the UI strings change for the jam; a full rename is post-jam cleanup.
| Starting numbers | Use the placeholders in section 3 and tune in play with a debug grant. | GDD-04 |

### Scope, art and story
| Topic | Decision | Resolves |
|---|---|---|
| Art | 2 facing directions (draw one side, mirror the other). Real-time lighting, fog and Niagara VFX are Stretch. | GDD-17 |
| The Architect | Skipped entirely for the game jam. In the full game the Architect is planned to appear at the top of the tower, floor 100. | GDD-06, GDD-20, GDD-26 |
| Story text | Title card and death screen only. No tower lines. The death screen shows cause of death first. | GDD-21, GDD-05 |
| Onboarding | Short first-run tooltips: party select, sidebar, priority settings, crystal and quota. A Shaman hint prompts the healer-first target mode. | GDD-15 |
| Pitch | "Build-your-party tower climber: swap six classes, tune priorities, explore or rush each floor." The deep-dungeon reference stays as flavor. | GDD-19 |
| Judging time | The itch.io jam page lists no play-time limit; the "15 minutes" came from the GDD, not the jam. The Official Rules were read and also list no play-time limit (section 5). | GDD-30 |
| Cut order | Updated Nov 14: 1 relics, 2 node-map fog, 3 staggered spawns on regular Combat rooms, 4 shrink the tier-1 stat list. Already cut: seed entry box and trigger-mode unlocks. The gear shop is no longer cut: it is the Temple's gear levels. Full schedule, gates and hour budget in `SCHEDULE.md`. | GDD-02 |

## 2. Stat plan (confirmed scope, proposed assignments)

### Cuts and deferrals
- **Cut:** wall health and rebuild, and interest per room (removed at the designer's request).
- **Deferred to Stretch:** super crit chance/factor, and the rest of the Party Luck path (free attack/defense/luck upgrade chances, enemy attack and health level skip).
- **Added:** Threat and Cooldown Reduction; Heal Power and Healing Echo (Priest); Spirit Damage and Spirit Duration (Summoner).
- **Reclassified:** all utility upgrades are party-wide **Party Luck** stats, bought once and applied to the whole party, not per character. Essence and gold upgrades are included in the plan; the rest of the Party Luck path is deferred.
- **Trimmed:** bounce shot range (fixed value), "wave" renamed "room".
- **Renamed:** Defense Absolute (flat damage blocked after Defense % reduction) is now **Fortitude** (confirmed by the designer).
- **Healing Echo:** a percentage of a heal's amount is applied again to the same target as healing over time after the heal lands. When the party is high on health the Priest deals damage (smite) instead of healing, which keeps echo from stacking indefinitely. Confirmed shape: the echo starts at 10% of the heal, and the Healing Echo upgrade caps it at 30%. It is applied over 4 seconds. A new echo from the same Priest on the same target refreshes the old one instead of stacking, with total echo per target capped at 60% of that target's max HP. The Priest switches from healing to smiting when every ally is at 85% HP or higher.
- **Party Luck caps:** each Essence/Gold stat (per Kill, per Room) caps at +100% (double payout) after about 10 ranks.
- **Tier placement confirmed:** Heal Power, Spirit Damage, Spirit Duration and the four Party Luck stats are tier 1 (must-have). Healing Echo is tier 2 (Stretch).

### Stat tiers (unlocked with Essence at the Temple, then buyable with Gold in the run; names swapped Nov 14)
| Tier | Stats | Status |
|---|---|---|
| 0: Start | Damage, Attack Speed, Health, Threat (Warrior only) | Must-have |
| 1: Early gold | Defense %, Crit Chance, Crit Factor, Health Regen, Cooldown Reduction, Range (Mage, Summoner, Priest only), Heal Power (Priest), Spirit Damage and Spirit Duration (Summoner). **Party Luck** (the four per Kill and per Room bonuses) moved to Temple-only purchases on Nov 14 and is not in the run sidebar | Must-have |
| 2: Mid gold | Fortitude (flat damage blocked), Lifesteal, Multi Shot Chance/Targets, Rapid Fire Chance/Duration, Rend Armor Chance/Factor, Thorns, Damage/Meter, Healing Echo (Priest) | Stretch |
| 3: Late gold | Bounce Shot Chance/Targets, Death Defy | Stretch |
| Deferred | Free Attack / Defense / Luck Upgrade Chance, Enemy Attack Skip, Enemy Health Skip | Stretch (rest of Party Luck path) |

### Class sort (Proposed)
| Stat | Warrior | Priest | Assassin | Barbarian | Summoner | Mage |
|---|---|---|---|---|---|---|
| Damage, Attack Speed, Health, Defense %, Health Regen, Cooldown Reduction | all | all | all | all | all | all |
| Crit Chance / Factor | ✓ | | ✓ | ✓ | ✓ | ✓ |
| Threat | ✓ | | | | | |
| Rend Armor Chance / Factor | ✓ | | | | | |
| Thorns | ✓ | | | | | |
| Fortitude (flat damage blocked) | ✓ | | | ✓ | | |
| Death Defy | ✓ | | | ✓ | | |
| Lifesteal | | | ✓ | ✓ | | |
| Rapid Fire Chance / Duration | | | ✓ | | | |
| Range | | ✓ | | | ✓ | ✓ |
| Damage/Meter | | | | | ✓ | ✓ |
| Multi Shot Chance / Targets | | | | | ✓ | ✓ |
| Bounce Shot Chance / Targets | | | | | | ✓ |
| Heal Power, Healing Echo | | ✓ | | | | |
| Spirit Damage, Spirit Duration | | | | | ✓ | |
| Party Luck: Essence per Kill, Essence per Room, Gold per Kill, Gold per Room | party-wide (bought once, applied once) | | | | | |

### Class abilities (Proposed)
| Class | Auto action | Cooldown ability |
|---|---|---|
| Warrior | Melee strike, low damage | **Taunt**: threat spike on every enemy + short damage reduction |
| Priest | Heals the lowest-HP ally; when the party is high on health it deals damage (weak ranged smite) instead, which also stops Healing Echo from stacking indefinitely | **Group Heal** (its survival enables post-fight revive) |
| Assassin | Fast melee strikes | **Execute**: big hit on the weakest enemy |
| Barbarian | Melee swings | **Rage**: attack speed + lifesteal for a few seconds |
| Summoner | Ranged bolt | **Summon Spirit**: a temporary pet that attacks and draws a little threat |
| Mage | Ranged bolt | **Fireball**: area damage |

## 3. Starting numbers (placeholders, unsimulated)

Goal: a ~20s fight on floor 1 where the party loses roughly a third of its HP. The Priest's heal is 8 per cast.

| Class | HP | Damage | Attack/sec | Defense % | Ability cooldown |
|---|---|---|---|---|---|
| Warrior | 200 | 6 | 1.0 | 20 | 12s (Taunt) |
| Priest | 100 | 3 | 0.8 | 0 | 10s (Group Heal) |
| Assassin | 80 | 14 | 1.4 | 0 | 8s (Execute) |
| Barbarian | 160 | 9 | 1.0 | 10 | 14s (Rage) |
| Summoner | 90 | 8 | 0.9 | 0 | 15s (Summon Spirit) |
| Mage | 80 | 16 | 0.7 | 0 | 9s (Fireball) |

- **Enemies, floor 1:** packs of about 3 with ~900 total HP; enemy stats multiply by 1.25 per floor.
- **Enrage:** after 45s, enemy damage rises 10% every 5s.
- **Essence (permanent, paid per room, since Nov 14 the name of the old "gold"):** Combat room 10, Elite 25, Boss 50, Treasure room 15 (PLACEHOLDER).
- **Gold (in run, the old "Essence"):** 5 per kill, 10 per cleared room. Sidebar upgrade costs start at 20 and rise 15% per purchase per stat.
- **Temple prices (DRAFT):** Tier 1 stat unlock about 100 Essence each. Gear Temple levels per class and slot, cap 5: 50, 90, 160, 290, 520 Essence (x1.8 per level, 1,110 to max one slot).
- **Gear bonus (DRAFT):** per level, weapon +10% of the class's base Damage and armor +10% of its base Health (one sidebar rank is +1%). Dungeon drops are worth one level each and last for the run.
- **Reference:** a fully cleared floor 1 pays about 70 Essence, so a run that dies on floor 3 or 4 earns roughly 200 to 300.

## 4. Judging criteria (from the jam page)
Judges score 1-5 on: Ambition and innovation; Theme; Fun factor; Gameplay; Visuals; Level design and game progression; Audio. Submissions need a 30-60 second gameplay video (the page advises showing gameplay in the first five seconds), a packaged Unreal build, and a list of tools and assets used. The jam runs November 12-15, 2026, with the deadline on November 15 at 5:59 PM PST. The page says to declare anything made before November 12, so this design work (GDD, reviews, this file) should be listed.

## 5. Official Rules findings (read November 11, 2026; Official Rules last updated November 5, 2026)
Section numbers refer to the Official Rules PDF.

- **No play-time limit.** None of the 16 pages mentions how long judges play. The GDD's "15 minutes" is not a rule, so the boss stays at floor 10 as decided. (§9 lists the judging process.)
- **Video:** 30–60 seconds of gameplay at **1920×1080 or higher resolution** (§1, §7c).
- **Not a starter template.** The submission must not be an obvious extension of an Epic tutorial or starter template, and must include custom gameplay that exceeds the starter templates (§7d, §7e).
- **No extra software to run.** The packaged build must run without additional software (§7f).
- **The Contest Theme must be demonstrated** (§7g), and **Use of Contest Theme is a judged criterion worth up to 5 points** (§9). The jam page labels it "Theme". The GDD's theme reading is still not argued (see open items).
- **Pre-jam work (§7h).** AI tools, agent configurations, MCP settings, prompt libraries and scripts may be prepared before the Contest Period. **All other game content (gameplay, levels, art assets other than noted sourced assets) must be created during the Contest Period.** The Sponsor may ask for these materials and the version control history to verify.
- **Sourced assets (§15c).** Non-original assets must be noted on submission, are not reviewed or scored, and need the entrant's own licenses and clearances. **AI tools are not considered a sourced asset.**
- **Trademarks and logos (§15d).** The submission may not feature trademarks or logos except the Unreal Engine logo. Third-party names such as the FFXIV reference in the base GDD must stay out of the game and the submission.
- **Content (§8):** must be appropriate for a teen audience (ESRB Teen or equivalent); all submission content and the video must be in English.
- **Submitted by a person (§17).** The submission must be made by an entrant, not an AI agent.
- **One submission per entrant**; teams of 1 to 5 (§1, §2). Contest Period: November 12, 12:00 AM ET to November 15, 8:59 PM ET (§4).
- **Judging (§9):** seven criteria, up to 5 points each: Ambition and Innovation, Use of Contest Theme, Fun Factor, Gameplay, Visuals, Level Design, Audio. A tie is re-scored with double weight on Fun Factor. The extent of AI use disclosed is considered for context only and does not raise or lower the score.
- **Eligibility (§5):** 18 or older, with an Epic Games account, resident in an eligible jurisdiction. Not checked against the designer's residence.
- **Rights (§2, §15):** entrants grant the Sponsor a perpetual license to the submission.

## 6. Still open
- GDD-02 schedule: approved in `SCHEDULE.md`. Hour estimates are unmeasured; re-check after Thursday.
- GDD-18 combat hook interface: how classes, threat, target priorities and trigger modes plug into the Combat Manager.
- Official Rules: read (section 5). Open from it: how the game demonstrates the contest theme (judged, up to 5 points), and verifying eligibility.
- Possible schedule changes from the rules (proposed, not applied): video recorded at 1920×1080 or higher; Wednesday setup limited to tools, MCP and an empty-project packaging test, with no game content and no sprites made before Nov 12; keep version control history from Nov 12; list sourced assets; keep third-party trademarks out of the game and video.
- All numbers in section 3 are unvalidated.
- The theme reading ("Director's Cut") and its argument for judges.

## 7. Decisions settled Nov 12 (from the overnight build reports)
- **Data format:** CSV in `data/` is the source of truth. Unreal imports it as DataTables; no JSON copy. `CLAUDE.md` updated.
- **Threat:** the Warrior's 1.5 is its upgradeable **Threat stat** (base 1.5); every other class starts the stat at 1.0 (`BaseThreat` column in `ClassData.csv`). `ThreatMultiplier` is a separate hidden factor on the class row (Barbarian 1.2, all others 1.0): no upgrades, not shown, tunable in the debug panel. Threat added per hit = damage × Threat stat × ThreatMultiplier.
- **Boss floor (floor 10):** no kill quota. The floor is the boss arena (start room, boss pack) plus an Exit room behind it holding the teleport crystal. The crystal activates only once the boss is dead (`Floor::crystalRequiresBossKill`). Normal floors are unchanged.
- **Scaling:** compounding, 1.25^(floor-1) (raised from 1.08 Nov 14; "multiply by 1.25 per floor" in section 3).
- **Row 1:** the start room is always Combat, which satisfies "Row 1 is always combat" in the GDD.
- **One class-data definition:** `ClassDataRow` (from `ClassData.csv`) replaces the stat-resolver agent's own `ClassData` struct and `class_data.csv`.
- **Starting party and the Priest (Nov 12, director):** the first run starts with Warrior and Mage only. The Priest is locked at the start; on floor 2 the party rescues the Priest, who then joins and is unlocked for party select. This replaces the "party of 4 from the start" reading of the roster row. Open for the run-programmer and director: how the rescue is shown (room or event), whether the unlock persists between runs, and how the floor 2 fights are balanced without a healer or post-fight revive until then.
- **Grunt placeholders (Nov 12, director):** Grunt HP lowered from 250 to 150 so Warrior and Mage can beat 3 Grunts (G2); damage stays 8 (sweep: 100 of 100 wins, about 20.7 s per fight). Still placeholders for Sunday's balance pass.
- **Enrage has no time cap (Nov 12, director):** enrage keeps stepping until one side dies. An internal runaway guard (1800 s) exists only as a safety net and ends a stuck fight as TIMEOUT.
- **Warrior target fallback (Nov 12, director):** the Warrior keeps the lowest-threat target as its preference, but when that target is out of range and another enemy is in reach it hits the closest enemy in reach, so it never stands idle. Threat follows the normal formula.
- **Priest rescue (Nov 12, director):** it is a room: the first Elite room the player meets, on floor 2, and it counts as an event-style room (the Priest joining, and the fight must be cleared to continue). The Priest joins at the start of that fight and fights in it, so the Elite pack can be tougher than a normal floor 2 Elite because the party now has healing. After joining she stays with the player: in the party for the rest of the run, and unlocked as a class for later runs. Open for the run-programmer: guarantee that floor 2 has at least one Elite room (the Floor Generator currently only caps Elites at one per row, it does not guarantee one); the room must show as the rescue room on the map.
- **Enemy taunt (Nov 12, director):** a taunting enemy (the Brute) forces the whole party, the Warrior included, to attack it for a few seconds. The Warrior does not ignore it, so enemies that appear during a taunt are a real threat to a party that neglected defensive stats on its non-tank units. The duration and cooldown are draft values in `data/` until tuned.
- **Execute (Nov 12, director):** stays a 3x hit on the weakest enemy in melee range, no HP threshold, as built. The GDD wording "low-HP enemies" is superseded.
- **Summoner spirits (Nov 12, director):** at most 2 live spirits: 1 standard and 1 greater. The Spirit Duration stat applies to the greater spirit only; Spirit Damage applies to both. Spirits do not persist after the Summoner dies (read as: they vanish when the Summoner dies). Greater spirit numbers are drafts.
- **Shaman tuning (Nov 12, director):** retune toward the ~20 s fight target; the Shaman heal moves into `data/` and scales with the floor like other enemy stats.
- **Warrior area attack (Nov 12, director, after the first playtest):** the Warrior gets a second ability, an area-damage attack on a cooldown, so it can build threat on a whole pack. Playtest showed enemies rush the Mage once it starts attacking, until the Warrior slowly gains threat. Name, cooldown, radius and damage are draft values in `data/` (Warrior stays the only class with the Taunt ability as well).
- **Combat readability (Nov 12, director):** health bars above every unit (red for enemies, green for the party) and floating combat text for damage and healing values.
- **Second class abilities are Stretch (Nov 12, director):** each class is meant to have two abilities, but the new ones are stretch goals, built only after the must-have list runs end to end. Proposals: Priest Ward (party Defense % buff), Assassin Vanish (drop own threat), Barbarian Battle Cry (party Damage buff), Mage Frost Nova (area damage plus attack-speed slow), Summoner second ability to be proposed. Warrior's second ability slot is Cleave, which is disabled for now (see below). The Summoner's one ability for now is Summon Greater Spirit.
- **Summoner weapon spirit (Nov 12, director):** the Summoner always has the normal (standard) spirit; it acts as the Summoner's weapon and performs the Summoner's bolt attack, so the Summoner itself no longer attacks. Summon Greater Spirit is the Summoner's only ability. Spirits do not persist after the Summoner dies. Spirit Duration applies to the greater spirit only; Spirit Damage applies to both. This replaces the earlier "standard spirit is cast on a 15 s cooldown" reading.
- **Warrior Taunt rework, Cleave disabled (Nov 12, director, to try):** Cleave is switched off (data kept) and the Warrior's Taunt is rebalanced to force every enemy to attack the Warrior for a few seconds, like the Brute taunt does to the party, giving the Warrior time to build threat on each enemy through its normal attacks. Values are drafts; the result is judged on how long the Mage stays untouched in the opening seconds.
- **Summoner on hold (Nov 12, director):** no further Summoner work for now (weapon spirit, Greater Spirit timing, damage). The class stays in the data and code as built; it is not part of the active test party. Revisit only if time allows.
- **Playtest note, Nov 12 (director):** Warrior holds threat most of the fight; the Mage pulls it when an enemy is nearly dead, because the Mage out-damages the Warrior and slowly overpowers the threat bonus. The director accepts this. Problem found: against 3 Grunts the Warrior ends the fight near death. To be retuned (placeholders), target: the party loses about a third of its HP on floor 1.
- **Warrior survivability retune (Nov 12, placeholders):** Warrior base HP 200 to 300 and base Defense % 20 to 40, so the Warrior ends a floor 1 fight against 3 Grunts at about 54% HP instead of near death (party loses about 37% of its HP, fight about 24 s, 100 of 100 wins). Section 3's Warrior row (HP 200, Defense 20) is superseded by these values. Grunt stats unchanged (150 HP, damage 8).

## 8. Floor layout and UI direction (Nov 12, director, from the UI mockup `docs/ui/mockup-v1.webp`)
- **Floor layout changes to a grid of rectangular rooms:** each floor is a grid of rectangular rooms joined by doors to the north, east, south and west, always fully connected, with free backtracking through rooms already visited. This replaces the forward-only row graph in the Floor Generator (rows, 2 to 4 rooms, forward edges). Kept from the old rules: room types and weights by depth, at most one Elite per row-equivalent region is no longer a rule (to be re-expressed for a grid by the run-programmer and approved), enemy packs and reinforcement waves per room, the hidden teleport crystal, the kill quota (about 40 percent of the floor's enemies), floor 10 as the boss floor (boss arena plus Exit room, crystal active after the boss), seeded and deterministic, and the guaranteed Elite rescue room on floor 2.
- **Combat rooms are rectangular** and wider than tall so they fit both PC and mobile layouts. The fixed camera is angled (as in the mockup) rather than straight overhead.
- **Mini-map** (top right) in the style of a deep-dungeon map: rooms as rectangles, corridors between them, the current room marked, fog (only visited rooms and their neighbors are shown), treasure, rest and crystal icons once seen. Our own art only; no third-party names, logos or assets.
- **Moving between rooms:** four arrow buttons go to the adjacent room in that direction; clicking any known room on the mini-map walks there through visited rooms (several steps, no repeated presses).
- **Auto button:** after all actions in the current room are finished, it picks an open adjacent room, runs auto battle, and once the kill quota is reached goes straight to the teleport crystal (exploring until the crystal is found if it is not known yet).
- **Essence menu** (right): shows the active character's stats with the next-rank Essence cost and a buy button per stat, plus a buy-amount selector (x1, x10, x100, Max). **Character portraits** (bottom left) with HP bars choose which character the Essence menu shows. **Top bar:** floor name, Gold, Essence. **Speed and pause controls** top left (pause, 1x/2x/4x, Auto).
- **Mockup elements the director did not specify are not design (Nov 12, director):** only the elements the director described (mini-map, arrows, click-to-travel, Auto, Essence menu, portraits with HP and cooldown bars, speed and pause) are requirements. Everything else in the mockup image was generated from general mobile-game conventions and is ignored: character levels and XP bars, the Skills and Equipment tabs (gear is also cut item 1), gems, mail, notification badges, income per minute, and the stat-list layout details beyond what is described above.
- **Mockup art is a mockup:** its characters and frames are not used in the build unless sourced and recorded in `reports/assets/register.md`; the mockup file itself is pre-jam material to declare if it was made before Nov 12.
- **Portrait cooldown bar (Nov 12, director):** the purple bar above each character portrait shows that character's ability cooldown (fills as the ability recharges, full when ready). With one ability per class today it is one bar; when stretch second abilities exist it shows the primary ability or splits into two thin bars (to decide then). The UI reads the remaining cooldown and cooldown length from the combat sim; the combat-programmer owns adding that read accessor.
- **Teleport rule (Nov 12, director):** teleporting up requires standing in the crystal room, with the crystal found and the kill quota met. Auto walks to the crystal room once the quota is met (exploring until the crystal is found if it is not known yet), then teleports.
- **Manual movement overrides Auto (Nov 12, director):** pressing an arrow or clicking a room on the map while Auto is on switches Auto off and performs the move.
- **Elite rules (Nov 12, director):** there are no Elite rooms on floors 1 and 2, except the scripted rescue Elite on floor 2. The Floor Generator takes a flag for whether the player already has the Priest. If the player does not have her, floor 2 contains exactly one scripted Elite, the rescue room, which must be cleared before leaving the floor. If the player already has her (unlocked in an earlier run, or rescued earlier), floor 2 is generated normally, with no forced Elite and no Elites at all. Random Elites start on floor 3, and an Elite is never the only way forward: the party can always reach the crystal and the rest of the floor without passing through an Elite room (the scripted rescue Elite is the one required fight). This replaces "Elite guaranteed on floor 2" and the Elites-per-floor limit from the grid rules.
- **Balance pass 2 (Nov 13, placeholders, overnight):** Grunt HP 150 to 110 (damage stays 8), Brute HP 450 to 320, Archer damage 5 to 3. With these, the spending bot with Warrior+Mage reaches floor 2 in about 52 percent of runs (was about 27 percent) and the Priest rescue is won 11 of 11 times. A balance agent also tried gutting the Priest (attack speed 0.8 to 0.12, Group Heal 2 to 0.5) and raising Mage HP 80 to 120 to make the Priest party harder; those were **reverted** because they change documented values and the Priest's role. Open for the director: with the Priest, the spending bot wins about 100 percent of runs with no permanent upgrades (the Essence rank bonus of +10 percent per rank and enemy scaling of 1.08 per floor are the levers; floor scaling and Essence ranks are doc/code values), so the target "a new player usually dies between floors 2 and 5" is not met after the rescue.

## 5. Retry loop and the difficulty wall (Nov 14, director-approved scope; numbers are targets to tune)
- A run ends in a wipe, an abandon or a victory. The run-over card shows cause of death, floor reached, best floor, Gold earned (lost with the run), Essence earned (kept) and two buttons: **Temple** and **New run**.
- **Wall target:** a fresh Warrior and Mage party reaches about floor 3 or 4 on run 1; two to three Temple visits should let the next run clear that wall. The balance pass measures this with the bot and the debug grant. If the bot clears floor 10 on a fresh save, enemy scaling or Temple bonuses are adjusted, not the bot (see the Nov 13 note in section 3: with the Priest the spending bot wins about 100 percent of runs without permanent upgrades, so the wall is not there yet).
- **Pacing (from the GDD):** a first failed run earns enough Essence for two or three cheap Temple purchases; rank 1 of any Temple item costs less than one average run's Essence.
- **Rescued Priest:** joins at 30 percent of max HP (director, Nov 14); an ordinary Priest in an unlocked party starts at full HP. Config value `rescueHpFraction`.

## 6. Other changes recorded Nov 14 (built on the `g4-room-walk` branch, merged to main)
- **Connected rooms:** the floor is one connected world. Moving through a door plays a walk: the party walks to the doorway, the old room darkens and the new one brightens as the camera pans, and the party walks in. The fight starts when the walk ends. Neighbouring rooms are drawn dimmed behind their doors.
- **Rally point and placement:** the party rallies just inside the door it entered through (a row across the doorway). Enemies and reinforcements are placed at random spots at least 900 from the rally point, 170 apart and 150 from a wall (seeded, reproducible). The enemies of the next fight stand in the room while the party walks in.
- **Look:** party members are spheres, enemies and summons are cubes. A health bar shows only on a damaged unit.

## 7. Post-jam list (director, Nov 14)
Trigger-mode unlocks (On cooldown / Save for boss or elite / Fire when pack is large / Fire when an ally is low); stat tiers 2 and 3; relics; Event rooms; seed entry on the title screen; a real inventory with randomized gear; a full rename of the internal currency names; a title or hub screen with the Temple as an explorable place.

### Potion slot (draft, post-jam, proposed Nov 14; not built, not approved for the jam)
- **Idea:** each party gets one potion slot, like a Diablo flask, that fires on a cooldown. The slot can hold different potion types, so it stays useful after a healer joins.
- **Why it is in the full game:** before the Priest joins, it is an emergency heal. After that, the slot is swapped for a damage boost, damage reduction or another effect, so it is a permanent-upgrade axis the Temple can sell.
- **Draft potion types:** Healing (heals the lowest-HP living ally), Might (party damage up for a few seconds), Ward (damage taken down for a few seconds). Cooldown and strength are Temple ranks.
- **Open design questions (director):**
  - Automatic or manual? An automatic potion is a free mini-healer, so it overlaps the Priest. A manual one adds player input to a game where everything else is automatic.
  - It should follow the trigger modes on this list (On cooldown, Save for boss or elite, Fire when an ally is low).
  - Does it replace the rescue floor, or do both exist? The rescue stays in the jam build.
- **Balance note:** a free heal before the Priest makes floor 1 easier. The floor 1 rule "no upgrades usually fails" (section 5) has to be re-checked with the bot, and the enemy multiplier (`tol.EnemyMult`, currently 1.3) re-tuned.
- **Cost estimate:** a new system, so it needs a cooldown and target rule in `Core/`, a slot-swap UI, an icon, tests and a code review. Not part of the Sunday freeze.

## 9. Goddess RPG economy and systems (Nov 17-18, director-approved, built on `g5-blessed-economy`, merged to main)
- **Title:** Blessed Company. **Economy:** Faith (permanent, paid at run end, spent in the Temple on blessings and ranks), Essence (in-run, resets every run, spent in the sidebar), Gold (small wallet for equipment; its payouts and shop are not built yet). Code keeps the old names (`essence` in-run, `MetaSave::gold` permanent) until the rename; the save keeps a v2 key set (`faith`, `partyGold`; v1 loads).
- **Heroes:** Warrior, Mage, Priestess (floor-2 rescue, unlock persists) and Assassin; three active slots.
- **Miracle Gauge:** fills 1 per party hit and 2 per party heal (placeholders; set live in the pause tuning menu, 0.2 per hit by default after the slower-gauge pass). Divine Healing (heal the targeted hero), Divine Shield (5 s no damage on the targeted hero) and Divine Smite (ground-targeted area, radius 300, settable). Manual targeting: press the button or key 1, 2 or 3, then click a portrait or the ground.
- **Cast times and windups:** shipped table in `Core/CastTimes.h`; `tol.CastTimes 0` turns them off. Cast bars on the HUD.
- **Enemy multiplier 1.3** (`tol.EnemyMult`) and the Priest heal 2 to 1.2 are the current balance levers (the pause tuning menu changes them live; testing only).
- **Warrior targeting:** melee foes first (`tankMeleeFirstRange`), but he goes for ranged foes that are shooting allies once melee foes are on him.
- **Pause** freezes the room walk and the Auto bot. A debug "Reset ALL progress" button needs two clicks.

## 10. Roster and presentation (Nov 18, built on `g6-roster-and-polish`, not merged)
- **Party picker:** the Temple shows four heroes and three slots; the choice is saved (`activeParty`). Owned: Warrior, Mage, Assassin (draft: owned from the start) and the Priestess once rescued. Rules in `Core/Roster.h`: 1 to 3 active heroes, the last hero cannot be removed, an empty saved party means Warrior and Mage (plus the Priestess when unlocked). A rescued Priestess who is benched is not re-rescued on floor 2.
- **Open (director):** how the Assassin is obtained; what a rescue does when three other heroes are active; Temple gear rows for the Assassin and Priestess.
- **Sprites:** goblins use Paper2D flipbooks with hurt and dead sprites; a corpse keeps the side it faced. Melee swing/windup bars are hidden on sprite units (the animation is the telegraph); cast bars stay.
- **Room theme:** a placeholder goblin cave (dark rock colours and deterministic wall props) via `UI/TolRoomTheme.h`; `tol.RoomTheme 0` restores the brick look. Real cave art is waiting on the asset decision.
- **Phaser build and rename (Nov 18):** the project is being prepared for a Phaser web build and the Blessed Company rename together. The docs were copied to a new `blessed-company` folder (new repo) with the old name relabeled; this Unreal repo keeps the old internal names.

