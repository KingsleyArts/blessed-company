# p11 floor size debug setting: src/core changes

**Change:** testing builds can set the floor size rolls from Settings. Shipped values and non-testing builds are unchanged.

## What changed in `src/core`
- `floorGenerator.ts`: adds `FloorSize`, `floorSizeOf`, `defaultFloorSize`, `normalizeFloorSize`, `withFloorSize`. `generate()` is untouched.
- `runFlow.ts`: `setFloorSize()` affects floors built from then on. The checkpoint records the size the current floor was built with, and `restore()` rebuilds with that size.
- `runSave.ts`: reads the optional `floorSize` field. A missing field is valid (older saves); a malformed one rejects the save. The save version stays 1.
- `runManager.ts`: `setFloorSize()` carries the setting across new runs and resumes.

## Risks checked
- **Saves:** floors are rebuilt from the seed, so a changed setting could have rebuilt a different floor on Continue. The saved size prevents this; older saves use the original 10-20 and 5-8.
- **Parity:** the golden and parity suites still pass, because the default config is unchanged.
- **Small floors:** 300 seeds x floors 1-10 x with and without Priest, at 1 to 10 main rooms (60,000 floors): no crystal, reachability or quota failures, no fallback layouts, no exceptions.

## Verification
- `npm run lint`, `npm run build`, `npm run test:fast`: 581 passed, 2 skipped. New tests are in `floorSize.test.ts`.
- Browser at phone landscape (844x390): controls work in the title and Temple Settings, the value persists after reload, new runs use it, Reset restores defaults, and `?test=0` hides the controls.

## Findings
No BLOCKING or MAJOR findings. This was the orchestrator's own check, not an independent reviewer pass.
