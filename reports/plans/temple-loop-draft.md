# DRAFT: Temple loop, gear drops and currency swap (docs changes for director approval)

Status: DRAFT. Nothing in `docs/` has been edited. When approved, the "After" text goes into `docs/DESIGN-DECISIONS.md` and `docs/gdd.md`, then the build starts.

Source of these decisions: the director, Nov 14 (confirmations 1 to 3 after the ChatGPT proposal review).

## A. What is decided (director)

1. **Temple is the gold shop** that G4 already planned. It is a menu opened from the run-over card, not a place you walk to. No separate third currency.
2. **Currency swap, labels only for the jam.** In the run the currency is **Gold** (spent on the sidebar stat ranks). Permanent is **Essence** (spent at the Temple). The code and the save file keep today's internal names (`gold` is the permanent amount, "essence" is the in-run balance); only the words the player sees change. A full rename is post-jam cleanup.
3. **Cut for the jam:** the seed entry box and the trigger-mode unlocks. Trigger modes (On cooldown / Save for boss or elite / Fire when pack is large / Fire when ally is low) go on the post-jam list.
4. **Equipment = two slots per class (weapon, armor) that only hold stat upgrades.** Levels are found in the dungeon from treasure drops, and can be upgraded further at the Temple for a cost.
5. **Stat tiers are unlocked at the Temple.** Today only tier 0 shows in a run; the Temple unlocks the next tiers so they appear in the run's sidebar.
6. **Party Luck stats become Temple-only permanent bonuses.** They leave the in-run sidebar.

## B. Needs your answer before it goes in (my reading, change if wrong)

- **ANSWERED Nov 14 (director): Q1 yes, Q2 yes, Q3 yes.** What a gear level adds is open: see Q4, which replaces the earlier "5%" placeholder.
- **Q4 (open). What does a gear level increase?** Gear is a Percent modifier on the unit's resolved base stat (the engine already has a Gear source), the same math as one sidebar rank, which is +1% of the class's base stat. Proposal: weapon level = +10% Damage per level; armor level = +10% Health per level (no Defense %, which stays a tier 1 stat). Temple level cap 5 (= +50%); dungeon drops add temporary levels on top. Same % for every class, so no per-class table is needed (the 12 stub rows in `GearData.csv` become 6 classes x 2 slots with the same rule). Tuned in the balance pass.
- (original text of Q1 follows)
- **Q1. Do gear levels persist?** My reading: each class has a permanent **Temple gear level** (bought with Essence, kept forever) and the dungeon can add **temporary levels** on top for that run only (lost when the run ends). Alternative: dungeon levels are also kept. Recommend my reading, because kept dungeon levels would make the Temple pointless.
- **Q2. Which tiers are in the jam?** Tier 1 (Defense %, Crit, Regen, Cooldown Reduction, Range, Heal Power, Spirit stats) is must-have. Tiers 2 and 3 (Fortitude, Lifesteal, Multi Shot, Rapid Fire, Rend Armor, Thorns, Damage/Meter, Healing Echo, Bounce Shot, Death Defy) each need combat code. Recommend tier 1 for the jam and tiers 2 and 3 stay Stretch (shown as locked "coming soon" rows at most).
- **Q3. Where do gear drops come from?** Recommend: every Treasure room gives one gear level-up (to a random party member's weapon or armor), and each Elite clear gives one. Boss gives one.
- **Q4. Numbers.** All values below are DRAFT placeholders to tune with the balance pass.

## C. Changes to `docs/DESIGN-DECISIONS.md`

### C1. Section 1, "Economy and progression" table (replace rows "Gold", "Essence", "Stat unlocks", "Stat scope", "Gear", "Relics")

| Topic | Decision | Resolves |
|---|---|---|
| Gold (coins) | In-run currency (display name; the code calls it essence). Earned per kill and per cleared room, spent on stat ranks from the sidebar at any time during the run. Lost when the run ends. | GDD-13 |
| Essence | Permanent currency (display name; the code calls it gold). Paid per room by room type, kept even if the run is abandoned or the party wipes. Spent only at the Temple. | GDD-24, GDD-09, GDD-22 |
| Temple | A menu opened from the run-over card (Spend Essence) and the start of each run. It sells: gear levels, stat-tier unlocks and the Party Luck bonuses. A failed run always pays Essence, so every run buys something. | new |
| Stat unlocks | Stats unlocked with Essence at the Temple appear in the run sidebar, where they are bought with Gold. Tier 0 is free from the start. | GDD-14 |
| Stat scope | Tiers 0 and 1 are must-have. Tiers 2 and 3 are Stretch (see Q2). | GDD-02, GDD-18 |
| Gear | Two slots per class (weapon, armor) that hold stat upgrades only: no inventory, no item names beyond a flavor line. Weapon raises Damage, armor raises Health (a percent of the class's base stat per level, see Q4). Each slot has a permanent Temple level (bought with Essence) plus temporary dungeon levels from treasure drops that last for the run (see Q1). | new |
| Treasure drops | A Treasure room (and each Elite or Boss clear, see Q3) gives one gear level to a random party member's weapon or armor, shown on screen as a short line such as "Iron Sword: Damage up". Treasure no longer pays gold only. | new |
| Party Luck | The four Party Luck stats (Essence per Kill, Essence per Room, Gold per Kill, Gold per Room, names as the player sees them after the swap) are Temple purchases only, capped at +100% as in section 2. They are not sold in the run sidebar. | new |
| Relics | Still cut for the jam (second in the cut order). Treasure gear drops take their role as the in-run reward. | GDD-10 |

### C2. Section 1, rows to change

- **"Target priority" (keep):** target-list slots stay a paid unlock, now bought with Essence at the Temple.
- **"Ability triggers" (replace):** "Cut for the jam (director, Nov 14). Trigger modes (On cooldown, Save for boss or elite, Fire when pack is large, Fire when an ally is low) move to the post-jam list. Abilities always fire on their default rule."
- **"Run controls" (edit):** "keeps gold, no Essence carry-over" becomes "keeps the permanent currency (Essence), no Gold carry-over".
- **"Seeds" (replace):** "Separate map stream per floor (seed + floor number). Seed entry on the title screen is cut for the jam; the seed is still shown on the results card. Promise stays 'same seed, same map'."
- **"Cut order" (replace):** "1 relics, 2 fog on the node map, 3 staggered spawns on regular Combat rooms, 4 reduce the tier-1 stat list. Already cut: seed entry box and trigger-mode unlocks (Nov 14). The gear shop is no longer cut: it is the Temple's gear levels."
- **"Story text":** unchanged; the run-over card gains the Temple button.

### C3. Section 2, "Stat tiers" heading

Change "(unlocked with gold, then buyable with Essence in-run)" to "(unlocked with Essence at the Temple, then buyable with Gold in the run)". In the tier 1 row, move the four Party Luck stats out: "Party Luck: Temple only, not in the sidebar". Tier 2 and 3 rows stay Stretch.

### C4. Section 3, "Starting numbers" (DRAFT additions)

- **Gold (in run):** 5 per kill, 10 per cleared room (unchanged numbers, new name).
- **Essence (permanent):** Combat room 10, Elite 25, Boss 50 (unchanged), Treasure room 15.
- **Tier 1 stat unlock:** about 100 Essence each.
- **Gear is per class, per slot:** every class has its own weapon level and its own armor level (6 classes x 2 slots = 12 independent Temple levels, bought one at a time, kept even when that class is benched). A dungeon drop goes to one random living party member's weapon or armor.
- **Gear Temple cost ramp (DRAFT):** level 1 = 50 Essence, then x1.8 per level, rounded: 50, 90, 160, 290, 520 (1,110 for all five levels of one slot). Reference: the soak logs show about 70 permanent currency paid per fully cleared floor 1, so a run that dies on floor 3 or 4 earns roughly 200 to 300.
- **Gear bonus per level (DRAFT, see Q4):** weapon +10% of the class's base Damage, armor +10% of its base Health, per level (one sidebar rank is +1%). Dungeon drops are worth one level each. Temple level cap 5 per slot.
- **Gold sidebar costs:** unchanged (start at 2 per rank in the fine-rank setup, 15% growth).

### C5. New section: "Retry loop and the difficulty wall (target)"

- A run ends in a wipe, an abandon or a victory. The run-over card shows cause of death, floor reached, best floor, Gold earned (lost), Essence earned (kept), and two buttons: **Temple** and **New run**.
- **Wall target (DRAFT for tuning):** a fresh Warrior and Mage party reaches about floor 3 or 4 on run 1. About two to three Temple visits should let the next run clear that wall. The balance pass measures it with the bot and the debug grant; if the bot clears floor 10 on a fresh save, enemy scaling or Temple bonuses are adjusted, not the bot.
- **Pacing (from the GDD):** a first failed run earns enough Essence for two or three cheap Temple purchases; rank 1 of every Temple item costs less than one average run's Essence.

### C6. New section: "Post-jam list"

Trigger modes; the full stat tiers 2 and 3; relics; Event rooms; seed entry on the title screen; a real inventory with randomized gear; a full rename of the internal currency names; a hub or title screen with the Temple as an explorable place.

## D. Changes to `docs/gdd.md`

The GDD is the older document and already differs from the built game in places (five floors vs no fixed limit, five roster units vs six classes, a relic pick screen, a hub screen). I only edit what this change touches and list the rest at the end for your call.

### D1. "Core loop" diagram (lines 32 to 42)

Replace with:

```
Title -> Temple (spend Essence) -> Floor map (procedural rooms)
  -> [pick room] Auto fight + loot (no player input)
       -> [Treasure / Elite / Boss] gear level drop, applied at once
       -> [room cleared] spend Gold on stat ranks any time -> next room
       -> [party wipe, abandon or full clear] Run results (Essence kept)
  -> [Temple button] spend Essence: gear levels, stat unlocks, Party Luck -> New run
```

Add: "The player's decisions are the party, the next room, and what to spend Gold on in the run; between runs, what to buy at the Temple."

### D2. "Loot and in-run upgrades" (lines 135 to 153)

- Replace the opening paragraph with: "Looting is automatic. Treasure rooms, Elite clears and bosses drop a gear level (a stronger weapon or armor for one party member) that applies immediately for the run. Relics are cut for the jam."
- Replace the "Two currencies" table with: Gold, earned from every kill and room, spent on in-run stat ranks, lost at run end, kept: No. Essence, earned per room by room type (Combat, Elite, Boss, Treasure), spent at the Temple, kept: Yes.
- Replace the relic paragraph with a short "Gear" paragraph (two slots, stat upgrades only, Temple level plus dungeon levels).
- Answer the open question: "Does gold have an in-run use? Yes: it buys sidebar stat ranks."

### D3. "Meta progression" (lines 155 to 176)

- Heading text: "Between runs, the player spends Essence at the Temple."
- Replace the "Upgrade tracks" table with: **Gear** (weapon and armor level per class), **Stat unlocks** (tier 1 for the jam), **Party Luck** (Gold and Essence per Kill and per Room, capped at +100%). Remove the "Run start" row (relic and reroll), and the "Unlocks" row keeps only the 5th and priest-style roster unlocks as the built game has them.
- Persistence line: add "gear levels and Temple purchases" to the save contents.

### D4. "Procedural floors" and "Seeds"

Seeds paragraph: "Every run uses a seed shown on the results screen. Same seed, same floors. Entering a seed on the title screen is cut for the jam."

### D5. "UI and UX screens" (lines 220 to 237)

Replace the "Upgrade menu (hub)" row with **Temple**: spend Essence between runs; gear levels, stat unlocks, Party Luck, Essence total, New run button. Drop the "Relic pick" row (cut). The "Run results" row gains Temple and New run buttons, Gold lost and Essence kept.

### D6. "Scope" checklists (lines 273 to 293)

Must have: replace "Relic pick after rooms, 12 relics minimum" with "Gear level drops from Treasure and Elite rooms"; replace "Essence and an upgrade menu with at least 10 upgrades" with "A Temple menu (gear levels, tier 1 unlocks, Party Luck) saved between sessions"; replace "Seeded runs" with "Seeded runs (seed shown, no entry box)". Stretch list: remove "Full 20 relics" and "Daily seed" stay; add trigger modes and stat tiers 2 and 3 under Stretch.

### D7. "Open questions" (line 337 on)

Question 2 is answered (see D2). No other open question changes.

### D8. Not touched, for your information

Still out of date against the built game (not part of this change): 5 floors (the game has no fixed floor limit and a boss at floor 10), 5 roster units (6 classes), the Tank/Healer/Support role table, "Unit XP", the 3 reusable arenas, the Run Manager and Loot System rows, and the Relics asset count. Say if you want a separate pass to bring them in line.

## E. Build impact (for the plan after approval)

- `MetaSave`: add Temple gear levels, unlocked tiers, Party Luck ranks (older saves keep working: missing keys default).
- `RunFlow` / `RunSim`: treasure and Elite drops add dungeon gear levels; Temple levels apply at run start through the same path the Essence ranks use.
- `UI`: Temple overlay, results-card buttons, a drop toast, label swap (Gold in run, Essence permanent).
- Tests: MetaSave round trip, gear application, drop rules, the label mapping in the UI strings; then the wall measurement with the bot.
- Estimated new work about 7 hours (see the assessment), against the Sunday budget with the seed box and trigger modes cut.
