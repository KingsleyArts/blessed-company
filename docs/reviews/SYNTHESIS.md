# Round 3 — Moderator Synthesis

Everything below traces to the six review files in `reviews/`. Finding labels are the reviewers' own (e.g. "SD F1" = Systems Designer Finding 1).

## 1. Top 5 Issues (ranked by severity × confidence)

### 1. The Must-have / Stretch line contradicts the design it is meant to ship (BLOCKING)
**Problem:** The minimum build has 4 units for 4 party slots, an Unlocks track whose contents (5th unit, event rooms, floors 4–5) are all Stretch, no 4x speed toggle, and no Architect or final boss, so the headline "feel stronger, reach a new floor by run 3" cannot be delivered.
**Flagged by:** Business Analyst (F1), Feasibility Lead (F2), Adversarial QA (F3), Systems Designer (F3), Player Psychologist (F1, F5), Narrative Critic (F1).
**Cross-examination:** **Strengthened.** Four reviewers found the same contradiction independently in Round 1. In Round 2 QA added that floors 1–2 have no boss and the 3-floor "full clear" has no defined end state, and the Psychologist added that the must-have build has no novelty beat between runs.

### 2. There is no schedule, and the must-have list is not sized for one person in the window (BLOCKING)
**Problem:** A solo developer with Thursday and Friday lost to work has no day-by-day plan, no cut order, and a "fallbacks keep must-have shippable" claim that is circular, with 7 scope-changing open questions still open.
**Flagged by:** Feasibility Lead (F1), Business Analyst (F4).
**Cross-examination:** **Strengthened.** The Business Analyst upgraded its finding from MAJOR to BLOCKING. QA's mid-run-exit and floor-ending gaps show the must-have list is larger than it reads, and the Systems Designer's missing economy numbers add design work to the same serial human path.

### 3. A fight ends only when one side is wiped, so a stalemate is an unrecoverable softlock (BLOCKING)
**Problem:** Enemy healing and shields (Shaman, Warden, "enemies shielded") against the party's Healer, Tank shield and Support haste can outlast damage output, and the player has no input to break it.
**Flagged by:** Adversarial QA (F1); extended by Systems Designer, Feasibility Lead and Narrative Critic in Round 2.
**Cross-examination:** **Survived intact.** No reviewer disputed it. The Systems Designer says fight length is therefore unbounded rather than just unspecified, and the Feasibility Lead ties it to the one-agent Combat Manager. The Psychologist argues an unexplained wipe is more common but did not downgrade the stalemate.

### 4. The economy has no numbers, so the pacing targets and the 15-minute budget cannot be checked (BLOCKING)
**Problem:** No gold per room, conversion rate, rank costs, unit or enemy stats, or fight length are given, and about 20–30 seconds per room is all the 15-minute, 2–3-run target allows.
**Flagged by:** Systems Designer (F1, F2), Adversarial QA (F5), Player Psychologist (F4), Business Analyst (F1), Feasibility Lead (R2).
**Cross-examination:** **Strengthened.** The Systems Designer kept it BLOCKING because no colleague supplied the missing numbers, and the Psychologist raised its pacing finding to BLOCKING. The Systems Designer upgraded the uncapped "+Essence per run" and "+gold per room" stacking (F5) from MINOR to MAJOR. The Systems Designer disputes the Psychologist's flat 20-seconds-per-room figure, because run 3 is the longest run.

### 5. The player is never told why they lost, and the tools that would show it are Stretch (BLOCKING in the Psychologist's Round 2 ranking)
**Problem:** Readability is "the main design goal", yet the results screen shows only floor, Essence and seed, a wipe discards the whole run, and the damage summary and speed toggle are Stretch.
**Flagged by:** Player Psychologist (F3, raised to BLOCKING merged with F4), Narrative Critic (R2 connection), Feasibility Lead (R2 connection).
**Cross-examination:** **Strengthened.** The Feasibility Lead adds a debugging case: the summary is the only way the single developer can diagnose a seeded run. The Narrative Critic raised its death-message finding (F5) from MINOR to MAJOR because that screen is the only guaranteed story surface.

*Also on the board but not ranked:* the Architect is unreachable in a 15-minute session (Narrative Critic F1, BLOCKING; folded into Issue 1), and gold converts only on the results screen, so a crash, quit or expired judging window pays out nothing (QA F4, MAJOR).

## 2. Unresolved Disagreements

**A. Cut the HD-2D art stack, or prove it early?**
- **Business Analyst:** 4-direction sprites, Niagara and lighting are decorative relative to what a judge decides, so cut or demote them. Prototyping a feature that should be cut wastes Saturday hours.
- **Feasibility Lead:** The lit-sprite-in-3D pipeline is the largest unbudgeted risk and must be proven in the first hours. It agrees the art work is the real cut candidate, but says to keep the seeded RNG and debug panel (an hour or less each).
- **Escalated decision:** Whether HD-2D is a core commitment. The Business Analyst notes the document's only stated reason to use Unreal is that look, so cutting it also removes the engine rationale. The Systems Designer sides with the Feasibility Lead on keeping the debug grant, since it is the only stated mitigation for the unquantified economy.

**B. Fix the tier contradiction by promoting content, or by shrinking scope?**
- **Business Analyst:** The Stretch order is wrong. Promote Unlocks, the 4x toggle and the 5th unit above room modifiers and event rooms.
- **Feasibility Lead:** The must-have list is already too large for one person and there is no mechanism to cut when Saturday slips.
- **Escalated decision:** Which items the must-have build contains, given a schedule that does not exist yet.

**C. How much story does the build carry?**
- **Narrative Critic:** Keep the Architect, since the meta loop "doubles as the story". Move one beat into floors 1–3 and the hub, such as a hub line that changes with run number. Drop the LLM-voiced Architect for tone reasons.
- **Business Analyst:** Cut the Architect framing to the intro card and a death message, and add no portraits, named characters or LLM voice.
- **Escalated decision:** Whether the Architect keeps any on-screen presence in the shippable build. QA rates the underlying defect (undefined end states) as MAJOR where the Narrative Critic rates the unreachable story BLOCKING, though QA endorses it as a dependency.

**D. What does the death screen carry?**
- **Narrative Critic and Business Analyst:** Vary the death message by floor reached (or run number, or fallen units).
- **Player Psychologist:** Cause of death must come first and story second, otherwise a player reads flavor text and learns nothing.
- **Escalated decision:** Screen priority between explanation and story on the one screen every run ends on.

**E. Is gold a currency to keep or delete?**
- **Systems Designer:** Gold is dead plumbing, so give it a role or delete it.
- **Business Analyst:** Delete it as the cheapest scope reduction, with no in-run use (that would add a shop screen).
- **Narrative Critic:** Keep the conversion and name it in the fiction, as the one place "failed runs feed the tower" becomes literal.
- **Escalated decision:** Gold's role. QA notes that deleting it or crediting Essence mid-run would also fix the mid-run-exit payout loss.

**F. How serious is seed determinism?**
- **Adversarial QA (MAJOR):** "Seeded runs" is a must-have with an untestable acceptance criterion, there is no seed-entry screen, and a debugging tool that cannot reproduce a bug is worse than none.
- **Feasibility Lead (MINOR):** The fix is one derived stream per floor and takes minutes. It concedes its "map rolled up front" premise was unsupported and agrees it is a MAJOR spec defect.
- **Escalated decision:** Whether the GDD promises "same map" or "same run", and whether seed entry is added or the replay claim dropped.

## 3. Quick Wins

1. **Add an enrage or fight timer.** A few lines in the Combat Manager that fix the stalemate (Feasibility Lead, QA). The Narrative Critic notes an on-theme "the tower closes in" version, and the Systems Designer says it also gives the 15-minute budget a worst case.
2. **Make the death screen show cause of death and vary by floor reached.** It uses data the results screen already tracks, and it serves both the Psychologist's explanation gap and the Narrative Critic's "failure screen" problem (Narrative Critic, Business Analyst, Player Psychologist).
3. **Derive a separate seeded stream per floor for the map.** Minutes of work, and agreed as the cure by QA and the Feasibility Lead. Add a seed-entry control or drop the replay claim.

## 4. Verdict

The document is not yet ready to drive production. The board's findings converge on one structural defect: the Must-have/Stretch line was drawn by build effort rather than by what a judge sees in 15 minutes. As a result, the minimum build has no party choice, nothing to unlock, no Architect, no speed toggle and no explained loss, and it sits on top of an economy with no numbers, a fight rule that can softlock, and no schedule for a solo developer. The single change that matters most is to re-specify the must-have build as one runnable, sized, scheduled game: decide the 5th unit, a 3-floor ending, a fight-end rule and the economy numbers, and rank what leaves when Saturday slips. The unresolved questions in section 2 (HD-2D, story scope, gold) are decisions for the designer, not the reviewers.
