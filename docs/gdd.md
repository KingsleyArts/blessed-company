> **Status note (Nov 18, 2026):** this GDD describes the jam game. The current direction is Blessed Company (goddess-centered hero management sim); see `DESIGN-DECISIONS.md` sections 9-10 and `GODDESS_RPG_DESIGN_TRANSITION.md`. Where they disagree, those win.

Blessed Company: Jam GDD

Nov 11, 2026 · Kingsley

Overview

Blessed Company is a party-building, auto-combat tower crawler in Unreal Engine 5. The player builds a party, climbs procedurally generated floors, and only decides which room to enter next. Combat and looting play out on their own.

Pitch: FFXIV's deep dungeon mode, rebuilt as an incremental auto-battler. Every run pays out, and the tower gets a little easier each time you go back in.

Jam facts

| Item | Detail |
| Event | 2026 Epic AI MegaJam, Unreal Engine track |
| Theme | Director's Cut: build the ambitious feature a jam would normally cut |
| Window | Nov 12 to Nov 15, 8:59 PM ET |
| Team | Solo (1 human), unlimited AI agents |
| Requirement | Declare every asset and tool used in the build |
| Workflow | AI-first: Claude through Unreal MCP for code and Blueprints, PixelLab for sprites |

Director's Cut features (the two things a normal jam entry would cut):

1. Procedural floors. Each floor is a freshly generated, branching map of rooms.
2. Meta progression. A persistent upgrade menu between runs, holding upgrades that would usually be bought mid-run.

Target play session: a judge should finish 2 to 3 runs in about 15 minutes and feel clearly stronger on the last one.

Core loop

A run is a chain of room picks inside a floor, and every run, won or lost, ends back at the Temple with Essence to spend.

Core loop diagram (text version):

Title -> Temple (spend Essence)
  -> Floor map (procedural rooms)
  -> [pick room] Auto fight + loot (no player input)
       -> [Treasure, Elite or Boss] a gear level drops and applies at once
       -> [room cleared] spend Gold on stat ranks at any time -> [next room] back to Floor map
       -> [party wipe, abandon or full clear] Run results (Essence kept, Gold lost)
  -> [Temple button] spend Essence on gear levels, stat unlocks and Party Luck -> New run

The player's decisions are the party, the next room, and what to spend Gold on in the run; between runs, what to buy at the Temple (updated Nov 14); everything else is automatic. Clearing a floor's boss loads the next floor's map.

Party and units

The party is 4 slots picked from a jam roster of 5 units, each with one clear role and one signature ability. Five units gives real choice without a balancing nightmare.

| Unit role | Job in combat | Signature ability (proposal) | Synergy hook |
| Tank | Holds aggro, high HP and defense | Taunt plus a damage shield | Shields boost healer output |
| Healer | Restores HP, cleanses | Group heal on a cooldown | Overheal becomes a shield |
| Melee DPS | High single-target damage | Execute on low-HP enemies | Bonus damage on taunted targets |
| Ranged DPS | Steady damage from the back row | Piercing shot that hits 2 enemies | Crits refund cooldown |
| Support | Buffs and debuffs | Haste on the party | Haste also speeds healer cooldowns |

Stats per unit: HP, Attack, Defense, Speed (attack interval), Crit chance. Five stats keeps the upgrade menu readable.

Unit levels: units gain XP inside a run only. Levels reset each run; meta upgrades are what carry over.

Synergies: each unit has one synergy line that triggers when its partner role is in the party. Show active synergies on the party select screen so judges notice them.

Open question: are the 5 roster units named characters with lore, or generic classes for the jam?

Auto combat

Combat is fully automatic and real-time with attack timers, so the player watches and judges the build instead of pressing buttons. Readability is the main design goal: a judge must see why a fight was won or lost.

Rules

- Each unit attacks on its own timer, set by Speed.
- Abilities fire automatically when off cooldown and their condition is met (for example, heal when an ally drops below 50% HP).
- Targeting: enemies focus the tank if taunted, otherwise the front row. Melee targets the lowest-HP enemy; ranged targets the highest-threat enemy.
- Formation: each side holds a front and back line, facing the other side across the top-down arena. The back line takes less damage from melee enemies. Units face the nearest of 4 directions toward their target, with a small threshold so facing doesn't flicker.
- A fight ends when one side is wiped. A party wipe ends the run.

Readability tools

- Floating damage, heal and crit numbers, colored by type.
- Ability name callouts above the unit when a signature fires.
- Health bars over every unit, plus a party HP panel in the HUD.
- A 1x / 2x / 4x speed toggle so repeat runs don't drag.
- A post-fight summary: damage dealt and healing done per unit.

Out of scope for the jam: manual ability triggers, positioning control, status effect stacking beyond buffs, debuffs and shields.

Procedural floors

Each floor is a generated node map, not a walkable 3D dungeon: rows of rooms connected by branching paths, ending in a boss room. The player taps the next room on the map; the game loads that room's arena and resolves it.

Jam target: 5 floors per full run, each floor 4 rows deep plus a boss. A full clear is about 20 to 25 rooms.

Generation rules

1. Each row has 2 to 4 rooms.
2. Every room links to 1 or 2 rooms in the next row; no dead ends, and paths may merge.
3. Row 1 is always combat. The last row before the boss always offers a rest room.
4. Room types are rolled from weights that shift with depth (table below).
5. At most one elite per row, and never two treasure rooms in a row on the same path.
6. Enemy packs and room modifiers are rolled per room from the floor's pool.

| Room type | What happens | Weight, floors 1 to 2 | Weight, floors 3 to 5 |
| Combat | Standard enemy pack | 55% | 45% |
| Elite | Tougher pack, better loot | 10% | 20% |
| Treasure | Free loot, no fight | 15% | 10% |
| Rest | Heal party 30% | 10% | 10% |
| Event | A choice with a tradeoff | 10% | 15% |

Room modifiers (one optional per room, shown on the map icon): enemies hasted, double gold, party starts at 80% HP, enemies shielded. Modifiers are the cheapest source of variety because they reuse the same arena and enemies.

Seeds: every run uses a seed shown on the results screen. Same seed, same floors. This is a debugging tool first; a daily seed is a stretch goal. Entering a seed on the title screen is cut for the jam (Nov 14).

Arenas: 3 reusable arena scenes (standard, elite, boss), dressed per floor with lighting and color changes. The variety comes from enemies and modifiers, not new levels.

Enemies and bosses

The jam needs 6 enemy types and 2 bosses, reused across floors with stat scaling and recolors. Each enemy reuses the same AI as a party role, so no new combat logic is needed.

| Enemy | Behaves like | Notes |
| Grunt | Melee DPS | Filler, appears everywhere |
| Brute | Tank | Slow, high HP, taunts |
| Archer | Ranged DPS | Back row |
| Shaman | Healer | Priority target, teaches focus fire |
| Swarmling | Weak melee | Comes in groups of 4 to 6 |
| Warden | Support | Shields allies; elite rooms only |

Scaling: enemy HP and Attack grow per floor (proposal: +20% per floor). Elites are a normal pack plus one buffed unit with a name and a glow.

Bosses

- Mid boss (end of floor 2 or 3): one big unit with 2 phases. Phase 2 at 50% HP adds a summon or an area attack.
- Final boss (end of floor 5): a guardian of The Architect, 3 phases, with an attack that punishes parties with no healer.
- Floors without a unique boss reuse the mid boss with a modifier and a recolor.

Open question: one final boss, or does every fifth floor loop back with harder scaling for players who want to keep climbing?

Loot and in-run upgrades

Looting is automatic. Treasure rooms, Elite clears and Boss clears each drop one gear level (a stronger weapon or armor for one random living party member) that applies at once for the run (updated Nov 14). Relics are cut for the jam.

Two currencies (names swapped Nov 14; the code keeps the old internal names)

| Currency | Earned from | Spent on | Keeps after the run? |
| Gold | Every kill and every cleared room | Stat ranks from the run sidebar, at any time | No |
| Essence | Every cleared room by room type (Combat, Elite, Boss, Treasure) | The Temple | Yes, even after a wipe or an abandon |

Gear: two slots per class (weapon, armor) that hold stat upgrades only. Each has a permanent Temple level (cap 5, bought with Essence) plus temporary dungeon levels from drops. A level adds a percent of the class's base stat: weapon Damage, armor Health. No inventory.

Unit XP: each cleared room gives XP; level-ups add flat stats. No level-up choices in the jam, to keep pacing quick.

Answered: gold has an in-run use. It buys sidebar stat ranks.

Meta progression

Between runs, the player spends Essence at the Temple, a menu opened from the run-over card and before each run (updated Nov 14). Every run, won or lost, pays Essence, so every run makes the next one stronger.

Temple tracks

| Track | What it sells |
| Gear | Weapon and armor levels per class, cap 5 each, cost rising about 1.8x per level |
| Stat unlocks | Tier 1 stats open in the run sidebar (tiers 2 and 3 are Stretch) |
| Party Luck | The per Kill and per Room bonuses to both currencies, capped at +100% |
| Unlocks | Roster unlocks as the built game has them (the Priest rescue) and target-list slots |

Pacing targets

- A first failed run (dies around floor 2) earns enough Essence for 2 to 3 cheap upgrades.
- By run 3, a judge should reach a new floor they couldn't reach before.
- Rank 1 of every upgrade costs under one average run's Essence.

Persistence: one UE SaveGame object holds Essence, gear levels, Temple purchases, unlocks, best floor reached and settings. Save after every run and on every purchase. Include a reset-progress button so judges can start fresh.

Unlocks as onboarding: gating the 5th unit and event rooms behind early upgrades keeps the first run simple and gives the second run something new.

Narrative

The tower's keeper is The Architect, who protects the world by sacrificing millions through an array of towers. The party is one more group sent in to be lost. The meta loop doubles as the story: each failed run feeds the tower, and each return gets the party closer to The Architect.

Jam scope for story: light and environmental, delivered in short text.

- A title card and a 3 to 4 line intro on first launch.
- One line from The Architect at the start of each floor, written in advance.
- A short message on death and on a full clear.
- Event rooms carry small bits of lore through their choice text.

Tone: proposal is ominous and quiet, with The Architect sounding calm and certain rather than villainous.

Open question: is The Architect seen in the jam build (portrait or model), or only heard through text? Mia was considered for this role and is still undecided.

Art, animation and audio

Units are 2.5D: 4-direction PixelLab sprites standing in lit 3D arenas, seen from a fixed top-down camera. Real-time lighting, fog and Niagara VFX give an HD-2D look that justifies building in Unreal.

Pipeline

1. Lock the style first: one reference sprite, a fixed palette, and a fixed canvas size per unit class.
2. Generate every unit in PixelLab from that reference; agents can drive it through PixelLab's MCP server.
3. Directions: down, up and right, mirrored for left when the design is symmetrical.
4. Animate with PixelLab's text or skeleton animation tools and export sprite sheets.
5. Import as Paper2D flipbooks; arena props come from Tripo or blockout meshes.

Asset counts

| Asset | Count | Directions and animations |
| Party units | 5 | Idle, attack, ability in 4 directions; hit and death facing down only |
| Enemies | 6 (plus recolors) | Idle, attack in 4 directions; hit and death facing down only |
| Bosses | 2 | 1 or 2 directions; idle, 2 attacks, phase change, death |
| Arenas | 3 | 3D, built from Tripo props or blockout |
| Relic and room icons | About 30 | 2D, generated in PixelLab |

VFX: Niagara for hits, heals, shields and ability callouts. Use a small shared set recolored per role.

Audio: one menu track, one combat loop, one boss track, plus UI and hit sounds. Source from AI music or audio tools or licensed packs, and declare them.

Fallback: if a unit's sprite isn't ready, a role-colored placeholder sprite ships. Gameplay comes first. 8-direction sprites are a Sunday stretch for the 4 party units only.

UI and UX screens

The jam build needs 7 screens, all built in UMG. The floor map and combat HUD carry the game, so they get polish first.

| Screen | Purpose | Key elements |
| Title | Start, continue, settings, quit | Logo, The Architect's intro text on first launch |
| Temple | Spend Essence between runs | Gear levels, stat unlocks, Party Luck, costs, Essence total, New run button |
| Party select | Choose 4 of the unlocked units | Unit cards with role and stats, active synergy list |
| Floor map | Choose the next room | Node graph, room type icons, modifier icons, current path highlighted |
| Combat HUD | Watch the fight | Party HP panel, speed toggle, floor and room counter |
| Run results | Wrap up the run | Cause of death, floor reached, best floor, Gold lost, Essence kept, seed, Temple and New run buttons |

The relic pick screen is cut with the relics (Nov 14).

UX rules

- Every screen works with mouse only. Controller support is out of scope.
- The run flow should never need more than one click between fights besides the room and relic picks.
- Include a short how-to-play panel on the hub, 4 lines at most.

Technical design

The game is data-driven: units, enemies, relics, upgrades and room weights all live in DataTables, so agents can add content without touching logic. Blueprint-first, with C++ only where an agent finds it simpler.

Core systems

| System | Responsibility | Built as |
| Run Manager | Seed, current floor, party, relics, gold; starts and ends runs | GameInstance subsystem |
| Floor Generator | Builds the node map from the seed and room weights | Blueprint function library |
| Combat Manager | Spawns both sides, ticks attack timers, resolves damage, ends fights | Actor in each arena |
| Unit | Stats, abilities, targeting, 4-direction facing | One base Blueprint with a Paper2D flipbook, data per unit |
| Loot System | Drops, relic roll, XP | Component on Run Manager |
| Meta Save | Essence, upgrade ranks, unlocks, best floor | SaveGame object |
| UI | All 7 screens | UMG widgets |

Key decisions

- No GAS. Plain stat structs and timers are faster to build and debug in 4 days.
- One map per arena type; rooms load the arena and pass the rolled pack and modifier to the Combat Manager.
- All randomness goes through one seeded random stream so seeds replay exactly.
- A debug panel (dev builds only) to jump floors, grant Essence and force room types.

AI workflow

- Claude through Unreal MCP creates and edits Blueprints, DataTables and widgets.
- One agent per system, working from this GDD, with a short spec per system before it starts.
- Commit to version control after each working system so a bad agent change can be rolled back.

Build: Windows packaged build. Package a test build each night, not only on Sunday.

Scope

The must-have list is the minimum entry that still shows both Director's Cut features. Anything past it is only built once the must-haves run end to end in a packaged build.

Must have

- [ ] Auto combat with 4 party roles and readable numbers
- [ ] Procedural floor map with 4 room types (combat, elite, treasure, rest)
- [ ] 3 floors and 1 boss
- [ ] Gear level drops from Treasure rooms, Elite and Boss clears
- [ ] A Temple menu (gear levels, tier 1 unlocks, Party Luck) saved between sessions
- [ ] Title, Temple, party select, floor map, combat HUD and results screens
- [ ] Seeded runs (seed shown, no entry box)
- [ ] Packaged Windows build and asset declaration

Stretch, in order

1. 5th roster unit as an unlock
2. Event rooms
3. Floors 4 and 5 plus the final boss
4. Room modifiers
5. Speed toggle at 4x and the post-fight damage summary
6. Relics (cut for the jam) and trigger-mode unlocks (cut Nov 14)
7. Stat tiers 2 and 3
8. LLM-voiced Architect lines between floors
9. Daily seed and seed entry on the title screen

Cut from the jam

- Manual abilities or positioning
- GAS
- Controller support
- 3D character models, rigs, and 8-direction sprites for enemies and bosses
- Walkable 3D dungeon layouts
- Multiplayer, leaderboards, localization

Asset declaration plan

Keep a running asset log from the first hour, not a list rebuilt from memory on Sunday. Every asset gets a row the moment it enters the project.

| Field | Example |
| Asset | Tank unit sprite sheet |
| Type | 2D sprite, 4 directions |
| Source or tool | PixelLab, concept from Nano Banana Pro |
| AI generated | Yes |
| Human edits | Fixed off-model frames, palette cleanup |
| License or link | PixelLab subscription terms |

Tools to declare: Claude (code, Blueprints, design via Unreal MCP), PixelLab, Tripo (arena props), Nano Banana Pro, any audio generator, plus any Fab, Quixel or marketplace packs.

Rules to respect

- Don't feed Fab content tagged NoAI (for example Epic's Paragon heroes and Game Animation Sample) into any AI tool.
- Check the official rules section on pre-jam work before reusing any existing files, and declare anything made before Nov 12.
- Third-party sprite, sound or animation packs are allowed only if their license fits; log each one.

Risks and open questions

The biggest risk is time: Thursday and Friday are work days, so most building happens Saturday and Sunday. Every risk below has a fallback that keeps the must-have list shippable.

| Risk | Impact | Fallback |
| Auto combat feels like watching, not playing | Judges disengage | Lean on relic picks, synergy callouts, and the speed toggle |
| Meta pacing too slow for a 15-minute session | Judges never see progression | Cheap rank 1 upgrades, generous first-run Essence, a debug grant |
| Agent breaks a working system | Lost hours | Commit after every working system |
| Sprite generation takes too long | Art eats code time | Role-colored placeholders ship |
| Sprites drift off-model between directions | Cast looks inconsistent | Lock palette and reference sprite first; hand-fix or regenerate drifted frames |
| Packaging fails late | No valid entry | Package nightly; submit a backup build Saturday night |
| Asset log incomplete | Disqualification risk | Log each asset when it's added |

Open questions for review

1. Named roster characters or generic classes for the jam?
2. (Answered Nov 14: gold buys in-run stat ranks.)
3. One final boss, or endless scaling past floor 5?
4. Is The Architect shown as a portrait or model, or text only?
5. Mirror right-facing sprites for left, or generate all 4 directions for units with asymmetric designs?
6. Is the LLM Architect worth chasing for the LLM NPC category, or cut?
7. Which pre-jam work, if any, is being reused, and how will it be declared?
