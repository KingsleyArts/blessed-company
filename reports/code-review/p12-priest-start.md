# p12 Priestess from the start: src/core changes

**Decision (director, Nov 21):** the Priestess starts in the party. The floor 2 rescue no longer happens in the game.

## What changed in `src/core`
- `runManager.ts`: new `priestFromStart` option, off by default and on in `RunScene`. `grantStartingPriest()` gives a save the Priestess, adding her to the party if a slot is free.
- `runFlow.ts`: `setPriestStart()` turns off the rescue floor and keeps the small first floor until the player has reached floor 2. Run saves record this mode.
- `runSave.ts`: reads the optional `priestStartTutorial` field; a wrong type rejects the save. The save version stays 1.

`floorGenerator.ts`, `roster.ts` and `autoRun.ts` are unchanged.

## Risks checked
- **Tutorial floor:** the generator keys it on not having the Priest, so owning her from the start would have removed it. The new mode keeps it.
- **Runs already in progress:** a run saved under the rescue rules resumes with its rescue room. The grant never runs during a run or before a saved run resumes.
- **Older saves:** she joins a free party slot. A full party stays as chosen, and she is available on the Heroes screen.
- **Parity:** the Unreal parity rules and golden fixtures are untouched because the option defaults to off.

## Known limitation
`npm run soak` still uses the old Warrior + Mage start with a rescue, so its results do not describe the game's new start until `autoRun.ts` is updated. That file has uncommitted balance work in another session, so it was left alone.

## Verification
- `npm run lint`, `npm run build`, and `npm test`. New tests are in `priestStart.test.ts`.
- Browser, fresh save: New Game gives Warrior, Mage and Priestess on the small first floor. The test copy lacks the gitignored goblin art, so Grunts showed as placeholder cubes there.

## Findings
No BLOCKING or MAJOR findings. This was the orchestrator's own check, not an independent reviewer pass.
