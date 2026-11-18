# Technical Feasibility Lead — Round 1

## Finding 1 — No schedule: the must-have list is sized for a team, and Thursday and Friday are lost (BLOCKING)

**Problem:** The must-have list is a complete game for one person in four days, and the GDD never converts it into hours or day-by-day milestones.

**Evidence:**
- The Jam facts say "Solo (1 human)" with a window of Nov 12 to Nov 15.
- Risks says "Thursday and Friday are work days, so most building happens Saturday and Sunday."
- Must have includes auto combat with 4 roles, a procedural map, a boss, 12 relics, 10 upgrades plus SaveGame, 7 UMG screens, seeded runs, and a packaged build with an asset declaration.
- The same document commits to a PixelLab sprite pipeline, Niagara VFX, 3 arenas and audio.
- The only schedule content is "Package a test build each night" and "submit a backup build Saturday night."
- There is no ordering of systems, no day-by-day target, and no point at which stretch work is frozen.

**Why it matters:** The claim "Every risk below has a fallback that keeps the must-have list shippable" is circular. Most fallbacks shrink art or polish. None shrinks the must-have systems. The "Cut from the jam" list removes only things that were never planned. If Saturday slips, nothing in the document says what leaves the must-have list. "Unlimited AI agents" does not remove the serial bottlenecks: one human reviews, integrates, playtests and packages.

## Finding 2 — Must-have and stretch tiers contradict the design they are supposed to support (MAJOR)

**Problem:** Core features depend on items the Scope section lists as stretch, so the must-have build will not behave as the design describes.

**Evidence:**
- Party select is "4 slots picked from a jam roster of 5 units." The 5th unit is stretch item 1, and must-have has "4 party roles." The party select screen therefore offers no choice, and the "Five units gives real choice" rationale does not hold.
- The synergy hook for Healer and Melee DPS depends on the Support and Tank pairings, so the synergy display on party select cannot be fully shown in must-have.
- The Unlocks track is "unlock the 5th roster unit, unlock event rooms, unlock floor 4 and 5," and all three are stretch.
- Pacing target: "By run 3, a judge should reach a new floor they couldn't reach before." Must-have is 3 floors, and floors 4 and 5 are stretch. The floor-unlock progression is not in the shippable build.
- The Target play session is 2 to 3 runs in about 15 minutes. The Risks fallback for "feels like watching" is "the speed toggle." Stretch item 5 is the 4x toggle, and nothing says whether 1x and 2x are must-have. A 3-floor run is about 15 rooms, so 3 runs is about 45 fights in 15 minutes. That is under 20 seconds per fight including relic picks, and the document never computes this.
- Must have says "4 room types" while Elite and Rest are tuned in weights tables for 5 types. The Warden is "elite rooms only," so the 6-enemy list is only partly reachable.

**Why it matters:** The minimum build must be re-specified so its meta and run structure still hold together. Otherwise whatever gets cut under pressure leaves holes in the core loop.

## Finding 3 — Art and visual pipeline is large, unbudgeted, and rests on a legacy and unproven tech path (MAJOR)

**Problem:** The visual plan exceeds what one person can verify in the window, and none of it is tied to the must-have or stretch tiers.

**Evidence:**
- Asset counts: 5 units with idle, attack and ability in 4 directions plus hit and death. 6 enemies with idle and attack in 4 directions plus hit and death. 2 bosses with 5 animation states. About 30 icons. 3 arenas. Shared Niagara VFX. 3 audio tracks plus UI and hit sounds.
- The look is "Real-time lighting, fog and Niagara VFX give an HD-2D look that justifies building in Unreal." That is a commitment to lit Paper2D sprites in a 3D scene. The GDD never says how sprites receive lighting, how mirrored left-facing flipbooks work with it, or how the 4-direction facing "with a small threshold" is swapped in the flipbook.
- The pipeline imports as "Paper2D flipbooks," and nothing in the Technical design section scopes that integration. The Unit is "One base Blueprint with a Paper2D flipbook."
- The only mitigation is "role-colored placeholder sprite ships" and "Gameplay comes first," so art effort sits outside the must-have list entirely.
- The pipeline runs through PixelLab's MCP server, which is a second unproven agent integration.
- Drift between directions is a listed risk, yet "hand-fix or regenerate drifted frames" is manual labor from the same one human.

**Why it matters:** A lit-sprite-in-3D prototype should be proven in the first hours, not assumed. If it fails, the HD-2D justification for using Unreal disappears and the fallback is placeholders in the visual centerpiece.

## Finding 4 — "Data-driven, no logic changes" is contradicted by the relic, ability and boss design (MAJOR)

**Problem:** The claim that agents can add content through DataTables alone does not hold for most of the content that makes up the game.

**Evidence:**
- Technical design says "units, enemies, relics, upgrades and room weights all live in DataTables, so agents can add content without touching logic."
- Epic relics are "rule-benders (the first party wipe each run revives the tank at 30% HP)." Rare relics are role-specific changes ("healer's group heal also cleanses"). Each needs bespoke combat hooks and cannot be a flat stat row.
- Five signature abilities each have conditions and cooldowns. Synergies cross units ("Overheal becomes a shield," "Crits refund cooldown," "Haste also speeds healer cooldowns"). These interact through the Combat Manager.
- Bosses have phase triggers and summons. The final boss has "an attack that punishes parties with no healer."
- "Enemy reuses the same AI as a party role, so no new combat logic is needed" ignores that taunt, execute, piercing, shields and haste all need implementations anyway.
- The AI workflow is "One agent per system, working from this GDD, with a short spec per system." The Combat Manager is the hub touching Unit, Loot, Run Manager, meta stats and relics, so the "one agent per system" split puts the highest-coupling system in one agent's hands with every other system depending on its interface.
- The rollback story is "Commit to version control after each working system." Blueprint and DataTable assets are binary uassets, so concurrent agents cannot merge and a bad change can only be reverted whole. The document names no repository, ignore rules or checkpoint discipline.
- Nothing describes a test or validation step for Unreal MCP output beyond the human playing it.

**Why it matters:** The cost of relics, abilities and bosses is therefore understated, and the combat hook interface needs design before content work starts.

## Finding 5 — Seed determinism claim conflicts with real-time combat and the speed toggle (MINOR)

**Problem:** The seed guarantee as written cannot be met cheaply, and the GDD does not say which behavior it actually promises.

**Evidence:**
- "All randomness goes through one seeded random stream so seeds replay exactly."
- "Same seed, same floors."
- Combat is "fully automatic and real-time with attack timers," with crits, per-room pack and modifier rolls, relic rolls and the 1x/2x/4x speed toggle.
- Draws from a single stream during real-time combat depend on tick order and frame timing. Relic and room-reward draws then shift after any variation in how many crit rolls occurred.

**Why it matters:** Seeds are described as "a debugging tool first," but a single shared stream makes floors unreproducible unless generation uses its own stream, as the floor map is rolled up front from the seed. The GDD needs to say whether it means "same map" (cheap, separate stream) or "same run" (not feasible with real-time combat), and which one the must-have "Seeded runs" item delivers.

## Round 2 — Cross-examination

### Conflicts

**Business Analyst, Finding 3 (seeded RNG and debug panel are "decorative" and should be cut).** I disagree on the technical side. The BA groups the seeded-RNG architecture and the debug panel with facing thresholds and Niagara VFX as work that adds little. They are not the same kind of cost. A separate map-generation stream and a debug grant are each an hour or less of work, and they are the only tools a solo developer has for reproducing a bad run and for testing the Essence pacing the Systems Designer says is unquantified. The facing threshold, 4-direction sprites and lit-sprite pipeline are where the real hours go, and I agree with the BA that those are the cut candidates (my Finding 3). Cut the art, keep the debug panel. I would go further than the BA and say the debug panel should be promoted, since it is the only way to run a 15-minute session check without playing 15 minutes.

**QA, Finding 2 (seeds, severity MAJOR) versus my MINOR.** QA is right on two things I missed. First, there is no seed-entry control in any of the 7 UI screens, so "Seeded runs" as a must-have item cannot be exercised by a judge or by me. Second, I assumed the whole floor map is "rolled up front," but the GDD only says the Floor Generator "builds the node map from the seed" and that clearing a boss "loads the next floor's map." That is ambiguous, and if floor 2 is generated after floor 1 combat, QA's reading holds and later floors do drift. I concede my premise was unsupported. I still hold MINOR on cost, because the fix is one derived stream per floor and takes minutes. I would raise it to MAJOR only as a spec defect, not as a build risk.

### Connections

**QA Finding 1 (no end condition, stalemate softlock) plus my Finding 4 (the combat hub is one agent's work).** Combined, these are worse than either alone. Shaman healing, Warden shields, a Healer, a Tank shield and Support haste are all bespoke Combat Manager hooks, written by one agent from a short spec, and nothing in the document tests them against each other. A stalemate is exactly what an untested heal-and-shield interaction produces. The feasibility answer is cheap: an enrage multiplier or a hard fight timer is a few lines in the Combat Manager. But it is a rule the GDD does not contain, and no tool in the pipeline would catch the missing rule before a judge does. I would add a headless or auto-play soak test (run N seeded fights at 4x and flag any over a time cap) to the nightly package step. This is the only part of the "AI builds it" plan that could find the stalemate without the one human.

**QA Finding 4 (floors 1 and 2 have no boss in the must-have build) plus my Finding 2.** I counted only that the Warden is elite-only. QA's point means the floor-transition trigger, "Clearing a floor's boss loads the next floor's map," has nothing to fire on at floors 1 and 2 in the must-have build. That is a missing state machine branch in the Run Manager, the first system any other agent depends on. It strengthens my Finding 2: the must-have list is not just thin, it is internally unrunnable until someone decides what ends a floor.

**Systems Designer Finding 1 (no economy numbers) plus my Finding 1.** The build agents need values to fill the DataTables. With none given, the human has to supply or tune them in the same weekend as integration. That moves a design task onto the serial human path, which is the bottleneck I flagged. It also means the DataTable architecture's "agents can add content" benefit applies only after someone has authored the numbers.

**Player Psychologist Finding 3 (readability tools are stretch).** The damage summary and ability callouts are not just a UX cost. The summary is the only way the one human can diagnose why a seeded run was won or lost during testing. Moving it into must-have would pay for itself in debugging time, which gives a technical case for the readability point beyond the psychologist's player-facing one.

### Revisions

- **Finding 5 stays MINOR, with a corrected premise.** The "rolled up front" claim is withdrawn as an assumption. The finding now reads: the GDD must state whether floors are generated per floor from a derived seed, and add seed entry (or drop the replay claim).
- **Finding 2 is strengthened.** It gains QA's floors 1 and 2 boss gap and QA's event-weight renormalization gap (85 to 90% without events). Severity stays MAJOR. Four reviewers (Systems Designer, QA, Business Analyst, Player Psychologist) raised the party select and unlock-gap issues independently, so the evidence for it is the strongest on the board.
- **Finding 1 stays BLOCKING.** The Business Analyst's Finding 4 reaches the same conclusion from a production view and adds that 7 open questions remain open on Nov 11. Two of them (named characters, final boss versus endless scaling) change content volume, so the scope baseline is not fixed.
- **Finding 3 is narrowed, not withdrawn.** The Narrative Critic's Finding 4 raises the LLM-voiced Architect. That is stretch item 7 and I treat it as outside the must-have budget, so I add no technical finding for it beyond noting that it is another unproven integration.
