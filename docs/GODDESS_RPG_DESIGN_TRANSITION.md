# Design Transition: from the dungeon-crawler jam game to the goddess hero management sim

Written Nov 16, 2026. Read this before touching the project. It exists so that nobody (human or agent) confuses this game with either of two other things:

- the **original single-hero goddess concept** (training, rest, a Tamagotchi-style hero). Not coming back unless approved.
- **Blessed Company, the separate 2.5D Metroidvania** with hybrid sword-and-magic combat. This project must not use that name, and must not drift toward Metroidvania design.

Status: **approved by the director on Nov 17, 2026.**
- Economy: Option C for the class prototype (Faith, Essence, and a small Gold wallet for equipment), Option B as the long-term target.
- Priestess: stays a floor-2 rescue.
- Owned heroes: Warrior, Mage, Priestess, Assassin; three active slots.
- Scope cut order: approved as written in the Implementation Plan.
- Title: **Blessed Company** (trademark and store availability not yet checked).
- `g4-temple` was merged to main (9d017ee) and its branch deleted.
Code and folder names keep the old internal name until the rename step (Plan phase 8).

## 1. Original gameplay focus

An incremental dungeon crawler built for a game jam: a party of automatic fighters clears generated floors, the player buys in-run upgrades, dies, spends a permanent currency at the Temple, and tries again. The player's decisions were the next room and what to buy. Heroes: Warrior and Mage at the start, the Priest rescued on floor 2.

## 2. New gameplay focus

The player is a goddess managing a party of adventurers. Between expeditions she prepares them: party choice, equipment, finances and permanent blessings. During an expedition the heroes fight on their own while she spends a Miracle Gauge on divine interventions. Dungeon exploration stays, but it is the test of the preparation, not the point of the game.

Pillars: party management, autonomous heroes, divine intervention, mortal independence, incremental progression, meaningful preparation.

## 3. Systems retained (verified in the code)

Automatic combat and threat; six hero classes; generated floors, rooms, doors, walk, minimap; kill quota and teleport crystal; Auto navigation; speed and pause; in-run sidebar upgrades; Temple screen; run results and retry loop; difficulty tuning (floor 1 usually fails with no upgrades; enemy multiplier 1.3, floor scaling 1.25); dungeon music; the native test suites and headless soak tooling.

## 4. Systems modified

| System | Change |
|---|---|
| Permanent currency | Becomes **Faith** (words only at first). Buys permanent blessings. |
| In-run currency | Becomes **Essence** (words only). Same behavior. |
| Temple | Reworded around blessings; adds a party panel and an equipment shop. |
| Temple gear levels | Bought with Gold instead of the permanent currency. |
| Party Luck | Gold-income lines removed or reworded; Faith cannot raise Gold. |
| Results card | Adds Faith, Gold earned, and what was lost. |
| Save file | New version with Faith, Gold, roster, active party, equipment; saving turned on again. |
| Priest rescue | Decision pending (section 10). |

## 5. New systems required

1. Miracle Gauge and two miracles (Divine Healing, Divine Shield).
2. Roster and party selection (four heroes, three active slots).
3. Gold wallet with its own payouts.
4. Fixed equipment items, a simple inventory and a shop.
5. Optional (P1): hero experience and levels.

### Miracle Gauge, first-pass numbers (placeholders to tune)

- Shared by the active party; capacity 100; resets at expedition start and end; never costs or earns Faith.
- Fills 1 per 4 damage dealt by heroes and 1 per 4 healing done (placeholder), capped at 100.
- Divine Healing costs 40: heals the lowest-HP living hero for 40 percent of max HP, or all heroes for 15 percent (decide one).
- Divine Shield costs 30: one hero takes no damage for 5 seconds; targeted by the player or the most threatened hero when pressed from the HUD.
- Refused with no feedback cost when the gauge is short, the fight is not running, or the only target is dead or full.
- Tests: fill, cap, spend, reset, edge cases at every game speed and while paused.

## 6. Proposed economy (pending approval)

| Resource | Role | Persistence | Source | Spent on |
|---|---|---|---|---|
| **Faith** | Divine progression | Permanent, kept even after a wipe | Rooms cleared, floor milestones, expedition results, partial reward on failure | Permanent blessings, miracle capacity. Not equipment, not miracles |
| **Essence** | Power during one expedition | Resets every run; unspent is discarded | Kills, cleared rooms | Temporary stat upgrades per hero |
| **Gold** | The party's own money | Persistent wallet | Loot, Treasure rooms, boss drops, expedition rewards | Equipment. No upkeep in the prototype |
| **Miracle Gauge** | Tactical resource | Per expedition | Combat actions | Miracles. Not a currency |

Prototype form (Option C in the Implementation Plan): the three currencies above, with Gold used for equipment only.

## 7. Existing currency conflicts

- **Words are reversed.** Today "Gold" means the in-run currency (code `essence`) and "Essence" means the permanent currency (code `gold`). The proposal needs the opposite words. First step: relabel the player-facing text; leave code names alone until the economy settles, then rename in one commit.
- **Gold income can be bought with the permanent currency** (Party Luck: GoldPerKill, GoldPerRoom). That contradicts "the goddess cannot create Gold". Remove or reword before Gold exists.
- **Gear levels are bought with the permanent currency today.** Under the proposal that spending moves to Gold.
- **Permanent payouts come from room types** (10/25/50/15). Those become Faith. Gold needs its own payout table.
- **Save data:** a v1 file's `gold` becomes Faith; `gearLevels` are not carried; no real saves exist (saving is off).

## 8. Divine authority versus mortal finances

The goddess can: grant permanent blessings, perform miracles in combat, guide party composition, recommend or direct equipment purchases, and develop her followers.

She cannot: create Gold, pay for equipment with Faith, remove the cost of an expedition decision, or replace the heroes' own money with divine power.

This should show in play, not in text: Faith and Gold appear in different places (blessings vs shop), no Faith upgrade ever adds Gold, miracles cost only the gauge, and gear costs Gold only. Do not add wages, debt, durability or repair costs unless a playtest shows they improve the prototype.

## 9. Systems explicitly excluded (for the class prototype)

Single-hero training, rest, fatigue and relationship systems; equipment durability, repairs, crafting, rarity and affixes; wages and debt; a full skill tree; more than four owned heroes and more than two miracles; relics; Event rooms; the 100-floor mode (jam builds stay at 10 floors); a 3D hub; sprite animation work and UMG.

## 10. Unresolved design questions

1. **Priestess (decided Nov 17: stays a floor-2 rescue).** Today she is a floor-2 rescue and is not kept between runs. A management sim with a party picker works better if she is selectable. Options: (a) start with her (best for the picker); (b) keep the rescue as the unlock, persisted after the first rescue (keeps the story beat, costs one early run); (c) keep the rescue every run (not compatible with a party picker). Recommended: (b), with her kept after the first rescue.
2. Which four heroes are owned: Warrior, Mage, Priestess and one more (suggest Assassin).
3. Does unspent Essence convert into a small Faith bonus at the end of a run? Recommended: no.
4. Does a wipe keep Gold? Suggested: half.
5. Faith sources beyond rooms (milestones: first boss, new best floor).
6. Miracle targeting: manual target or automatic.
7. Does hero XP replace Essence ranks, or add to them? Recommended: defer XP.
8. Whether to keep the potion-slot idea (post-jam list in `DESIGN-DECISIONS.md`). It overlaps with miracles; probably dropped.

## 11. Naming (decided Nov 17: Blessed Company; the table below is the original shortlist)

The new title must not suggest a Metroidvania. Trademark and store availability **have not been checked** for any name below; check before approving.

| # | Title | Meaning and tone | Strengths | Weaknesses |
|---|---|---|---|---|
| 1 | Divine Patronage | A goddess as patron of adventurers; light and clear | Says "management" at once | Sounds corporate |
| 2 | Lumen Vow | A promise made in light; gentle JRPG | Short, easy to brand | Vague about the genre |
| 3 | Halohearth | Halo plus hearth: a warm temple that sends heroes out and takes them back | Coined, memorable | Hard to spell on first hearing |
| 4 | Aegis of Dawn | Protection and a new start | Heroic | "Aegis" is common in game titles |
| 5 | Sanctum Chronicle | A temple's record of its heroes | Fits a management log | Generic "Chronicle" |
| 6 | The Goddess's Retainers | Literal, comic-adjacent | Clear premise | Long; weak as a logo |
| 7 | Blessing Ledger | Divine plus accounting | Nods at the Gold rule | Sounds like a spreadsheet |
| 8 | Heavensworn | Heroes sworn to the heavens | Strong fantasy tone | Sounds like an action game |
| 9 | Altar Vanguard | Heroes as the altar's front line | Combat-forward | Hides the management side |
| 10 | Seraph Guild | A guild run by an angelic patron | Guild-management signal | "Seraph" is heavily used |

**Top three:** 1. Divine Patronage (clearest about the game), 2. Lumen Vow (best tone and brandability), 3. Halohearth (most distinctive). Do not rename the Unreal project, folders, module or identifiers until a title is approved.
