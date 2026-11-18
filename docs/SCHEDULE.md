# Schedule and Cut Order (GDD-02) — Approved

**Approved by the designer** (with 8 hours each on Thu, Fri and Sat and about 12 on Sun). This includes the gates, the hour budget, the checkpoints and the full ranked cut order (items 3 to 7 were proposed and are now approved). Hour estimates remain unmeasured; re-check them after Thursday.

## Fixed facts
- Jam runs **Thu Nov 12 12:00 AM EST** to **Sun Nov 15 8:59 PM EST (5:59 PM PST)**. Late submissions are disqualified.
- Solo developer. Thursday and Friday are work days, so most building happens **Saturday and Sunday** (from the GDD's own risk table).
- Do not start building the game before Nov 12. Tool, agent and MCP setup beforehand is allowed; declare anything made earlier (this design work, the GDD and the reviews).
- Submission needs: a **packaged Unreal build** (zip named TeamName_GameName, under 1 GB), a **30–60 second gameplay video** (show gameplay in the first five seconds), the tools and assets list, and the team and game details.
- **Hours available (from the designer):** 8 hours each on Thu, Fri and Sat, and about 12 on Sun, so about **36 hours** in total, plus Wed setup. The plan is built from gates (what must work) and checked against these hours in the "Hour budget" section.

## Gates
A gate is a working state that must be true before moving on. If a gate is missed, apply the cut order below before starting the next day.

| Gate | Must be true |
|---|---|
| **G0** (Wed Nov 11, setup only) | Unreal opens a C++ project template, the C++ toolchain compiles, MCP and agents respond, version control is set up and a Windows packaging test of an empty project succeeds. No game content. |
| **G1** (end Thu) | Project with a C++ module; stat resolver, event bus and the DataTable structures exist; a placeholder unit spawns with resolved stats. |
| **G2** (end Fri) | Fixed-step combat works in one arena: Warrior and Mage fight 3 Grunts with movement, threat and the damage pipeline; a fight ends in a win or a wipe and writes a combat log. |
| **G3** (end Sat) | The full loop works with placeholder art: six classes with abilities, four enemy types, enrage, post-fight revive, a node map (fog added Sunday only if ahead) with crystal and kill quota, Essence sidebar, gold saved per room. **A packaged build exists and is uploaded as the Saturday-night backup.** |
| **G4** (Sun noon, freeze) | Permanent gold upgrades and unlocks (tier-1 stats, target-list slots), death screen with cause of death, seed entry, tooltips, boss at floor 10 and a balance pass are done. No new features after this. |
| **G5** (Sun, at least 3 hours before the deadline) | Final packaged build tested on a clean launch, video recorded, submission filled in and submitted. |

## Day by day
**Wed Nov 11 (setup only, no game content)**
- Verify G0. Claim partner credits (Anthropic, Diversion, fal, etc.) if wanted. Decide naming: team name, game name.
- Write down what was made before the jam (design docs) for the declaration.

**Thu Nov 12 (limited time)**
1. Create the project and C++ module.
2. Agent 1: stat resolver, modifier list and event bus (the interfaces everything depends on).
3. Agent 2: DataTable structures (`ClassData`, `EnemyData`, `StatDef`, `AbilityData`) with the placeholder values from `DESIGN-DECISIONS.md` section 3.
4. Placeholder role-colored sprites (flat 2D, mirrored) for all six classes and four enemies.
5. Agent 3, in parallel once the event bus exists: Run Manager skeleton and Floor Generator (per-floor seeded node map data, room types, crystal, kill quota). Data and logic only; no UI yet. It does not depend on combat, so it can run alongside it.
6. End: **G1**.

**Fri Nov 13 (limited time)**
1. Combat Manager fixed-step loop, damage and heal pipelines, combat log.
2. Unit actor with movement and role positioning behaviors (`COMBAT-HOOKS.md` section 8b).
3. Threat table and enemy targeting; party target selection (closest only for now).
4. Warrior and Mage vs Grunts in one arena. End: **G2**.
5. Package a test build tonight (catches packaging problems early).

**Sat Nov 14 (main day 1)**
1. Morning: remaining four classes and the six abilities; Brute, Archer, Shaman; Healing Echo is Stretch and is skipped; Priest smite rule; enrage; post-fight revive; staggered spawns.
2. Midday: node map UI on top of Thursday's Floor Generator (rooms, crystal, kill quota, Combat/Elite/Treasure/Rest, floor scaling +8% per floor). **No fog on Saturday**; fog is added Sunday only if ahead.
3. Afternoon: Essence sidebar (tier 0 stats), Essence and Gold payouts, gold persisted per room in the save, Abandon Run.
4. Evening: package a build and upload it as the backup. End: **G3**.

**Sun Nov 15 (main day 2)**
1. Morning: gold shop for permanent upgrades; tier-1 stats; target-list slot unlocks; Party Luck stats (Essence and Gold per Kill and per Room, capped); death screen with cause of death; seed entry; first-run tooltips; reset-progress with confirm; boss at floor 10.
2. By noon: **G4 freeze**, then balance with the debug grant (fight length target about 20 seconds at 1x; floor 1 loses about a third of the party's HP).
3. Afternoon: package and clean-launch test; record the 30–60 second video; write the tools and assets list and the declaration of pre-jam work; submit. **G5**: aim to be submitted at least 3 hours before 8:59 PM EST.

## Hour budget (my estimates, not measured)
Assumes agents write code in parallel and your time goes to review, integration, playtesting and packaging. These estimates are unvalidated; the first real data point is how long Thursday's foundation takes.

| Day | Hours | Planned work | Estimate | Verdict |
|---|---|---|---|---|
| Thu | 8 | Project and C++ module 1; stat resolver and event bus 3 (agent plus review); DataTables 1; placeholder sprites 1; Floor Generator and Run Manager 2 (parallel agent) | 8 | Fits, no buffer |
| Fri | 8 | Combat loop, pipelines and log 3; movement and positioning 2; threat and targeting 1.5; Warrior and Mage vs Grunts test and fixes 1; test package 0.5 | 8 | Fits, no buffer |
| Sat | 8 | Four more classes and six abilities 2.5; three more enemies, staggered spawns, enrage, revive 1.5; node map UI 2; Essence sidebar, payouts, gold save, Abandon Run 1.5; package and backup upload 0.5 | 8 | **Overloaded: no buffer on the biggest day** |
| Sun | 12 | Gold shop and permanent upgrades 2; tier-1 stats working through sidebar and unlocks 2; target-list unlock UI 1; trigger-mode unlocks 1; Party Luck stats 0.5; death screen 1; tooltips 0.5; seed entry and reset button 1.5; boss at floor 10 1; balance pass 1.5; package, clean-launch test, video, submission 2.5; (fog 1 if ahead) | 14.5 to 15.5 | **Over by 2.5 to 3.5 hours** |

**What this means:** the full proposed scope is about 4 to 5 hours more than the 36 available. The plan only works if some cuts happen. The most likely are cut order items 3 (seed entry box) and 4 (trigger-mode unlocks), which together recover about 2.5 hours on Sunday. Fog (5) is already a "only if ahead" item. If Saturday slips, the Sunday overload grows, so decide Friday night:
- **Friday night check:** if G2 (combat with movement) is not met, cut items 3 and 4 immediately and drop the fixed-formation fallback in (movement risk, below).
- **Saturday night check:** if G3 is not met, cut 5 and 6 and cut the tier-1 stat list (item 7) before starting Sunday.
- **Do not add anything** to the list above. A new feature has to replace an existing line.

## Ranked cut order (cut from the top when a gate is missed)
| # | Cut | Status |
|---|---|---|
| 1 | ~~Gear shop~~ no longer cut (Nov 14): it is the Temple's gear levels, and treasure drops replace relics | Changed by the director |
| 2 | Relics (the 6 rare rule-benders) | Confirmed |
| 3 | ~~Seed entry box~~ CUT Nov 14 (the seeded map stream stays) | Done |
| 4 | ~~Trigger-mode unlocks~~ CUT Nov 14, on the post-jam list (target-list slots stay) | Done |
| 5 | Fog on the node map (keep crystal and quota); planned for Sunday only if ahead | Approved |
| 6 | Staggered spawns on regular Combat rooms (keep them on Elite rooms) | Approved |
| 7 | Reduce the tier-1 stat list to the fewest stats that still give each class a distinct build | Approved |

**Not on the cut list (the minimum game):** six classes with their abilities, fixed-step combat with movement and threat, node map with crystal and quota, Essence sidebar, gold saved per room, death screen with cause of death, a packaged build and the video.

Already out of scope for the jam: Healing Echo and all tier 2–3 stats, the Architect, Warden and Swarmling enemies, Event rooms, 4-direction art, lighting, fog VFX, Niagara, and the rest of the Party Luck path.

## Risks to watch
1. **C++ toolchain on day one.** If the C++ build or hot reload is broken at G0, the combat core plan changes. Check on Wednesday.
2. **Combat is the critical path.** One owner for the Combat Manager; other systems add listeners in their own files (`COMBAT-HOOKS.md` section 12). Do not start the node map or UI on Thursday or Friday until G2 passes.
3. **Movement is new work** (steering, separation, range checks). It is inside G2 on purpose; if it is behind on Friday night, fall back to fixed row positions for the jam and note it as a cut.
4. **Placeholder art is the fallback.** Do not spend Saturday on sprite work; swap sprites in Sunday morning only if G3 is met.
5. **Full Official Rules not read.** They may contain requirements (declarations, play limits) that change this plan.
6. **Tuning is unsimulated.** All numbers are placeholders; budget the Sunday balance pass.
7. **One human is the bottleneck.** Agents can write code in parallel, but integration, playtesting and packaging are serial.
