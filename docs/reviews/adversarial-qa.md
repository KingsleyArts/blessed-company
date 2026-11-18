# Adversarial QA — Round 1

## Finding 1 — Fights have no end condition besides a wipe, and the player cannot intervene (BLOCKING)

**Problem.** The GDD says "A fight ends when one side is wiped" and nothing else. There is no enrage timer, round cap or sudden-death rule. Both sides carry sustain: the player's Healer, the Tank's shield and the Support's haste, against the enemy Shaman (a "Healer"), the Warden (shields allies), and the room modifier "enemies shielded". A heal-and-shield mirror can outlast damage output indefinitely. Targeting makes it more likely. Melee hits the lowest-HP enemy and ranged hits the highest-threat enemy, so damage is split across targets while the Shaman heals. "Highest-threat" is never defined. A Tank taunt plus a shield can also cancel a weak enemy pack's damage entirely.

Because "manual ability triggers, positioning control" are out of scope and the player "only decides which room to enter next", a stalemate is an unrecoverable softlock. Neither the 4x speed toggle nor the debug panel helps. A judge sees a frozen fight and no button to press.

**Source.** "A fight ends when one side is wiped." Enemy table (Shaman = Healer, Warden = shields). Out of scope: "manual ability triggers, positioning control". Targeting rules ("highest-threat enemy" is undefined).

**Related contradiction.** The Shaman is described as a "Priority target, teaches focus fire". The player cannot focus fire, and the targeting rules never mention healers. The stated lesson is impossible to teach.

## Finding 2 — "Same seed, same floors" and "seeds replay exactly" are incompatible with the stated RNG design (MAJOR)

**Problem.** The GDD says "All randomness goes through one seeded random stream so seeds replay exactly". Combat is "real-time with attack timers" and uses crit chance, and the Ranged DPS synergy is "Crits refund cooldown". The same stream also feeds relic rolls, loot and enemy-pack rolls. Real-time combat at 1x, 2x or 4x consumes a variable number of random draws, depending on frame timing and fight length. Floor 2 is generated after floor 1 combat. The Floor Generator "builds the node map from the seed", and the Run Manager holds "current floor". Floor 2 and later maps therefore depend on how many draws floor 1 combat used. Different play speeds, paths or relic choices will produce different later floors from the same seed.

Further gaps:
- The seed is only "shown on the results screen". None of the 7 listed screens has seed entry, so a seed cannot be replayed.
- "Seeded runs" is a must-have item, but its acceptance criterion is untestable as written.

**Source.** Technical design, key decisions ("one seeded random stream"). Procedural floors ("Same seed, same floors. This is a debugging tool first"). UI screen table (no seed input).

**Fix direction.** Use separate streams for map generation (derived per floor from the seed) and for combat and loot.

## Finding 3 — Meta unlock tracks and must-have scope reference features the must-have list cuts (MAJOR)

**Problem.** The Unlocks track includes "Unlock the 5th roster unit, unlock event rooms, unlock floor 4 and 5". The must-have list has only 3 floors and 4 room types (no events). The 5th unit, event rooms and floors 4 and 5 are stretch items 1 to 3. If the stretch items are not built, the following problems appear:

- The Unlocks track holds dead or unbuyable upgrades, which pollute the "at least 10 upgrades" count.
- The pacing target "By run 3, a judge should reach a new floor they couldn't reach before" is unmeetable if floor gating is an upgrade for floors that don't exist. A 3-floor build tops out at floor 3.
- The party is "4 slots picked from a jam roster of 5 units", but the must-have includes only "4 party roles". With a 4-unit roster, party select is a forced pick of everyone, and "Choose 4 of the unlocked units" is a non-decision.
- Which of the five units is the locked 5th is never stated. If it is Support, the Healer's "Haste also speeds healer cooldowns" synergy never fires early. If it is any other role, the base party lacks a core role.
- The final boss "punishes parties with no healer", but that can only occur after the 5th unit is unlocked, if the player drops the Healer.
- Relic pools carry role-specific Rares (the healer's group heal also cleanses) and the starting-relic and "better relic rarity odds" upgrades. Rarities are stretch item 6, with 12 relics minimum. Rarity odds upgrades and Rare/Epic relics have nothing to act on in the must-have build.
- Room weights include Event at 10 to 15%. Without events the table sums to 85 to 90%, and no renormalization rule is given.

**Source.** Meta progression, Unlocks row. Scope, must-have and stretch lists. Party and units. Bosses. Generation weight table.

## Finding 4 — Mid-run exit, crash and abandon paths are unspecified, and "every run pays out" is false for them (MAJOR)

**Problem.** The loop says "every run, won or lost, ends back in the upgrade hub with Essence to spend". Gold converts to Essence only on the Run results screen, which is reached only via "party wipe or full clear". The doc defines no abandon or quit-to-title option during a run. Persistence says "Save after every run and on every purchase", and there is no mid-run save. The Title screen has a "continue" button, but the doc never says what it continues. Consequences:

- A judge who alt-F4s or crashes mid-run, or whose 15-minute window expires, loses all gold and Essence for that run. This directly contradicts the headline pitch "Every run pays out".
- Under the "2 to 3 runs in 15 minutes" format, a judge who bails out of a slow run to retry gets zero progression.
- The 3-floor must-have build has a "1 boss". The loop says "Clearing a floor's boss loads the next floor's map", but floor 1 and 2 bosses do not exist. Mid boss placement is "end of floor 2 or 3". "Floors without a unique boss reuse the mid boss with a modifier". What ends floors 1 and 2 in the must-have build is not defined, and the "full clear" end state for the 3-floor build is not defined.
- The "first party wipe each run revives the tank at 30% HP" Epic relic conflicts with "A party wipe ends the run". Whether a wiped Tank revives while the rest of the party is dead, or into an already-lost fight, is not specified.
- A reset-progress button is required, with no confirmation or backup. A misclick on a projector wipes the demo.

**Source.** Core loop. Meta progression, Persistence. UI screen table (Title "continue"). Scope, must-have "3 floors and 1 boss". Bosses. Relics.

## Finding 5 — Pacing targets cannot be verified because the economy is undefined, and the 15-minute budget contradicts the run length (MAJOR)

**Problem.** The pacing targets are:
- "A first failed run... earns enough Essence for 2 to 3 cheap upgrades"
- "Rank 1 of every upgrade costs under one average run's Essence"
- "2 to 3 runs in about 15 minutes"

The Gold to Essence rate is never given. Gold per room, boss and elite bonuses, upgrade costs and the per-rank cost curve are also absent. "Average run" has no definition because the player's strength changes after each purchase. The Economy track also contains "+Essence per run" and "+gold per room", which compound with each other. Without a cap or cost curve, stacking can make progression trivially fast. Gold also has "Nothing in the jam scope" to spend on, so it is dead until conversion, and the open question on gold use is still unresolved.

Time budget: a 3-floor must-have run is 3 floors × (4 rows + boss) = 15 rooms. The jam target of 5 floors is 25 rooms. Fight duration is not specified anywhere. Two to three runs in 15 minutes leaves about 5 to 7 minutes per run, or roughly 20 seconds per room including map and relic clicks. The 4x speed toggle is the only lever, and it is stretch item 5 ("Speed toggle at 4x"). The speed toggle appears on the Combat HUD in the 7-screen list that is itself a must-have. Whether 1x/2x is must-have and only 4x is stretch is ambiguous.

Relic pool: with a 12-relic minimum, about 15 relic picks per run (one after each cleared room) will repeat offers. Whether picks are from a pool without replacement is unstated. The "1 free reroll of the relic pick" upgrade has no reroll button in the Relic pick screen spec ("3 cards with rarity color and effect text").

**Source.** Meta progression (Pacing targets, tracks). Loot (Two currencies). Target play session. Scope (stretch #5, must-have). UI screen table (Relic pick, Combat HUD).

## Round 2 — Cross-examination

### Conflicts

**Systems Designer #4 (HP and state carry-over undefined; "the only run-ending condition is a wipe, so risk and reward are unbalanced") vs. my Finding 1.** The Systems Designer treats the wipe as a sufficiently defined terminal state and worries about balance around it. I argue the wipe is not guaranteed to occur. With enemy Shaman heals, Warden shields and the "enemies shielded" modifier against a Healer, Tank shield and Support haste, there is a reachable stalemate. The Systems Designer's power-curve analysis assumes every fight resolves. Until a fight-resolution backstop exists, tuning difficulty is premature. The two of us agree on one thing: state carry-over (HP persists after Rest "heals 30%") also matters for my stalemate case, because a party that enters a fight at low HP into a healing mirror is more likely to stall or grind.

**Narrative Critic #1 (BLOCKING: the Architect is unreachable in a 15-minute session) vs. my Finding 3 and Finding 4.** The Narrative Critic rates this BLOCKING, and I disagree on severity and framing. The story is unreachable only because a stretch cut makes it so, and that is one symptom of the scope inconsistency I flagged in Finding 3, which is MAJOR. The unresolved question is what the must-have build's end state is. As I noted in Finding 4, the doc does not define what a "full clear" or a floor-1 or floor-2 ending is in a 3-floor, 1-boss build. The Narrative Critic's "full clear" message therefore has no trigger. I would not rate a missing story beat above a softlock, but the underlying defect (undefined end states) is real and I endorse it as a dependency.

**Feasibility Lead #5 (seed determinism, MINOR) vs. my Finding 2 (MAJOR).** The Feasibility Lead downgrades this because seeds are "a debugging tool." I hold MAJOR. "Seeded runs" is a must-have item with a stated acceptance criterion. A debugging tool that cannot reproduce a bug is worse than none, because it gives false confidence. The Feasibility Lead's own framing ("same map vs. same run") matches my fix direction, so we agree on the cure but not on urgency. I would also add that the seed cannot even be entered on any listed screen, which the Feasibility Lead did not note.

### Connections

- **Feasibility Lead #4 (Epic and Rare relics need bespoke combat hooks, not DataTable rows) + my Finding 4 (Tank revive vs. "A party wipe ends the run").** Together they show the revive relic is the hardest relic to implement and the one with a spec contradiction. The wipe check must run before or after the revive, the Combat Manager owns both, and the doc fixes neither. Because "one agent per system" puts the Combat Manager with one agent, two agents could implement the wipe and revive rules in contradictory order. The bug is likely to ship because the DataTable framing hides it.
- **Player Psychologist #3 (no cause of death on the results screen) + my Finding 1.** A stalemate is the worst case of the missing-explanation problem. If a fight stalls, there is no cause to display and no end condition to trigger a results screen. I would add that Run results shows only floor, Essence and seed, so a softlocked run produces no output at all.
- **Business Analyst #1 and Player Psychologist #4 (15-minute math does not close) + my Finding 4.** If time runs out mid-run, the pitch "every run pays out" fails in the demo setting, because gold converts only at the results screen. The 15-minute window is therefore both a pacing problem and a progression-loss problem. A judge who runs out the clock on the run they were on gets zero payout from the run that was supposed to demonstrate the loop.
- **Systems Designer #5 (gold is a dead currency) + my Finding 4.** Gold's only job is conversion at the results screen, so gold carries run value only if the run ends cleanly. A mid-run Essence credit, or deleting gold, would also fix my abandon-path issue. This is a free fix that the Systems Designer's cleanup would deliver.
- **Player Psychologist #1 / Systems Designer #3 (party select is a non-choice) + my Finding 3.** Both identify the 4-of-4 problem. I add that the GDD does not say which unit is the 5th. That determines whether the base party has a Healer or a Support at all, and whether synergies are even demonstrable early, so the choice problem is worse than they describe.

### Revisions

- **Upgrade Finding 5's "ambiguity" about 1x/2x vs. 4x to a stand-alone point.** Three colleagues (Systems Designer #2, Feasibility Lead #2, Player Psychologist #4) independently reached the same 20 to 30 seconds per room figure. That convergence strengthens it. I keep it MAJOR and do not upgrade it to BLOCKING, since I defer to the Business Analyst and Feasibility Lead who rate scope and schedule as the blocking items. I also note that its dependency on fight duration is itself unspecified, and no reviewer has answered it.
- **Keep Finding 1 as BLOCKING.** No colleague raised the stalemate, and no one disputed it. I read that as a gap in their lenses, not as evidence it is minor. The Shaman "teaches focus fire" contradiction is also unaddressed by the Narrative Critic and Player Psychologist, who both discuss agency.
- **Withdraw nothing, but narrow Finding 3.** The relic rarity and Event-weight renormalization points are the most concrete and cheapest to fix. The Business Analyst's claim that the Unlocks track "has nothing to unlock" in the must-have build covers the same ground more cleanly, so I would cite the Unlocks and 5th-unit points as shared and focus my own contribution on the renormalization and unspecified-5th-unit gaps.
