# Handoff prompt for the Phaser build session

Paste everything below the line into a new session opened in `C:\dev\blessed-company`.

---

You are continuing a project for the director (the user). **Blessed Company** is a goddess-centered hero management sim with incremental RPG progression: the
player is a goddess who sends heroes (Warrior, Mage, Priestess, Assassin; three active slots) into procedurally generated dungeon floors where they fight
automatically. Economy: Faith (permanent, spent in the Temple), Essence (in-run, resets), Gold (small wallet for equipment). A class project with a deadline of about Dec 7.

The game exists as an Unreal Engine 5.7 prototype (formerly named Tower of the Lost) at `C:\dev\tower-of-the-lost`, branch `g6-roster-and-polish` (pushed, unmerged;
main is the g5 economy merge). This repo, `C:\dev\blessed-company` (origin https://github.com/KingsleyArts/blessed-company), has its docs and data, relabelled. Your job is to
build the **Phaser (web) version** by porting the Unreal prototype's rules, not redesigning them.

**Read first, in order:** `docs/PHASER_IMPLEMENTATION_PLAN.md` (the staged plan; follow it), `docs/DESIGN-DECISIONS.md` (sections 9 and 10 are current),
`docs/GODDESS_RPG_PROTOTYPE_CHECKLIST.md`, `docs/GODDESS_RPG_IMPLEMENTATION_PLAN.md`, `docs/GODDESS_RPG_DESIGN_TRANSITION.md`, `README.md`, `CLAUDE.md` (its build commands and
ownership table describe Unreal; update them in Stage 0 with the director's ok). `docs/gdd.md` is the older jam GDD: where it disagrees with DESIGN-DECISIONS, the decisions win.

**Reference code (read-only, never edit it from this session):** `C:\dev\tower-of-the-lost\Source\TowerOfTheLost\Core\` is the porting source (about 6,000 lines of engine-agnostic C++ headers;
`CombatSim.h` is the big one). Its native tests are in `C:\dev\tower-of-the-lost\tests\` (`combat`, `essence`, `floor-generator`, `run`, `stat-resolver-event-bus`, `units/*`)
and are the behaviour spec. The C++ RNG is splitmix64; port it exactly (BigInt) so seeds give identical floors. The tunable values are `data/*.csv` (canonical; `|` separates list items, `-1` means TBD).
UI layout math is in `Source/TowerOfTheLost/UI/Tol*Layout.h` and `Tol*Math.h` with tests in `tests/ui`. Goblin sprites are in the Unreal repo `Assets/Sprites/`; the source and licence are not yet
recorded, so do not publish them until the director fills `reports/assets/register.md`.

**Start with Stage 0 (scaffold) and Stage 1 (core foundations)** from the plan: TypeScript + Vite + Phaser 3 + Vitest, rules in `src/core/` with no Phaser imports, a CSV-to-TS data step, and golden fixtures generated from
the C++ build into `spec-tests/`. Ask the director the open questions in the plan (Phaser 3 vs 4, HUD approach, resolution and mobile) in ONE multiple-choice message, recommended option first, before writing code that depends on them.

**Rules of engagement:**
- The director has final say. Port, do not redesign: any rule difference from the Unreal build is a bug unless the director approves it. Do not invent missing design; ask.
- Work on a branch per stage (e.g. `p1-core`), commit after each working piece, push the branch. **Merge to main only on the director's explicit yes, then delete the branch locally and on origin.**
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- `docs/` is director-owned: propose edits, do not make them silently. Reports go in `reports/` (code review, sim, QA). Record third-party assets and AI tools in `reports/assets/register.md`.
- Verify before claiming done: run the tests and show the result; a stage is done only when its "done when" is met. Report failures plainly.
- No outward or irreversible actions (publishing, deploying, deleting history) without asking. Treat the user's personal information as private.
- Review gate: rule-bearing ports (`src/core`) get a code-review pass (rules + correctness lenses) before merge.

**Open items inherited from the Unreal build (do not decide them yourself):** how the Assassin is obtained (draft: owned from the start); what a floor-2 rescue does when three other heroes are picked
(replace, wait, or guest); Temple gear rows for the Assassin and Priestess; the cast-time soak run was inconclusive (one run in 500 s), so check cast-time behaviour in the Stage 2 parity runs; hurt-cooldown feel and animation timing were never live-played; trademark check for the name.

Finish each turn with a short status: what is done, what is verified, what is blocked, and the one decision you need from the director, if any.
