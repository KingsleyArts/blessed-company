# Code review: p8 Heroes screen (Nov 19)

Scope: `src/core/heroSheet.ts` (new), `src/core/heroSheet.test.ts` (new), and the Heroes-screen methods in `src/core/runManager.ts`
(`getHeroes`, `setParty`, `getParty`, `autoParty`, and `applyMetaToFlow` now taking a flow). UI files (`src/ui/temple.ts`,
`src/ui/overlay.ts`, `src/game/RunScene.ts`) are layout only and outside the review gate, but were read for how they call core.

Lenses: rules, correctness.

## Result

No BLOCKING or MAJOR findings.

## Rules lens

- **The stats on the sheet are the stats a fight uses.** `getHeroes` builds each hero as a party unit in a throwaway `CombatSim`
  and applies the same `applyEssenceToSim` (Temple levels, with the sidebar reset to that one class) and `applyGearToSim` (Temple
  gear, no dungeon gear) that `startPendingFight` uses. The test "the sheet equals the hero at the start of a real fight" buys
  levels, unlocks and gear, starts a real run, and compares every party unit's formatted lines with its sheet. It passes.
- **Crit Factor is 150% once unlocked.** This comes from CombatConfig `baseCritFactor` (1.5). It is shown as "Locked" until
  `Stat:CritFactor` is bought, which matches the director's note. Tested.
- **No in-run Essence on the sheet.** The sheet uses a fresh `RunFlow`, so the live run's sidebar ranks are never read or
  changed.
- **Party rules.** A party has 1–3 owned heroes with no repeats, matching `kActiveSlots` and `rosterOwns`. `setParty` refuses to
  change the party while a run is active, so a run's party can't change mid-run. Tested.
- **Auto Party** puts heroes in role order: Tank, Healer, ranged damage, melee damage, Support. Heroes with the same role keep the
  screen order. This is new behaviour, an orchestrator default. It is noted for the director.

## Correctness lens

- `getHeroes` allocates 6 small sims each time the Heroes tab is drawn, which happens on each tap. That's cheap at this size, so
  it's not worth caching yet.
- `setParty` saves, then notifies `MetaChanged`. The scene redraws the Temple when it gets that, and the overlay also asks for a
  redraw, so the page is drawn twice on one tap. This is harmless (it costs a few milliseconds) and doesn't change scroll or the
  selected hero.
- The party can't be saved as empty (`activeParty` would fall back to Warrior + Mage). Clear Party is a draft held in the
  overlay, and Begin Expedition stays disabled until a hero is added. Leaving the tab drops the draft, so the saved party shows
  again.

## MINOR / notes for the director

- **MINOR:** The Warrior's sheet lists Sword Strike and Taunt but not Cleave. `Cleave` is in AbilityData and in the combat code,
  but no ClassData row lists it in `ExtraAbilityIds`, so no hero casts it today. The sheet shows what combat does.
- **Note:** A crit deals 150% even while Crit Factor shows "Locked", as long as Crit Chance is unlocked. The base factor applies
  either way. The "Locked" label on Crit Factor means it can't be upgraded yet, not that crits deal normal damage.
- **Note:** Barbarian and Summoner are shown locked ("Cannot be recruited yet") because nothing grants them.

## Verified

- `npx vitest run src/core/heroSheet.test.ts`: 4 passed.
- In-app browser at 932×430, 667×375 and 1440×900:
  - adding, removing, the full party, Clear Party (Begin disabled), Auto Party, and a locked hero's note
  - leaving the tab restores the footer
  - Begin Expedition from the Heroes tab starts a run with the saved party
- The slide animation is turned off when the device asks for reduced motion. The test pane asks for it, so the slide itself
  still needs a look on the phone.
