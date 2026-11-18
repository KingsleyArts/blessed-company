# Player Psychologist — Round 1

## 1. Party select is a non-choice in the must-have build (MAJOR)
**Problem:** The first thing a player does each run is "pick 4 units," but the must-have list ships only 4 party roles. The 5th unit is stretch item #1 and is also gated behind an unlock. Until then, party select is 4 of 4. Synergies are shown there "so judges notice them," yet with a fixed party they are always all on and can't be a decision. The "real choice" the roster section promises doesn't exist in the first runs, which are the ones a judge sees.
**Source:** "The party is 4 slots picked from a jam roster of 5 units"; Must have: "Auto combat with 4 party roles"; Stretch #1 "5th roster unit as an unlock"; "Unlocks as onboarding: gating the 5th unit...".

## 2. The player's agency is thin, and the fallback for that is thin too (MAJOR)
**Problem:** Per the GDD, the player's only decisions are the party, the next room and a 1-of-3 relic pick, and combat has zero input. The room choice is made from icons and modifier icons with no stated information about pack composition or risk. The relics are mostly flat stat boosts (Common: "+10% party Attack"), so many picks will feel like no real choice. The risk table's answer to "watching, not playing" is "relic picks, synergy callouts, and the speed toggle." The first is the same shallow decision, the second is trivial with a fixed party (see 1), and the third is stretch #5. Players need to feel that their choices caused the outcome, and the design never says how they will.
**Source:** "The player's only decisions are the party, the next room, and the relic pick"; Relic tiers; Risks table row 1; Stretch #5.

## 3. Readability is declared the main goal, but the tools that deliver it are cut to stretch (MAJOR)
**Problem:** "A judge must see why a fight was won or lost" is the design goal. The must-have list only commits to "readable numbers." The post-fight damage/healing summary, the 2x/4x speed toggle and ability callouts sit in stretch or are not named in must-have. The run results screen lists only floor, Essence and seed, with no cause of death. A wipe ends the whole run and discards all relics, and with no explanation the player will read the loss as arbitrary and quit rather than iterate. The Essence payoff alone doesn't explain why it happened.
**Source:** "Readability is the main design goal"; "A party wipe ends the run"; Run results key elements; Stretch #5 vs. Must have.

## 4. The 15-minute pacing math doesn't close, and fight length is never specified (MAJOR)
**Problem:** The target is 2-3 runs in about 15 minutes, so about 5 minutes per run. Must-have is 3 floors of 4 rows plus a boss (around 15 rooms). That leaves about 20 seconds per room including the map tap, the fight, the relic pick and the transitions. No fight duration is given anywhere, and 4x speed is stretch. If a run is shorter, the player dies on floor 2 and never gets far enough for relics to matter. If it is longer, runs 2 and 3 won't fit, so the "feel clearly stronger" payoff never lands. Also, "a full clear is 20 to 25 rooms" describes the stretch 5-floor game, not the must-have one.
**Source:** "Target play session"; "Jam target: 5 floors... 20 to 25 rooms"; Must have "3 floors and 1 boss"; no fight-length target.

## 5. Meta progression promises felt strength that the player may not be able to perceive (MAJOR)
**Problem:** The payoff "feel clearly stronger on the last one" relies on flat stat upgrades (+HP, +Attack, +Defense) applied to a fight the player only watches. Nothing states how a purchase is made visible, for example "you survived X more hits" or before/after numbers. Gold is a dead number: it can't be spent in-run and just converts to Essence, and that is an open question. The pacing target "reach a new floor they couldn't reach before" contradicts the must-have of 3 floors, since floors 4 and 5 are stretch but the unlock track gates them. If the player hits the ceiling by run 2, the reward loop ends with nothing left to reach. The first-run reward is "2 to 3 cheap upgrades," with no stated moment of surprise or new content beyond that.
**Source:** Meta progression pacing targets; Upgrade tracks "Unlocks: floor 4 and 5"; "Gold... Nothing in the jam scope"; Must have "3 floors"; Stretch #3.

## Minor note (MINOR)
Onboarding is a "4 lines at most" how-to-play panel on the hub. Nothing in the GDD explains roles, the relic pick, or what a room icon means before the first run. The first-launch story text appears before the player has seen any gameplay.

## Round 2 — Cross-examination

### 1. CONFLICTS

**Adversarial QA Finding 1 (no fight end condition, a stalemate is a softlock) vs. my Finding 3 (cause of death is unexplained).**
QA treats the dominant failure as a fight that never ends. I argue the more common experience is the opposite. The doc's own pacing expects a first run to die "around floor 2," so the typical player meets a wipe, not a stalemate. QA's finding is real and I would not downgrade it. But a stalemate is a rare, loud failure, and an unexplained wipe is a failure every player meets in every run. My Finding 3 should rank next to QA's on player impact, even if QA's is worse per occurrence. The two also need one shared fix. If the post-fight summary and a visible fight timer or enrage are built together, the stalemate becomes a readable loss and the wipe becomes an explained one.

**Systems Designer Finding 4 (the map choice carries almost no information, so risk and reward are unbalanced) vs. my Finding 2.**
Here we agree, but the Systems Designer frames it as a balance problem, and I disagree with the fix implied by that framing. Tuning elite rewards up does not give the player agency. The player needs to read the risk before choosing. The room icon needs to show something such as pack size or enemy type. A better elite payout the player cannot evaluate is still a coin flip. This is a UI-information requirement on top of a number requirement.

**Narrative Critic Finding 5 (death messages as the only guaranteed story) vs. my Finding 3.**
The narrative critic wants the death message to vary by floor reached, run number or fallen units. I support that, with a caution. The death screen is where my "why did I lose" need and the narrative need collide. If the death message becomes flavor text from the Architect, the screen has no room for cause-of-death information. A player who loses and reads "calm and certain" lines instead of "the Healer died first, then the Ranged DPS" learns nothing. The loss screen must carry the explanation first and the story second.

### 2. CONNECTIONS

**Business Analyst Finding 3 (decorative features consume budget) combined with my Finding 2.**
The analyst says Rare and Epic relics are pushed to stretch while 4-direction sprites and Niagara take the effort. From the player side, this makes the shallow-agency problem worse. In the must-have build, 12 relics are mostly flat stat boosts, and the only rule-benders that would make a pick feel like a decision are cut. So the player makes about 15 relic choices per run, and they pick among numbers with no real difference. Neither of us alone shows that the weakest decision is also the most frequent one. The relic pick is the most frequent input and gets the least design.

**Adversarial QA Finding 4 (no abandon or mid-run exit; "every run pays out" is false for early exits) combined with my Finding 4.**
QA found a rule-level gap. I find the psychological cost. A player who realizes at room 5 that the run is going badly cannot retreat to the hub. Their only way to get Essence is to lose. Under a 20-second-per-room budget, that forces the player to sit through a doomed run, which is exactly the "watching, not playing" state the risk table fears. If a safe exit with partial gold existed, it would also become the first real risk-versus-reward decision in the game.

**Feasibility Lead Finding 2 and the Business Analyst Finding 1 (must-have contradicts pacing and unlock targets) combined with my Finding 5.**
Three of us found that the Unlocks track holds only stretch content. The player-side consequence is stronger than the scope consequence. In the must-have build, run 1 has flat stats. Run 2 has flat stats. Run 3 has flat stats. No new unit, room type or floor appears at any point. The reward loop has no novelty beat, and novelty is what carries the player between runs in a game with no input. I would call this a BLOCKING-level risk to the game's emotional promise, even though it is MAJOR as a design finding.

### 3. REVISIONS

- **Finding 1 (party select)**: Keep MAJOR. Systems Designer, Feasibility Lead and QA all independently flag it, which confirms it. I add one point from the Systems Designer. The final boss punishes parties "with no healer," and that cannot happen when the only possible party has a healer. So a signature moment of the game cannot occur in the must-have build.
- **Finding 4 (pacing)**: Merge with Finding 3 in my own ranking. Five reviewers computed about 20 seconds per room. I no longer treat this as only a pacing issue. It is a readability issue too. At 20 seconds per fight, the post-fight summary and a speed toggle cannot be optional. I raise this combined finding from MAJOR to BLOCKING for the must-have build, since the build cannot show the player why they lost in the time the doc allows.
- **Finding 5 (meta progression)**: Upgrade the novelty point as stated in the connection above. Withdraw nothing. I would downgrade my claim about gold being "a dead number" to a note, since the Systems Designer correctly rates it MINOR and it has no effect on perceived strength.
- **Minor onboarding note**: Upgrade to MAJOR. Nobody else covered onboarding, and the board's findings show the first run is thin. The first-time player sees a 4-line panel, a forced party, an auto fight and an unexplained wipe. The four-line how-to-play is the only teaching tool, and the GDD says the Shaman "teaches focus fire," which QA shows the player cannot do. The one lesson the game plans to teach is impossible to act on.
