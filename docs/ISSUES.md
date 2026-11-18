# GDD Issue List

Consolidated from the six reviews and the Round 3 synthesis. Severities are the final ones after Round 2 revisions. Source tags: SD = Systems Designer, NC = Narrative Critic, PP = Player Psychologist, FL = Feasibility Lead, QA = Adversarial QA, BA = Business Analyst. Fix directions are the reviewers' own suggestions; "Decision" marks items where the board disagreed and the designer must choose (see SYNTHESIS.md section 2).

## BLOCKING

- [ ] **GDD-01 — Must-have tier contradicts the design.** 4 units for 4 slots (no party choice, synergies always on, "no healer" boss check can't fire); Unlocks track holds only Stretch content (5th unit, event rooms, floors 4–5); "new floor by run 3" unreachable in a 3-floor build; Architect and final boss are Stretch. *Sources:* BA F1, FL F2, QA F3, SD F3, PP F1/F5, NC F1. *Fix direction:* re-specify the must-have build so its loop holds together (BA: promote Unlocks, 4x toggle and 5th unit above room modifiers and event rooms). **Decision B.**
- [ ] **GDD-02 — No schedule, cut order or sizing for a solo 4-day build.** Thursday/Friday lost to work; "fallbacks keep must-have shippable" is circular; 7 open questions still open. *Sources:* FL F1, BA F4. *Fix direction:* day-by-day milestones, a freeze point for stretch work, and an explicit ranked cut order.
- [ ] **GDD-03 — Fights have no end condition besides a wipe (stalemate softlock).** Enemy Shaman heals and Warden shields vs. party Healer/Tank shield/Support haste; no enrage, round cap, or player input. *Sources:* QA F1; extended by SD, FL, NC. *Fix direction:* enrage multiplier or hard fight timer (NC: on-theme "the tower closes in"); FL: headless soak test in the nightly build.
- [ ] **GDD-04 — Economy has no numbers.** No gold per room, gold-to-Essence rate, boss/elite bonuses, rank cost curve, unit/enemy stats, upgrade magnitudes, or fight length; "average run" undefined. *Sources:* SD F1, QA F5, PP F4, BA F1. *Fix direction:* author the DataTable values; FL notes this otherwise lands on the human during integration weekend.
- [ ] **GDD-05 — Player is never told why they lost.** Results screen shows only floor, Essence, seed; wipe discards the run; post-fight summary, ability callouts and speed toggle are Stretch; at ~20 s/room they cannot be optional. *Sources:* PP F3 (+F4 merged, raised to BLOCKING), FL and NC connections. *Fix direction:* cause-of-death on the results screen and the post-fight summary in must-have. **Decision D** (explanation vs. story priority on the death screen).
- [ ] **GDD-06 — Architect payoff unreachable in the shippable build.** Must-have stops at 3 floors and 1 boss; Architect appears only at the Stretch final boss; a judge sees a title card and a death message. *Sources:* NC F1. *Fix direction:* NC: move one Architect beat into floors 1–3 and the hub (e.g. a hub line that changes with run number). **Decision C.**

## MAJOR

- [ ] **GDD-07 — 15-minute / 2–3-run budget doesn't close.** ~15 rooms per run, ~20–30 s per room, no fight-length target, 4x toggle is Stretch. Run 3 (the one that must show strength) is the longest and has the least time. *Sources:* SD F2, PP F4, QA F5, FL F2, BA F1. *Fix direction:* set a fight-length target and compute the budget per run, using a worst-case from GDD-03.
- [ ] **GDD-08 — Run end states undefined in a 3-floor, 1-boss build.** Floors 1–2 have no boss, so "clearing a floor's boss loads the next map" has nothing to fire; "full clear" has no trigger. *Sources:* QA F4, FL R2. *Fix direction:* define what ends each floor and the run.
- [ ] **GDD-09 — Mid-run exit loses all payout.** Gold converts to Essence only on the results screen; a crash, quit, or the judging window expiring pays nothing, contradicting "every run pays out". No abandon control, no mid-run save, "continue" undefined. *Sources:* QA F4, PP R2. *Fix direction:* mid-run Essence credit, or a safe exit with partial gold. Overlaps **Decision E**.
- [ ] **GDD-10 — Wipe rule contradicts the Epic revive relic.** "A wipe ends the run" vs. "first wipe each run revives the tank at 30% HP"; the revive needs bespoke Combat Manager hooks and ordering is unspecified. *Sources:* QA F4, FL F4 (R2 connection). *Fix direction:* state whether the wipe check runs before or after the revive.
- [ ] **GDD-11 — Unit death and HP carry-over undefined.** Does a dead unit stay dead, revive, or return at 1 HP? Does Rest revive? Do cooldowns/buffs carry? Role-specific Rare relics can be offered for roles not in the party. *Sources:* SD F4, QA F2. *Fix direction:* specify carry-over rules; filter relic offers to the current party.
- [ ] **GDD-12 — Difficulty curve and map risk/reward are undesigned.** Flat meta upgrades and relics vs. +20%/floor enemy scaling never compared; Elite has no quantified reward vs. Treasure or Rest. *Sources:* SD F4. PP F2 adds the UI side: room icons need to show risk (pack size/enemy type), not just better payouts. *Fix direction:* balance pass plus room-icon information.
- [ ] **GDD-13 — Player agency is thin.** Only decisions are party, room, relic pick; relics are mostly flat stat boosts; the rule-bending Rare/Epic relics are Stretch; the relic pick is the most frequent input and gets the least design. *Sources:* PP F2, BA F3 (connected in PP R2). *Fix direction:* pull some rule-bender relics into must-have.
- [ ] **GDD-14 — Meta progression may not be perceptible.** Flat stat upgrades on a fight the player only watches; nothing shows a purchase working; no novelty beat between runs in the must-have build. *Sources:* PP F5. *Fix direction:* make purchases visible (e.g. survived-hits or before/after numbers).
- [ ] **GDD-15 — Onboarding is 4 lines and the one lesson is impossible to act on.** Nothing explains roles, relic pick, or room icons; the Shaman "teaches focus fire" but the player can't focus fire and targeting rules never mention healers. *Sources:* PP minor note (raised to MAJOR), QA F1 related contradiction.
- [ ] **GDD-16 — Seeded runs can't deliver "same seed, same floors".** One shared stream with real-time combat, crits, and a speed toggle; no seed-entry screen, so the must-have "Seeded runs" is untestable. QA rates MAJOR, FL rates MINOR (agrees it's a MAJOR spec defect). *Sources:* QA F2, FL F5. *Fix direction:* derived stream per floor for the map; add seed entry or drop the replay claim. **Decision F.**
- [ ] **GDD-17 — Art/visual pipeline is large, unbudgeted and unproven.** Lit Paper2D sprites in 3D, 4-direction flipbooks with facing threshold, PixelLab MCP, ~30 icons, 3 arenas, Niagara; hand-fixing drift is manual labor. *Sources:* FL F3, BA F3. *Fix direction:* prove in the first hours, or cut. **Decision A.**
- [ ] **GDD-18 — "Data-driven, no logic changes" claim is false for relics, abilities, bosses.** Rule-bender relics, cross-unit synergies, phase triggers and taunt/execute/piercing/shield need bespoke code; the Combat Manager hub is one agent's work; uassets can't be merged; no test step for MCP output. *Sources:* FL F4. *Fix direction:* design the combat hook interface before content work.
- [ ] **GDD-19 — Document pitches several games at once.** Deep-dungeon homage, StS node map, auto-battler, incremental shop, HD-2D; no comparables or differentiation; "Director's Cut" theme reading is asserted, not argued. *Sources:* BA F2.
- [ ] **GDD-20 — Story and mechanics point opposite ways.** "Failed runs feed the tower" vs. upgrades that make the tower easier; the Architect's static one-line-per-floor can't carry the moral argument or escalate across runs. *Sources:* NC F2, F4. *Fix direction:* reconcile in the fiction (NC: name the gold conversion as what the tower takes and gives back). Overlaps **Decision E**.
- [ ] **GDD-21 — Death message is the only guaranteed story beat.** One repeated message reads as a failure screen; no variation by floor, run number, or fallen unit though the results screen tracks them. *Sources:* NC F5 (raised to MAJOR), BA R2. **Decision D.**
- [ ] **GDD-22 — Economy stacking is unbounded.** "+Essence per run", "+gold per room" and the double-gold modifier multiply one stream with no cap or cost curve. *Sources:* SD F5 (raised to MAJOR), QA F5.
- [ ] **GDD-23 — Room-type and weight gaps.** Must-have lists 4 room types while weights tune 5; Event weights of 10–15% leave 85–90% with no renormalization rule; the Warden is elite-only; the 5th unit is never named (which role is locked changes whether the base party has Healer/Support). *Sources:* FL F2, QA F3.

## MINOR

- [ ] **GDD-24 — Gold is a dead currency.** No in-run use. **Decision E.** *Sources:* SD F5, NC R2, BA R2.
- [ ] **GDD-25 — Party identity undecided.** Named characters vs. generic classes; NC downgraded to MINOR conditional on choosing "generic classes", and would restore MAJOR if both options stay open. *Sources:* NC F3.
- [ ] **GDD-26 — Architect presentation inconsistent.** Portrait/model/text-only is open, no Architect asset in the art list, casting "undecided", and the LLM-voiced Architect (Stretch 7) conflicts with "written in advance" and the calm-and-certain tone. NC and BA both want the LLM voice dropped. *Sources:* NC F4, BA F3.
- [ ] **GDD-27 — Reset-progress button has no confirmation or backup.** One misclick on a projector wipes the demo. *Sources:* QA F4.
- [ ] **GDD-28 — Debug-panel fallback is unavailable in the packaged build.** The risks table's "debug grant" fallback is dev-builds-only. *Sources:* QA F5. FL proposes promoting the debug panel; BA calls it decorative. **Decision A.**
- [ ] **GDD-29 — Relic pool/reroll gaps.** 12 relics with ~15 picks per run (repeat offers, pool replacement unstated); the "1 free reroll" upgrade has no reroll button in the Relic pick spec; rarity-odds upgrades have nothing to act on in must-have. *Sources:* QA F3, F5.
- [ ] **GDD-30 — Audience and judging criteria undefined.** No rubric, categories targeted, or post-jam intent. *Sources:* BA F5.
- [ ] **GDD-31 — Tone vs. presentation.** "Quiet and ominous" tone vs. floating numbers, 4x speed and HD-2D flourish. NC withdrew the 4x complaint in Round 2. *Sources:* NC F4, BA R2.
- [ ] **GDD-32 — "Highest-threat" targeting is undefined.** *Sources:* QA F1.
- [ ] **GDD-33 — Run-start relic upgrade duplicates the in-run Common relic.** *Sources:* SD F5.

## Quick wins (cheap fixes from Round 3)

1. GDD-03 — add an enrage/fight timer.
2. GDD-05 / GDD-21 — death screen shows cause of death and varies by floor reached.
3. GDD-16 — derive a separate seeded stream per floor; add seed entry or drop the replay claim.

## Decisions for the designer (unresolved board disagreements)

A. HD-2D art stack: cut (BA) vs. prove early (FL); keep seeded RNG/debug panel (FL, SD) vs. cut (BA).
B. Tier fix: promote content into must-have (BA) vs. must-have already too large (FL).
C. Story scope: keep an Architect beat in floors 1–3/hub (NC) vs. cut to intro card and death message (BA).
D. Death screen: vary by floor/run (NC, BA) vs. cause of death first (PP).
E. Gold: give a role or delete (SD), delete (BA), keep and name in fiction (NC).
F. Seed determinism severity and promise: "same map" vs. "same run" (QA vs. FL).
