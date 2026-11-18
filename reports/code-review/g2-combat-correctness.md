# Code review: g2-combat-core, lens: correctness

Branch g2-combat-core vs main. Reviewer: code-reviewer (correctness lens).

**Verdict: send back** (2 MAJOR, several MINOR). No BLOCKING.

## Tests run
- `tests/combat/tests.cpp` (MSVC /W4, `tests.exe data`): all 40 tests pass, 2541 checks, soak 300/300 wins.
- `tests/run/tests.cpp` + FloorGenerator.cpp: "all run tests passed".
- Adversarial harness (scratch, not in repo: `...\scratchpad\adv.cpp`, `adv2.cpp`, `adv3.cpp`): every class subset x every enemy subset (2 of each) x floors 1/5/10 x 2 seeds = 11,340 fights, invariants checked every tick (no NaN, 0 < hp <= max for living units, no dead unit holding HP). Zero invariant violations, so HP/heal clamps and divide-by-zero are fine. 95 fights ended TimedOut (finding 1). Edge states checked and handled: no party (WIPE on tick 1), no enemies (WIN on tick 1), empty sim, heal on a dead unit (0), PostWinRevive before a win (0), wave with unknown enemy name, wave at 0 s with no initial enemies, same-tick mutual kill. Core headers contain no Unreal includes (the two grep hits are comments).

## Findings

### 1. MAJOR - Tank (Frontline) locks onto an unreachable lowest-threat enemy and never attacks; fights stall to TimedOut
`Core/CombatSim.h` UpdateTarget (Frontline branch, ~758-770) and TryAuto (~938).
The Warrior always targets the enemy it has the lowest threat on, with no reachability check, and TryAuto only swings at `u.target`. Separation (100) means a blocker between the tank and its target keeps the tank outside Range (150).
Repro (harness `adv2.exe 19 10 1 1` = Warrior+Priest+Summoner vs 2 Brute + 2 Shaman, floor 1, seed 1): at t=30 s and t=60 s the Warrior sits at (-1200,-521) with damageDone 63.0 both times (no attacks for 30 s). Its target Shaman#6 is at (-1200,-700) behind Brute#3 at (-1200,-611); Brute#4 is at (-1199,-406), so the Warrior is sandwiched, cannot get within 150 of the Shaman, and ignores the two Brutes hitting it (taken 177.9 -> 788.4). Fight ends TIMEOUT at 120 s with enemies alive. Same pattern with a kiting Shaman in `17 8 1 1` (Warrior damageDone 48 -> 72 in 30 s).
Impact: any tank fight with Shaman or Archer can turn into a stalemate that only the cap ends. The G2 scenario (Warrior+Mage vs 3 Grunts) is unaffected (100% soak).
Fix direction: if the chosen target is out of Range and another enemy is in Range, hit that one; or fall back to the closest enemy while blocked.

### 2. MAJOR - Cause of death and summary use damage totals from earlier fights
`CombatSim.h` PrepareNextFight (~300-327) never clears `damageFrom`, `damageDone`, `damageTaken`, `healDone`, `threatGenerated`, `kills` on party units; Kill() (~586-593) picks `topSource` from the cumulative `damageFrom`.
Repro (`adv3.exe`): Warrior kills a Grunt in fight 1 (takes 146.6 from Grunt#1), PrepareNextFight, fight 2 vs an Archer with the Warrior at 5 HP. Output: `First to fall: Warrior#0 at 1.57s, killed by Archer#2; most damage from Grunt#1 (146.6)`. The "most damage from" source is a retired enemy from the previous fight. COMBAT-HOOKS 11 (death screen, post-fight summary) is wrong from the second fight of every run; SummaryText shows run-cumulative numbers labelled as the fight summary.
Fix direction: reset these counters (and clear `damageFrom`) in PrepareNextFight.

### 3. MINOR - TimedOut is reported as a WIPE
EndFight raises `FightEnded{idx, result == Won}`; the log subscriber prints `FightEnded: WIPE` for a TimedOut fight, and any FightEnded listener (revive, rewards, run manager) cannot tell a timeout from a wipe even though the party may be fully alive (finding 1 repros). See doc question 1.

### 4. MINOR - Retired units are never compacted; per-tick scans and allocations grow
`units_` only grows (PrepareNextFight marks `removed`, never erases; expired spirits too): 200 fights of 3 party + Grunt + Archer + spirits gave 806 units. Foes()/Allies() allocate a `std::vector` per unit per tick (UpdateTarget, ComputeGoal, EffectTargets) and Separate() is O(n^2) over all units including retired. Small at jam scale (about 150 units over a 10-floor run) but it is per-tick allocation. ACombatManager::SyncActors also keeps a hidden actor per retired unit id for the session.

### 5. MINOR - ACombatManager::StartFight does not reset `UnitActors`
`Combat/CombatManager.cpp` StartFight. A second call on the same manager keeps the previous fight's actors; sim ids restart at 0, so an old Grunt actor (its name and colour from `InitPlaceholder`) is reused to show a new party unit, and old actors with ids beyond the new unit count stay visible forever. `tol.RunFight` spawns a new manager per call and never destroys the previous one, so repeated commands stack managers and actors. Debug-only today; will bite when Run reuses the manager per node. Also, if StartFight returns false midway (unknown class or enemy) the half-built `Sim` stays set and `IsFinished()` is false forever.

### 6. MINOR - Tick catch-up cap makes Speed above about 32x silently slower
`CombatManager.cpp` Tick: at most 16 steps per frame and the accumulator is zeroed when 16 is hit, but SetSpeed allows 64x. At 60 fps, 64x needs about 32 steps per frame, so real speed is about half. Outcome stays deterministic; only wall-clock speed is wrong. `Steps == 16` also zeroes the accumulator when 16 steps were exactly enough.

### 7. MINOR - Unknown enemy in a wave is silent
SpawnDueWaves logs "Reinforcement wave arrives (N enemies)" and ignores AddEnemy returning kNoUnit: a wave of `{"Nope"}` gives a WIN at 26.5 s with no warning. ScheduleWave also overwrites a single `waveFloor_`, so waves scheduled with different floors all use the last one.

### 8. MINOR - Ownership items to confirm (ownership lens)
- `Config/DefaultEngine.ini` (architect-owned) gained an `AndroidFileServer` block with `bAllowNetworkConnection=True` and a `SecurityToken`; looks editor-generated, unrelated to combat, and now sits in history.
- `BlessedCompany.uproject` (architect-owned) enables PythonScriptPlugin and EditorScriptingUtilities.
- `docs/DESIGN-DECISIONS.md` (director-only) and `data/EnemyData.csv` (data-designer) are edited. Both entries say "director", so probably instructed, but they are outside combat-programmer's files.

## Observed, not findings
- `Unit::taunts` (Brute `Taunts=true`) is set but never read, and `Unit::trigger` is never set from data, so enemy taunting and non-OnCooldown trigger modes are unimplemented (Group Heal casts on cooldown even at full HP). Rules lens territory.
- Units act in id order and party ids are always lower, so on a same-tick mutual kill the party strikes first and the enemy dies before acting (Mage vs Grunt both at 1 HP -> WIN). Deterministic, but a systematic party tie-break. CheckEnd prefers WIPE over WIN if both sides end empty (cannot currently happen).
- Shaman pairs plus kiting cause timeouts with the party alive (Warrior+Summoner vs 2 Shamans); tied to finding 1 and doc question 1.
- The combat data is read from `ProjectDir()/data` at runtime; a packaged build will not contain it unless staged (G3 packaging concern; no staging config in `Config/`).
- No unseeded randomness, no unordered iteration; floating-point order is fixed (tests confirm same-seed identical logs). Enrage: step 1 at tick 1350 (45.0 s), +10% per 150 ticks, no off-by-one found; enemies spawned mid-fight get the current enrage step.

## Doc questions
1. What should the run do when a fight reaches the enrage cap with the party alive (95 of 11,340 mixed-composition fights in my sweep)? Treat as loss, draw without rewards, or enemies flee? The docs only say the soak test must not exceed the cap.
2. May a Frontline tank hit an adjacent enemy that is not its lowest-threat target (finding 1)? COMBAT-HOOKS gives the tank rule but not the blocked case.
