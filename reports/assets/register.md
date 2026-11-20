# Asset register (DRAFT, Nov 18)

CLAUDE.md: third-party assets are recorded here with their source and licence; AI tools are not sourced assets but are still listed.
Rows marked **DIRECTOR TO FILL** are facts only you know; nothing below was guessed.

| Asset | Where in the repo | Source / author | Licence (as shipped with the asset) | Used in the build? | Notes |
|---|---|---|---|---|---|
| Goblin grunt sprite sheet (18 frames: hurt, walk, attack, idle, dead, left and right) | `Assets/Sprites/goblin_grunt.png`; sliced frames `Assets/Sprites/goblin_grunt/`; imported `Content/Art/Goblin/` | **DIRECTOR TO FILL** (who drew or generated it, and with which tool) | **DIRECTOR TO FILL** | Yes (Goblin Grunt enemy) | The slicing and import scripts are ours: `scripts/slice_goblin_sheet.py`, `scripts/import_goblin_sprites.py`. If any AI image tool made the sheet, list the tool and date here. |
| Fantasy Quest and Dungeon Music Pack (Cinnamon Shops): "Into the Depths", "No Turning Back" in use | `Assets/Fantasy Quest & Dungeon Music Pack/`; imported `Content/Audio/Music/` | Cinnamon Shops | Pack `License.txt`: commercial and non-commercial use in games allowed; modifying allowed; no reselling or redistributing the raw files; attribution optional but appreciated ("Music by Cinnamon Shops") | Yes (two loops) | Put the credit line in the game's credits and the submission text. The raw `.wav` files must not ship as loose files. |
| Low Poly Dungeon Asset Pack v1.3 (Miguel Lobo) | `Assets/Low Poly Dungeon Pack/` | Miguel Lobo, mlobo.itch.io (bought) | Pack `Info.txt`: personal and commercial use; no reselling or redistributing the pack; credit appreciated | **No, not imported yet** | Candidate for the goblin cave rooms (Environment, Props, Textures). Record here when imported. |
| Unreal Engine basic shapes (plane, cube, sphere) and `BasicShapeMaterial` | engine content (`/Engine/BasicShapes/`) | Epic Games | Unreal Engine EULA | Yes (room floors and walls, placeholder units) | |
| Paper2D plugin (flipbook sprites) | engine plugin | Epic Games | Unreal Engine EULA | Yes | Enabled in the `.uproject`. |

## AI tools used on the project

| Tool | Used for | Notes |
|---|---|---|
| Claude (Anthropic): Claude Code | code, tests, build and import scripts, review reports, design drafts | Agent and MCP configuration is pre-jam material and is declared, not hidden (CLAUDE.md). |
| **DIRECTOR TO FILL** | any image, audio or text tool used for the sprite sheet, music, names or store text | |

## Phaser build (Nov 19)

Nothing licensed is committed to this repo. `npm run assets` (`scripts/copy-assets.ts`) copies from the Unreal reference repo into the gitignored
`public/assets/vendor/`, and the game runs without it (cube goblins, no music).

| Asset | Copied to | How | Notes |
|---|---|---|---|
| Goblin grunt frames (18 PNGs) | `public/assets/vendor/goblin_grunt/` | copied as-is | Source and licence still **DIRECTOR TO FILL** (row above). |
| "Into the Depths", "No Turning Back" | `public/assets/vendor/music/*.wav` | converted by the script: mono, 22.05 kHz, 16-bit (about 7 MB each, down from 27-28 MB) | A modified copy, which the pack licence allows. A dev server or a static build serves these files to the browser, so for a public build check that this does not count as redistributing the raw files. MP3/OGG would be smaller still; no encoder is installed, and adding one as a dependency was not done. |

### Committed in this repo

| Asset | Where | Source / author | Licence | Used in the build? | Notes |
|---|---|---|---|---|---|
| Temple background (temple interior with the goddess statue and a seated priestess) | `public/assets/ui/temple_bg.webp` (1672×941, 434 KB) | Supplied by the director on Nov 19. Who made it and with which tool: **DIRECTOR TO FILL** | **DIRECTOR TO FILL** | Yes (Temple screen background) | Committed because the director supplied it for the game. If an AI image tool made it, list the tool in the AI tools table. |
| Title screen art (title, "Divine Staffing Agency" subtitle, New Game / Continue / Settings / Quit painted in) | `public/assets/ui/title_bg.webp` (1671×941, 339 KB) | Supplied by the director on Nov 19. Who made it and with which tool: **DIRECTOR TO FILL** | **DIRECTOR TO FILL** | Yes (title screen; invisible tap areas over the painted buttons) | The button labels are part of the image, so changing a label means new art. If an AI image tool made it, list the tool in the AI tools table. |
| Hero character sheets: Warrior, Mage, Priestess, Assassin, Barbarian, Summoner (turnaround, faces, weapons, details) | `reports/assets/heroes/<class>_sheet.webp` (1536×1024 each) | Supplied by the director on Nov 19. Who made them and with which tool: **DIRECTOR TO FILL** | **DIRECTOR TO FILL** | Source only | The originals the hero art below is cut from; kept for the pixel sprites still to come. |
| Hero portraits and large illustrations (6 heroes) | `public/assets/heroes/<class>_face.webp` (256×256), `<class>_art.webp` (the sheet's large left illustration, white background removed, about 480–600×1024) | Cut by the orchestrator from the director's character sheets (Nov 19–20) | Same as the sheets: **DIRECTOR TO FILL** | Yes (Temple Heroes screen: portrait grid, large hero frame) | The only edits are crops, a resize and background removal. |
| Party chibi pixel sprites | `public/assets/heroes/<class>_sprite.png` (about 72 px tall) | Warrior, Mage, Priestess, Summoner: cut from the director's sprite reference (`reports/assets/sprite_reference.webp`), background removed, reduced to 72 px and drawn with hard pixels. Assassin and Barbarian: **stand-ins** reduced from their sheet turnarounds, because the reference has no chibi for them | Same as the sources: **DIRECTOR TO FILL** | Yes (Heroes screen party slots) | Replace them with drawn sprites when they exist. The reference's fourth chibi (pale, white hair, dark armour) doesn't match the Assassin sheet, so it isn't used. |
| Enemy sprite sheet: Archer, Brute, Shaman | `reports/assets/enemies/enemy_sheet.webp` (2172×724) | Supplied by the director on Nov 20. Who made it and with which tool: **DIRECTOR TO FILL** | **DIRECTOR TO FILL** | Source only | The original the enemy sprites below are cut from. |
| Enemy pixel sprites: Archer, Brute, Shaman | `public/assets/enemies/<name>_sprite.png` (75, 91 and 80 px tall) | Cut by the orchestrator from the director's sheet (Nov 20): background and enclosed background pockets removed, reduced 7.5× with hard-edged transparency | Same as the sheet: **DIRECTOR TO FILL** | Yes (combat: one still sprite per enemy, moved in code) | The thin bowstring is lost in the reduction. |
| Heroes screen mockup | `reports/assets/heroes_mockup.webp` | Supplied by the director on Nov 19 | Reference only | No | The layout target for the Heroes tab. |
| Pixel sprite reference | `reports/assets/sprite_reference.webp` | Supplied by the director on Nov 19 | **DIRECTOR TO FILL** | Partly (four chibis cut for the party slots) | The style target for the game's sprites. Its UI and names are not used. |
| Load Save Data mockup | `reports/assets/load_save_mockup.webp` | Supplied by the director on Nov 19 | Reference only | No | The layout target for the save-slot screen; its character portraits and slot pictures are not used. |
| Temple menu mockup | `reports/assets/temple_mockup.webp` | Supplied by the director on Nov 19 | Reference only | No | The layout target for the Temple screen. |

## Open items
1. Fill the two **DIRECTOR TO FILL** rows (sprite sheet source and licence, other AI tools).
2. Confirm every row's licence allows distribution inside a packaged game (the music and low-poly packs forbid redistributing the raw files, which a cooked build does not do).
3. Trademark check on the game name before packaging (name and every in-game text: CLAUDE.md "no trademarks or third-party names").
