# Phaser port: ready for playtest (Stages 4 and 5)

Date: Nov 19, 2026. Covers all work since the goal "a game ready for a playtest".

**Branches:**

| Branch | Commits | Status |
|---|---|---|
| `p4-combat-view` | `f6a0c15`, `2c718d8` | pushed |
| `p5-temple-save` | `d6a4dba`, plus this report and a small follow-up commit | pushed; cut from p4, so it holds both stages |

Nothing is merged to main yet.

## What you can do now

- **Start on the Temple.** The game opens on the Temple. Spend Faith, pick 3 of the 4 heroes, then press New Run.
- **Play a run with mouse, keyboard or touch:**
  - Move with the arrow pad, the arrow keys or WASD, or tap a room on the mini-map to walk there.
  - Watch the party walk out, the camera pan, and the next room's enemies already standing there.
  - Fights run in real time with cast bars, health bars, floating numbers and the animated Goblin Grunt.
  - Miracles: keys 1–3 or the buttons. Heal and Shield target a hero portrait. Smite shows a ring on the ground and strikes where you click.
  - Buy Essence ranks in the side panel with x1/x10/x100/Max.
  - Teleport up from the crystal room once the quota is met.
- **Speed and Auto.** Pause, speed 1/2/4x (10x in testing builds), and Auto, which plays floors on its own and never spends Gold.
- **End of a run.** A wipe shows the Run Over card, with Temple and New Run buttons. Back on the Temple returns to the card.
- **Saving.** Everything is saved in the browser. Purchases and the party survive a reload.
- **Reset progress** is on the Temple and needs a second click within 4 s.
- **Music** fades between tracks: "Into the Depths", and "No Turning Back" from floor 10. The volume slider is on the Temple and is saved. Browsers start audio after your first tap or key.
- **Testing builds.** The dev server is a testing build. Pause opens the tuning menu with the 9 Unreal tuning rows, kill or heal all, fill the gauge, and Reset ALL.
- **Phone layout.** Landscape works. Portrait shows "Turn your phone sideways". The canvas renders at device pixels (capped at 2x), so text stays sharp.

**Query options:** `?seed=N&floor=N&priest=1&mult=1.3&cast=0&test=0&reset=1`. These match the Unreal `tol.*` variables. `reset=1` wipes the save.

## Phone testing over Tailscale

1. Run `npm run assets` once. It copies the goblin frames and makes the smaller music files.
2. Run `npm run dev:lan`. This is Vite with `--host`, so it listens on every network interface, including Tailscale.
3. On the phone, open `http://<this PC's Tailscale name or IP>:5173`. Editing code reloads the page on the phone.

## Verified

- **Checks:**
  - Typecheck and lint are clean.
  - `npm run test:fast` passes: 550 passed, 2 skipped.
  - `npm run build` succeeds.
  - A code-review report is in `reports/code-review/p4-p5-live-run.md`, with no open BLOCKING or MAJOR findings.
- **In the built-in browser at 1280×720 and 844×390:**
  - manual moves
  - key and mouse miracles, including Smite
  - Auto from floor 1 to a wipe
  - results → Temple → Back → New Run
  - buy and change the party, reload, and the changes are still there
  - Reset progress
  - music load, track switch and volume
- **Not verified:**
  - On a real phone. The touch feel, frame rate on phone hardware, and audio unlock on iOS Safari are for your first Tailscale session.
  - Smooth real-time frame pacing. The browser pane was hidden, so I drove frames by hand. Frame cost measured about 6 ms on this PC.

## Decisions I made, with the answer I would recommend

These were not asked. Each can be reversed cheaply.

1. **Auto stall fix, a rule-level change.**
   - The problem: Unreal's Auto waits for the new floor's start-room fight before its next step. Some start rooms have no enemies, so Auto stopped for good after teleporting (seeds 7, 11 and 99 stall on floor 2).
   - What I did: Auto now keeps stepping when no fight is pending. A test covers it.
   - Recommendation: keep it. Also fix it in Unreal if that build is still used.
2. **Music format.**
   - The problem: there is no audio encoder on this PC, and installing an MP3 encoder package was blocked by the permission check.
   - What I did: the copy script writes mono 22.05 kHz WAVs, about 7 MB each instead of 27–28 MB. They play everywhere but take a few seconds to load over Tailscale.
   - Recommendation: allow a dev-only encoder (`@breezystack/lamejs`, LGPL, used only by the script, never shipped) for files about 1 MB each.
3. **Licensed assets stay out of git.**
   - Goblin frames and music are copied into the gitignored `public/assets/vendor/` by `npm run assets`. The game falls back to cubes and silence without them.
   - Recommendation: keep this until the register rows are filled. Before any public build, check that serving the converted music counts as "not redistributing the raw files" (`reports/assets/register.md`).
4. **DOM for the results card and the Temple.**
   - This follows the Stage 0 decision. Like Unreal, they cover only the room view, so the top bar, mini-map and Essence panel stay visible and the HUD buttons around them still work.
5. **Temple layout changes for small screens.**
   - The purchase columns scroll inside the card. On short screens the whole card scrolls and New Run sits in the card's header.
   - Unreal draws New Run at the bottom of a card that always fits.
   - Recommendation: keep the header button. Moving it back to the bottom is a one-line change.
6. **Reset progress is on the Temple in every build.**
   - Unreal has it only in the testing tuning menu (as Reset ALL, which also starts a run). The plan's Stage 5 asks for it on the Temple with a two-click confirm.
   - Recommendation: keep it on the Temple, and hide it in a release build if you prefer.
7. **Volume.**
   - One music slider on the Temple, saved per browser. 100% equals Unreal's level (0.5).
   - There is no sound-effects slider because there are no sound effects yet.
8. **Scaling.**
   - Canvas at device pixels (capped at 2x). The layout uses CSS pixels with Unreal's 0.6 scale floor, so phone text stays readable.
   - No fullscreen button. Recommendation: add one only if the browser bars get in the way on the phone.
9. **The testing build is the dev server.**
   - Like the Unreal testing build: 10x speed and the tuning menu are on in `npm run dev` and off in `npm run build`.
   - `?test=1` or `?test=0` overrides it.
10. **Enemy look.**
    - Non-goblin enemies are green cubes and summons are cyan, as in Unreal.
    - Portraits show the class initial. I did not add the elite outline I tried at first, because Unreal has none.

## Known gaps (not blockers for a playtest)

- **The arrow pad is small on a phone** (about 30 px). Tapping rooms on the mini-map is the easier way to move.
- **Walls do not hide units.** The room is drawn flat, then units on top, so a unit near the north wall draws over it. Unreal's 3D does not have this. It is rarely visible.
- **Phone text is small but readable.** The Essence row's rank line is the smallest text.
- **The first music load takes a few seconds** on a slow link. Item 2 above would fix this.
- **Open design items from before, still not decided by me:**
  - how the Assassin is obtained
  - the floor-2 rescue when the party already has three heroes
  - Temple gear rows for the Assassin and Priestess
  - cast-time feel
  - hurt cooldown and animation feel
  - the trademark check

## If you approve

1. Merge `p5-temple-save` into main. It holds p4 too.
2. Run the full tests on main.
3. Delete `p4-combat-view` and `p5-temple-save` locally and on origin.
4. Then start phone testing with `npm run dev:lan`.
