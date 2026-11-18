# Production/Business Analyst — Round 1

## Finding 1 — The must-have list cannot deliver the document's own success target (BLOCKING)

**Problem.** The headline promise is "a judge should finish 2 to 3 runs in about 15 minutes and feel clearly stronger on the last one," and the pacing target is "By run 3, a judge should reach a new floor they couldn't reach before." The Must have list does not support this. It ships 3 floors and 1 boss. The things that make progression visible are all Stretch: the 5th unit unlock (#1), event rooms (#2) and floors 4 and 5 (#3). The meta "Unlocks" track names exactly those three things ("unlock the 5th roster unit, unlock event rooms, unlock floor 4 and 5"). In the minimum shippable build, the Unlocks track has nothing to unlock. "Feel stronger" then rests on flat stat upgrades, which are the least legible kind of progress. The meta layer is one of the two Director's Cut features, yet its most demonstrable content sits below the cut line.

**Source.** "Target play session," "Pacing targets," the "Unlocks" row of the upgrade table, and the "Must have" and "Stretch, in order" lists.

**Related scope gap.** A full clear is "about 20 to 25 rooms" on 5 floors. The must-have build is 3 floors, so roughly 12 to 15 rooms. At 2 to 3 runs in 15 minutes, each fight gets well under a minute, including relic picks and map taps. The doc never reconciles room count, fight length and session length, so the two headline numbers (15 minutes, 2 to 3 runs) are unsupported by any production budget.

## Finding 2 — The document is pitching several games at once, and the positioning is borrowed rather than chosen (MAJOR)

**Problem.** The pitch calls it "FFXIV's deep dungeon mode, rebuilt as an incremental auto-battler." The body then describes a Slay-the-Spire-style node map (rows, branching, rest, elite and event rooms), a party auto-battler with role synergies and aggro and taunt rules, a relic-pick roguelite, an incremental or idle-style meta shop, a "walk the dungeon" homage that explicitly cuts the walkable dungeon, and an HD-2D presentation play. Each of these is a different genre with a different audience.
- The deep-dungeon reference is a niche MMO touchstone. The doc offers no reason a general jam judge will recognize it. The mechanics it does keep (floor-by-floor climb, permanent progression) are generic to the roguelite genre.
- The document names no comparable titles in the auto-battler roguelite space. It says nothing about what this does differently in a crowded 2026 market for that category. Its only differentiators are the theme and the AI workflow.
- The "Director's Cut" theme reading is weak. Procedural generation and meta progression are baseline roguelite expectations, not "ambitious features a jam would normally cut." The doc asserts the framing and never argues it.

**Source.** "Pitch," "Jam facts" (theme row and the two "Director's Cut features"), and the sections on Procedural floors, Meta progression, Narrative and Art.

## Finding 3 — Load-bearing features are under-resourced while decorative ones consume the budget (MAJOR)

**Problem.** The document says the player's only decisions are "the party, the next room, and the relic pick." Its own risk table says the main threat is "Auto combat feels like watching, not playing / Judges disengage." So the load-bearing features are the relic pick, the pathing choice and the meta menu. The relic pick is held to 12 relics, with the "Rare" and "Epic" rule-benders (the only ones that change decisions) pushed to Stretch #6 ("Full 20 relics and 3 rarities"). Meanwhile the document invests heavily in work that adds little to what a judge perceives or decides:
- 4-direction facing with an anti-flicker threshold, and 4-direction animated sprites for 5 units (idle, attack and ability in 4 directions each).
- Niagara VFX, real-time lighting and fog for an "HD-2D look that justifies building in Unreal."
- A seeded-RNG architecture and a dev-only debug panel (a must-have item, "Seeded runs," whose stated purpose is "a debugging tool first").
- A 3-phase final boss, a lore Architect with an open portrait question, and an LLM-voiced Architect (Stretch #7).

The Synergies line, "Show active synergies on the party select screen so judges notice them," is the real engagement hook. It is listed as a unit table column, not as a scoped, must-have system. Cut candidates and keep candidates are not ranked by what a judge sees in 15 minutes.

**Source.** "Core loop," "Auto combat" (formation and facing rules), "Art, animation and audio" (asset counts, VFX), "Technical design" (debug panel), "Risks" table, and the "Scope" lists.

## Finding 4 — No schedule, owner or day-by-day budget for a solo 4-day build with 7 unresolved questions (MAJOR)

**Problem.** The doc names time as "the biggest risk" and notes "Thursday and Friday are work days, so most building happens Saturday and Sunday." It then gives no milestone plan. The Must have list is 8 items. Together they include a seeded procedural generator, a complete real-time combat system with five-role AI, a save system, 7 UMG screens, a content pipeline via PixelLab, and a packaged build. The document leans on "unlimited AI agents" as if it removes the constraint. Integration, debugging, playtesting and asset review remain serial and human, and a solo developer is the bottleneck. The only schedule items are "package nightly" and "backup build Saturday night." Nothing says what must be playable by end of Saturday, or when the cut decisions get made.

The doc is also dated Nov 11, a day before the window opens, and still carries 7 open questions. At least three change scope or art: named characters (lore and portraits), final boss versus endless scaling (a systems commitment), and the LLM Architect "for the LLM NPC category."

**Source.** "Risks and open questions" intro, "Scope," "AI workflow," "Open questions for review," and the date line.

## Finding 5 — Audience and judging criteria are never defined (MINOR)

**Problem.** The audience is implicitly "judges," but the document never states the judging rubric, the categories entered, or what the entry is optimizing for. The only hint is an open question about an "LLM NPC category" in the Open questions list, which suggests multiple categories exist but none is targeted. The Requirement row says only "Declare every asset and tool used in the build." Design decisions such as the "Show active synergies... so judges notice them" note and the "How-to-play panel, 4 lines" are made for judges with no definition of what they reward. It is also unclear whether the project is meant to outlive the jam. Nothing says whether it is a throwaway or a seed for a longer game, which would change whether architecture investments (DataTables, seeds, daily seed) are justified.

**Source.** "Jam facts," "Stretch" (daily seed, LLM Architect), "Open questions" #6.

## Round 2 — Cross-examination

### 1. CONFLICTS

**Against Feasibility Lead Finding 3 (art pipeline is large, should be proven early; BLOCKING-adjacent risk to HD-2D).** Feasibility treats the lit-Paper2D-in-3D prototype as something to prove in the first hours, implying the visual stack is a core commitment to de-risk. My Finding 3 argues the opposite: the 4-direction sprites, Niagara and lighting are decorative relative to what a judge decides, and the right response is to cut or demote them, not to prototype them. De-risking a feature that should be cut spends scarce Saturday hours on the wrong thing. I hold my side, with one concession. The document's only stated reason to be in Unreal is the HD-2D look, so cutting it also removes the engine rationale. That makes it a positioning decision for the designer, not an engineering one, and I would escalate it as such.

**Against Narrative Critic Findings 2 and 3 (sacrifice tone, named characters, Architect characterization).** These ask the document to add lore, a death-message voice and character identity. From a production view, the story is a decorative layer. Narrative Finding 1 is correct that the Architect is never reached in the shippable build, but I would resolve it by cutting the Architect framing down to the intro card and death message. I would not resolve it by adding budget for named characters. Narrative Finding 5, varying the death message by floor reached, is the cheap and correct version, because it uses data the results screen already tracks. I oppose any fix that adds portraits or an LLM voice, and Narrative Finding 4 already argues against the LLM voice on tone grounds.

**Against Systems Designer Finding 5 (gold is a dead currency, MINOR).** Systems rates this minor and wants gold either given a role or deleted. I rate it higher in effect. The currency cleanup is the cheapest scope reduction in the document, and it directly serves my Finding 3 because it removes a counter, an upgrade track entry and a room modifier. I would not give gold an in-run use, since that adds a shop screen to a build that has no schedule.

### 2. CONNECTIONS

**Adversarial QA Finding 3 plus my Findings 1 and 3.** QA lists the dead-upgrade problem mechanically: the Unlocks row holds unbuyable items, the room weights sum to 85 to 90% without events, and rarity-odds upgrades have no Rare or Epic relics to act on. My lens adds the cause. The cut line was drawn by build effort, not by what produces the "feel stronger" moment, so the meta layer was sliced in half. The conclusion neither of us reached alone is that the Stretch order is the wrong order. Unlocks should be rebuilt as the Must-have progression spine, for example floor 4 as a single unlock. The speed toggle, the damage summary and the 5th unit (which Systems and Psychologist both show is needed for party select to be a choice) should be promoted above room modifiers and event rooms. Four reviewers independently landed on the same tier contradiction, so it is the document's central structural defect.

**Systems Designer Finding 2 and Player Psychologist Finding 4 plus my Finding 4.** Both calculate roughly 20 to 30 seconds per room and note that no fight length is specified. My lens adds that this is a production-sizing number, not just a pacing number. If fights are about 15 seconds at 4x, the combat AI, VFX and animation work that surrounds each fight is seen for seconds per room. That shrinks the value of the art budget I flagged in Finding 3. The 4x toggle is therefore load-bearing for the pitch and for art cost. It belongs in Must-have.

**Feasibility Lead Finding 1 plus my Finding 4.** We agree there is no schedule. The combined point is that the "Every risk below has a fallback that keeps the must-have list shippable" claim, which Feasibility calls circular, is also the reason the cut line is not driving decisions. Nobody can know what to cut, because the must-have list is itself unsized. Adding Adversarial QA Finding 4 (crash or abandon forfeits all Essence, and the 3-floor build has an undefined floor 1 and 2 ending) shows the Must-have list also has unwritten items that would grow it further.

### 3. REVISIONS

- **Finding 1: keep BLOCKING, with a narrower claim.** QA and Feasibility confirm the tier contradiction, which strengthens the finding. I would drop my claim that flat stat upgrades are "the least legible kind of progress" as stated. Player Psychologist Finding 5 makes the better version: nothing in the document says how a purchase becomes visible. I defer to that framing.
- **Finding 3: reframe.** Systems and Psychologist show that the party-select synergy display is only a real decision once the 5th unit exists. My claim that synergy display is "the real engagement hook" was too strong for the must-have build. It is the hook only if the 5th unit is promoted. I now state it as a conditional.
- **Finding 4: upgrade from MAJOR to BLOCKING.** Feasibility rates the missing schedule BLOCKING, and QA Finding 4 shows the must-have list is larger than it reads. The document has no mechanism to cut or reorder when Saturday slips. That is the production-level failure the whole board's findings pass through.
- **Finding 5: keep MINOR.** No colleague raised audience or the post-jam intent of the project. I still consider it a real gap, but it is lower priority than every structural finding above.
- **Finding 2: unchanged, MAJOR.** No colleague engaged with market positioning or the multi-genre problem. I note that Narrative Finding 4's tone conflict (quiet and ominous against a 4x toggle and floating numbers) is a second symptom of the same cause, which is that the document does not choose one identity.
