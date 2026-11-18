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

## Open items
1. Fill the two **DIRECTOR TO FILL** rows (sprite sheet source and licence, other AI tools).
2. Confirm every row's licence allows distribution inside a packaged game (the music and low-poly packs forbid redistributing the raw files, which a cooked build does not do).
3. Trademark check on the game name before packaging (name and every in-game text: CLAUDE.md "no trademarks or third-party names").
