# Goddess RPG Implementation Plan (for approval)

Written Nov 16, 2026 from a code inspection of branch `g4-temple`. No gameplay code, assets, settings or save formats were changed while writing this plan. Companion files: `GODDESS_RPG_PROTOTYPE_CHECKLIST.md`, `GODDESS_RPG_DESIGN_TRANSITION.md`.

Scope clock: about three weeks, Nov 16 to about Dec 7, 2026. Estimates below are working days of AI-assisted work with the director testing; they are estimates, not measurements.

## A. Current architecture (what exists)

| Area | Where it lives | Notes |
|---|---|---|
| Hero data and stats | `data/ClassData.csv`, `Core/ClassData.h`, `Core/datatable_structs.h`, `Core/StatResolver.h` | Six classes exist in data and code: Warrior, Priest, Assassin, Barbarian, Summoner, Mage. |
| Party composition | `Core/RunFlow.h` `Start(seed, priestUnlocked, startFloor)`, `Run/RunManager.cpp` | The run takes a party list, but nothing lets the player choose it. Today it is Warrior + Mage, plus the Priest via the floor-2 rescue. |
| Combat | `Core/CombatSim.h` (engine-agnostic sim), `Combat/CombatManager.*` (Unreal actor), `Units/TolUnit.*` | Automatic; threat, abilities, summons, heals, enemy scaling (`enemyStatMult`, `floorScaling`). Event bus in `Core/EventBus.h`, hooks listed in `docs/COMBAT-HOOKS.md`. |
| Dungeon progression | `Core/FloorGenerator.*`, `Core/RunFlow.h`, `Core/RunMapView.h`, `UI/TolRoomView.*` | Rooms, doors, quota, crystal, rescue floor, tutorial floor, boss. |
| Temple upgrades | `Core/Temple.h`, `Core/GearApply.h`, `UI/TolTempleLayout.h`, `TolHud.cpp` `DrawTempleOverlay` | Stat ranks, gear levels, Party Luck, stat unlocks, all bought with the permanent currency. |
| In-run currency | `Core/RunConfig.h` (`essencePerKill`, `essencePerRoom`), `Core/EssenceSidebar.h`, `Core/EssenceConfig.h`, `Core/EssenceApply.h` | Code name `essence`. Shown to the player as **Gold** since the Nov 14 swap. Resets every run. |
| Permanent currency | `Core/MetaSave.h` `gold`, payouts `goldCombat/Elite/Boss/Treasure` in `Core/RunConfig.h` | Code name `gold`. Shown to the player as **Essence**. Persisting (when saving is on). |
| Faith | none | No match in the source. |
| Miracle Gauge | none | No match in the source. |
| Save and load | `Core/MetaSave.h` (text serializer, `TolMeta=1`), `Meta/TolMetaStore.*` writes `Saved/TolMeta.sav` | Works and is tested, but **disabled** by `kPersistMeta=false` in `Run/RunManager.cpp` (director order: start from zero). |
| Run results | `Core/RunFlow.h` `Results`, `Run/TolRunTypes.h` `FTolRunResults`, `UI/TolEssenceLayout.h` `FormatResultLines` | Floor, cause, best floor, in-run currency lost, permanent currency earned. |
| UI | `UI/TolHud.*`, `TolHudLayout.h`, `TolEssenceLayout.h`, `TolTempleLayout.h`, `TolMapLayout.h` | Canvas HUD (AHUD, not UMG), layout math in tested headers. |
| Tests | `tests/*` (14 native suites), headless `tol.AutoRun` soaks | |

Size: about 13,300 lines across `Source/BlessedCompany/*/*.{h,cpp}`.

### Differences from the handoff's reported status

- Reported "Warrior, Mage, Priestess": true, and three more heroes (Assassin, Barbarian, Summoner) are implemented and tested. Only party selection is missing.
- Reported "Save and load": built, but turned off.
- Reported "Gold-based immediate stat upgrades": true in effect, but the code calls that currency `essence`.
- Reported "Results show Gold and Faith": the card shows in-run currency lost and permanent currency earned; there is no Faith.
- Reported "Priestess": she is a floor-2 rescue, and the unlock does not carry between runs while saving is off.

## B. Reuse assessment

| System | Verdict | Reason |
|---|---|---|
| Combat sim, threat, abilities | Reuse unchanged | Verified by tests; the Miracle Gauge only listens to events. |
| Floor generator, room walk, minimap | Reuse unchanged | Tuned and tested this week. |
| Auto navigation, speed and pause | Reuse unchanged | |
| Hero classes (six) | Reuse unchanged | Enough content for the party feature; no need to add heroes. |
| In-run sidebar upgrades | Reuse unchanged (labels only) | They already behave as proposed Essence: temporary, per hero, reset each run. |
| Temple stat ranks, Party Luck | Extend | Become Faith blessings; need names, descriptions, remove Gold-income luck. |
| Temple gear levels | Refactor minimally | Re-point from permanent currency to Gold; later give items a name. |
| MetaSave and TolMetaStore | Extend | Add Faith, Gold, roster, active party, equipment; bump `kMetaVersion`. |
| Results card | Extend | Add Faith, Gold, XP lines. |
| Temple screen | Extend | Add party panel and equipment panel to the existing overlay. |
| Priest rescue event | Refactor minimally or defer | Depends on decision P3. |
| Miracle Gauge and miracles | Implement new | |
| Party selection and roster | Implement new | |
| Equipment items and inventory | Implement new (small) | Fixed items only. |
| Hero XP and levels | Implement new, P1 | Cut first if behind. |
| Durability, repairs, crafting, affixes | Defer | Death-spiral risk and no time. |
| Mage projectile visual, sprites, UMG | Defer | Presentation; the canvas HUD can take textures. |

## C. Economy

### Existing facts

- In-run: `essence`, earned per kill (5) and per cleared room (10), spent on the sidebar. Shown as "Gold". Reset each run. Unspent amount discarded.
- Permanent: `MetaSave::gold`, earned per cleared room by type (10/25/50, treasure 15), kept even after a wipe or abandon. Shown as "Essence". Spent in the Temple on stat ranks, gear levels (cap 5, costs 150 to 2,400), stat unlocks (300), and Party Luck (EssencePerKill, EssencePerRoom, GoldPerKill, GoldPerRoom).
- Save: `gold`, `priestUnlocked`, `bestFloor`, `unlockedStats`, `gearLevels`, `partyLuck`, `statLevels`, settings. Not currently written.
- UI that shows currencies: HUD top bar, sidebar header, buy buttons, Temple overlay header and rows, run-over card, gear toast.

The proposed words are the opposite of today's labels: the proposal's **Essence** is today's in-run currency, and the proposal's **Faith** is today's permanent currency. That makes Option B cheaper than it sounds for two of the three currencies.

### Comparison

| | A: Keep as is | B: Faith + Essence + Gold | C: Simplified (recommended for the class) |
|---|---|---|---|
| Definition | In-run + permanent, two names swapped | Three currencies, full roles | Faith (= today's permanent) + Essence (= today's in-run) + a small Gold wallet used only for equipment |
| Gameplay clarity | Good | Good if taught; three numbers to learn | Good: Gold only appears in the equipment shop |
| Management depth | Low | High | Medium |
| Theme | Weak: no goddess/mortal split | Strong | Strong: Faith is divine, Gold is the heroes' |
| Dev complexity | None | High | Medium |
| Reuse | All | Most | Most |
| UI change | None | Large | Medium: relabel, one new wallet, one shop |
| Save migration | None | `gold` splits into Faith/Gold; version bump | Same, but only one new field |
| Balance difficulty | Done | Hard: three payout tables | Moderate: one new payout table |
| Class-deadline risk | Lowest | High | Moderate |

Required questions, answered for Option C:

1. Existing Gold mechanics to move to Essence: none change behaviour; the in-run sidebar is already the proposed Essence. Labels only.
2. Existing Essence code reusable: the permanent-currency plumbing (payouts, MetaSave, Temple purchases) becomes Faith.
3. Gold persists between expeditions: yes, a wallet in `MetaSave`.
4. Gold is earned during the expedition (kills, Treasure rooms, bosses) and banked on return, kept even after a wipe at a reduced rate (suggest 50 percent of what was collected).
5. Temporary upgrades reset every run: yes (already true).
6. Keeping Essence from duplicating Faith: Faith buys flat permanent percentages and the miracle capacity; Essence buys the same stats temporarily and scales by rank within a run. Also keep unspent Essence discarded, so it never converts into permanent power. Keep the existing rank-based design so Faith ranks raise the starting point.
7. Gold sinks: weapon and armor purchases are enough for a prototype (two slots times three heroes plus reserves). Do not add upkeep.
8. Durability: defer. Use a one-time purchase and an upgrade level instead.
9. Temple and Run Over: Temple gets a Faith tab (blessings) and a Gold tab (equipment); results show Faith, Gold, Essence lost.
10. Existing saves: none that matter (saving is off and the director wants a start from zero). Add `kMetaVersion = 2`; a v1 file maps `gold` to `faith`, and `gearLevels` is ignored.

Rule to enforce: remove the **GoldPerKill/GoldPerRoom** Party Luck lines from the Temple, or no divine purchase may raise Gold income. This is what keeps the "goddess cannot create Gold" idea true.

**Recommendation.** Class prototype: Option C. Long term: Option B, which is C plus repair costs, shops and recruitment fees. Nothing in C blocks B.

## D. Phases (dependency order)

| Phase | Content | Depends on |
|---|---|---|
| 0 | Verify and merge the current branch; run the review gate on Nov 14-16 changes; re-enable and test saving behind a flag | director yes |
| 1 | Economy decision, relabel (Faith, Essence), `MetaSave` v2 with Faith and Gold fields | approval |
| 2 | Faith blessings catalog and Temple rewording, Faith payouts and failure partial rewards | 1 |
| 3 | Miracle Gauge core (Core), gauge fill from events, Divine Healing and Divine Shield, HUD gauge and buttons | none (can start with 1) |
| 4 | Roster and party selection (4 heroes, 3 slots), persistence, Priestess decision | 1 |
| 5 | Gold wallet, payouts, equipment items, inventory, shop | 1, 4 |
| 6 | Loop validation against the 12-step Definition of Done, soak, balance | 2, 3, 4, 5 |
| 7 | Optional: hero XP, extra hero in the roster, art | 6 |
| 8 | Title rename, packaging, video, documentation | title approval |

Phases 2, 3 and 4 touch different files and can run in parallel after Phase 1 lands. Phase 5 follows 4 because equipment is per hero.

## E. Three-week schedule

Estimates are focused work days.

**Week 1 (Nov 16-22): foundation and the two big new systems**
- Day 1: approvals (economy, scope, Priestess, name). Merge `g4-temple` after review. 0.5 day review, 0.5 day merge/verify.
- Days 2-3: Phase 1: relabel, `MetaSave` v2, Faith and Gold fields, migration test, save re-enabled behind a flag. Acceptance: 14 suites plus new migration test pass; save, quit, relaunch restores values.
- Days 2-5 (parallel agent): Phase 3 Core: `Core/MiracleGauge.h`, miracles in `CombatSim` through the event bus, tests. Acceptance: tests for fill, cap, spend, reset, heal and shield edge cases.
- Checkpoint Fri: build both targets, headless run, director plays one run.

**Week 2 (Nov 23-29): management loop**
- Phase 3 UI: gauge bar, two miracle buttons, feedback. 2 days.
- Phase 2: blessing names and Temple relabel, Faith milestone payouts. 2 days.
- Phase 4: roster, party picker, active-slot persistence. 3 days.
- Phase 5 start: Gold wallet and payouts. 2 days.
- Checkpoint Fri: complete loop with party choice and miracles; soak with 3-hero parties.

**Week 3 (Nov 30-Dec 6): equipment, polish, ship**
- Phase 5: fixed equipment, inventory, shop. 3 days.
- Phase 6: balance and loop validation, manual playtest script, bug fixing. 2 days.
- Phase 8: rename after approval, package, clean-launch test, video, write-up. 2 days.
- Last day is reserved for the submission only; no features.

**Scope cuts if behind (in order):** hero XP and levels; equipment inventory (keep only buying a level of weapon/armor, which exists); Priestess decision stays as the rescue; Divine Shield (keep Divine Healing); recruitment of a fourth hero (give all four at start); title rename (ship under a working title).

Risks per milestone are in section G.

## F. AI-agent strategy

Reuse the roles already defined in `CLAUDE.md` and `.claude/agents/`; add none. Mapping to the roles in the handoff:

| Role | Existing agent | Responsibility | Allowed areas | Deliverable | Validation |
|---|---|---|---|---|---|
| Project manager | orchestrator (this session) | Gate tracking, checklist upkeep, escalations | `docs/` planning files only | updated checklist each day | the checklist matches the code |
| Game designer | data-designer + director | Blessing list, miracle numbers, equipment data | `data/*.csv` | CSVs and a short decision log | values in tests; director approves values |
| Gameplay engineer (Core) | combat-programmer, run-programmer | Gauge, miracles, wallet, roster, `MetaSave` v2 | `Core/`, `Combat/`, `Run/`, `Meta/`, `tests/` | systems with native tests | native suites, UBT build, headless run |
| UI engineer | ui-programmer (one per screen) | Gauge HUD, party picker, Temple tabs, results card | `UI/` | screens | `tol.Shot` screenshot, layout tests |
| QA | qa-tester, sim-balancer | Playtest script, soaks | `tests/rules`, `sim/`, `reports/` | pass/fail report per phase | soak numbers, 12-step script |
| Reviewer | code-reviewer | Review gate for Core/Run/Meta | `reports/code-review/` | findings | no BLOCKING or MAJOR |

Parallel-safe: gauge Core work (combat-programmer) with the save migration (run-programmer) once the shared types are agreed; Temple relabel (ui-programmer) with the party picker (a different screen). Not parallel: anything that edits `Core/RunFlow.h`, `Core/MetaSave.h` or `Core/CombatSim.h` at the same time as another agent. One agent drives the Unreal editor at a time, and the director closes the editor before each build.

Every phase ends with: native suites, both UBT builds, a headless instant run, and a screenshot or manual playthrough of the changed behavior.

## G. Five largest risks

1. **The economy decision drags on.** Mitigation: approve Option C on day 1; relabel first because it is cheap; defer Gold shop to Phase 5.
2. **Party selection and saving touch shared files (`RunFlow`, `MetaSave`, Temple).** Mitigation: one agent owns those files; `MetaSave` v2 lands before anything else is built on it.
3. **Miracle Gauge feels wrong when real combat speed, pause and 10x speed interact.** Mitigation: define the gauge in sim time, not frame time; tests at all speeds; keep two miracles.
4. **Balance is moving again (new payouts, four heroes, miracles) after the difficulty was just tuned.** Mitigation: freeze enemy numbers (`tol.EnemyMult` 1.3, floor scaling 1.25); retune only miracle fill and Faith costs; use the soak after each phase.
5. **Time lost to builds, locked DLLs, and the single-editor rule.** Mitigation: batch UBT builds; the director closes the editor at fixed checkpoints; native tests carry most verification.

Deferred for risk: durability and repairs, crafting and affixes, hero XP (P1, first to cut), sprites and projectile art, UMG, extra miracles, the 100-floor mode.

## H. Definition of done

The 12 steps in the handoff, each with its check:

1. Enter the Temple: opens on the Temple (done).
2. Review and prepare the party: party picker and hero panel (Phase 4).
3. Start an expedition (done).
4. Heroes fight automatically (done).
5. Earn and spend Essence on temporary upgrades (done; relabel).
6. Use the Miracle Gauge (Phase 3).
7. Complete or fail an expedition (done; boss and victory screen need a check).
8. Persistent rewards: Faith and Gold banked (Phases 1, 5).
9. Buy permanent blessings with Faith (Phase 2).
10. Gold buys equipment (Phase 5).
11. Next expedition is measurably stronger (Phase 6 soak).
12. Save, exit, resume (Phase 1 flag on, verified).

The build compiles, launches, and the loop runs without critical errors, checked by a written manual script and the headless soak.

## Decisions requested

1. Economy: Option C for the class build, Option B as the long-term target.
2. Priestess: keep the floor-2 rescue (unlock persists) or make her a starting hero (see Transition doc section 10).
3. Party size: 4 owned heroes (suggest Warrior, Mage, Priestess, Assassin), 3 active slots.
4. Scope: confirm the cut order in section E.
5. Name: choose a title (Transition doc section 11).
6. Merge `g4-temple` to main first.
