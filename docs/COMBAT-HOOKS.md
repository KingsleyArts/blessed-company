# Combat Hook Interface (GDD-18)

How classes, stats, threat, target priorities, abilities and rewards plug into combat. Everything here is a **Proposal** built from the decisions in `DESIGN-DECISIONS.md`; items under "Open decisions" need the designer's answer.

## 1. Principles
1. **One owner of combat logic.** The Combat Manager runs the simulation. Units are data plus a thin actor; they never call each other directly.
2. **Everything else listens.** Threat, Healing Echo, lifesteal, thorns, rewards, UI numbers, the combat log and relics all react to events. Adding a feature means adding a listener, not editing combat.
3. **Fixed-step simulation.** Combat advances in fixed ticks (proposed 1/30 s). The 1x/2x/4x toggle runs 1, 2 or 4 ticks per frame, so outcomes do not depend on frame rate and a headless soak test can run fights instantly.
4. **Logic in mergeable files.** The Combat core (stat resolver, pipelines, event bus, threat, targeting, ability effects) is written in C++. Blueprints and DataTables only hold data and thin glue. This keeps one agent's work from colliding with another's, since uassets cannot be merged (feasibility review, F4).
5. **Separate random streams.** Map generation uses the per-floor streams; combat (crits, tie-breaks, rapid fire and other chances) uses its own stream.

## 2. Data (DataTable rows)
- **ClassData:** id, role tag (Tank / Healer / MeleeDPS / RangedDPS / Support), base stat block, auto-action id, ability id, allowed stat list, allowed target types, allowed trigger modes.
- **EnemyData:** id, role tag (Melee / Tank / Ranged / Healer), base stat block, auto-action id, taunts (bool), boss/elite flags.
- **StatDef:** id, tier, which classes may buy it, base cost, cost growth, max rank, bonus per rank, cap.
- **AbilityData:** id, cooldown, list of **effects** (see section 6), allowed trigger modes.
- **GearData** (Stretch): slot, class, per-level stat modifiers.

New enemies, classes and stats are added as rows. A new *kind* of effect needs one new C++ effect type; that is the only place logic changes.

## 3. Stat resolver
Every stat on a unit is resolved from a list of modifiers.

`final = (base + sum of flat) × (1 + sum of percent) × product of multipliers`, then clamped (min/max per stat).

Each modifier carries: stat id, kind (flat / percent / multiplier), value, **source tag**, and optional duration. Source tags make clean cleanup possible:

| Source | Lifetime |
|---|---|
| Class base | Permanent |
| Gold permanent upgrades, gear | Saved in the profile, applied at run start |
| Essence sidebar purchases | Run only; cleared at run end |
| Floor scaling (+8% per floor, boss spike) | Applied to enemies at spawn |
| Buffs (Rage, Taunt damage reduction) | Timed |
| Enrage | Enemy damage multiplier added by the Combat Manager |
| Relics | Run only |

The resolver caches results and recomputes only when a modifier is added or removed. UI reads the resolved value, so the sidebar can show before and after numbers (GDD-14).

**Party Luck stats** (Essence/Gold per Kill and per Room) are not unit stats. They live on the Run Manager as reward multipliers, capped at +100% per stat.

## 4. Event bus
The Combat Manager raises typed events; listeners subscribe by type. A listener may add modifiers, request heals or damage through the pipelines, or write to the log, but may not change combat state directly.

| Event | Raised when | Example listeners |
|---|---|---|
| FightStarted / FightEnded | Fight begins / one side is wiped | Revive, rewards, UI, enrage timer |
| AttackStarted | A unit begins an auto attack | Rapid Fire, animation |
| DamageDealt (source, target, amount, crit, tags) | After the damage pipeline | Threat, lifesteal, thorns, floating numbers, combat log |
| DamageTaken | Same moment, from the target's side | Thorns, death defy |
| HealApplied (source, target, effective amount) | After the heal pipeline | **Healing Echo**, healing threat, floating numbers |
| AbilityCast | An ability fires | Combat log, VFX |
| UnitDied | HP reaches 0 and death defy fails | Wipe check, kill rewards, cause-of-death log |
| EnemyKilled | An enemy dies | Kill quota counter, Essence and Gold per Kill |
| EnrageTick | Each enrage step | UI warning |

## 5. Pipelines (fixed order)
**Damage:** base damage → crit roll (Crit Chance, Crit Factor) → apply attacker's mods → **Rend Armor** lowers target Defense % → Defense % reduction → **Fortitude** flat reduction (never below 1) → Death Defy check at 0 HP → apply → raise events.

**Heal:** base heal → Heal Power → clamp to missing HP (effective amount) → apply → raise HealApplied.

**Healing Echo** (listener on HealApplied for the Priest): echo % (starts 10%, capped 30%) of the effective heal is applied over 4 s to the same target. A new echo from the same Priest on the same target refreshes the old one. Total echo on a target is capped at 60% of its max HP. Echo ticks use the heal pipeline but do not raise HealApplied, so echo cannot echo itself.

**Smite rule:** the Priest's auto action first checks the party. If any ally is below 85% HP, it heals the lowest-HP ally; otherwise it attacks with a weak smite.

## 6. Abilities
An ability is a cooldown plus an ordered list of **effects**. Supported effect types for the jam:

| Effect | Used by |
|---|---|
| Damage (target selector, scale) | Execute, Fireball |
| Heal (target selector, scale) | Group Heal |
| AddThreat (flat, target selector) | Taunt (all enemies) |
| ApplyModifier (stat, value, duration) | Taunt damage reduction, Rage |
| SpawnSummon (summon data, duration) | Summon Spirit |

**Casting:** each tick a unit's cooldown timer advances (scaled by Cooldown Reduction). When ready, the unit checks its active **trigger mode** and casts if the condition holds:

| Trigger mode | Condition |
|---|---|
| On cooldown | Always |
| Save for boss or elite | An elite or boss is in the fight |
| Pack is large | 3 or more living enemies |
| Ally is low | Any ally below 40% HP (proposed) |

Run 1 has only "On cooldown" available. Unlocks add the others and are stored per class.

## 7. Threat and enemy targeting
- Each enemy keeps a **threat table**: one number per party unit.
- DamageDealt adds `damage × Threat stat` to every enemy table the attacker is engaged with. HealApplied adds a small amount (proposed 25% of the effective heal) to every enemy's table for the healer.
- The Warrior starts with a 1.5× Threat stat. **Taunt** raises the Warrior's threat on every enemy to the current highest in that table plus a flat bonus.
- An enemy attacks the living party unit with the highest threat. Ties are broken by the combat stream.
- **Tank behavior:** the Warrior's auto attack picks the enemy it has the lowest threat on, which spreads threat across all enemies. This overrides the Warrior's priority list.
- Summons add a reduced share (0.5×) of the damage-based threat.
- **Hidden threat multiplier:** every unit has a threat multiplier in `ClassData`. Warrior 1.5× (starting Threat stat, upgradeable), Barbarian a hidden 1.2× (lower than the tank, slightly higher than the rest), everyone else 1.0×. The Barbarian's value is not shown to the player and has no upgrade. **Confirmed: the Barbarian is set to 1.2×, stored as the tunable `ThreatMultiplier` field in `ClassData`** (not hard-coded), so it can be changed in play with the debug panel.

## 8. Party target priorities
- Each unit holds an ordered list of **target types**. Default list: `[Closest]`. Each paid unlock adds one more slot; the player orders the slots.
- Evaluation: take the first target type with at least one valid enemy and pick that enemy. Remaining ties go to the closest enemy.
- Proposed target types: Closest, Weakest (lowest current HP), Strongest (highest current HP), Healer-first (role tag Healer), Archer-first (role tag Ranged).
- Allowed types per class come from `ClassData`; the Warrior ignores the list (section 7).

## 8b. Positioning and movement (confirmed: combat has movement)
Units move inside the arena. The floor node map still has no walking; this is arena-only. A small flat arena with simple steering is enough: no navigation mesh, just move toward a goal point, keep separation from other units, and stop at the goal.

**Movement runs inside the fixed-step simulation** (section 1) at a per-class move speed stored in `ClassData` (not an upgradable stat). Attack range is the Range stat, now measured in arena distance; Damage/Meter uses distance to the target.

Each unit has a **positioning behavior** that picks its goal point each tick:

| Class | Behavior |
|---|---|
| Warrior | Goes to the front. Moves to grab each enemy it has the lowest threat on, including newly arriving enemies, and stays engaged. |
| Barbarian, Assassin | Close to melee range of their chosen target and stay on it. They do not try to gain threat on their own (the Barbarian's hidden 1.2× threat is only a multiplier). |
| Mage, Summoner | Stay inside Range but avoid standing on top of enemies (a preferred minimum distance). They do not prioritize safety strongly, so they accept some risk. |
| Priest | Stays farthest back while keeping the lowest-HP ally within Range; the strongest safety-seeking of the group. |

Enemies mirror this by role tag: Grunt and Brute close to melee range of the target picked by the threat table; Archer and Shaman keep their preferred distance.

**Proposed movement values** (arena units are Unreal units, 100 = 1 m; assumed arena about 2400 × 1400; all values live in `ClassData` / `EnemyData` and are tunable; unsimulated):

| Unit | Move speed (units/s) | Attack range | Preferred distance from its target or nearest enemy | Retreats when an enemy is closer than |
|---|---|---|---|---|
| Warrior | 320 | 150 (melee) | Stays within 150 of its target | Never |
| Barbarian | 300 | 150 (melee) | Within 150 of its target | Never |
| Assassin | 380 | 150 (melee) | Within 150 of its target | Never |
| Mage | 260 | 900 | 500 to 800 | 400 |
| Summoner | 270 | 800 | 450 to 700 | 350 |
| Priest | 280 | 700 | At least 600, and within 700 of the lowest-HP ally | 500 |
| Grunt (enemy) | 280 | 150 | Within 150 of its target | Never |
| Brute (enemy) | 220 | 150 | Within 150 of its target | Never |
| Archer (enemy) | 240 | 800 | 600 to 750 | 450 |
| Shaman (enemy) | 240 | 600 | At least 500 from the party | 400 |

Reasoning for the starting values:
- The **Warrior is faster than every enemy melee unit** (320 vs the Grunt's 280), so it can reach newly arrived enemies before they reach the backline. The **Assassin is the fastest** since it must close on a chosen target.
- **Casters are slower** so that retreating costs them attacks; the Priest is a little faster than the Mage so it can re-position without being exposed.
- The **Priest's retreat distance (500) is higher than the casters'** (350 to 400), matching "strongest safety-seeking". Mage and Summoner accept more risk.
- Range stat upgrades add a flat amount in units per rank (proposed +25 per rank, capped at +300), so Range grows without breaking the preferred bands.
- Units re-evaluate their goal point every 0.25 s and only move when the goal changes by more than 50 units, which avoids jitter.

**Consequences**
- The **Range** stat has a real meaning (reach), so Range upgrades for the Priest, Summoner and Mage matter.
- **Healer-first** and **Archer-first** targeting are meaningful: backline enemies can stand behind the front line.
- A new arrival (an enemy that appears after the fight starts) pulls the Warrior toward it, which makes the "tank grabs new enemies" rule observable. Fights may therefore spawn some enemies in staggered groups (see open decisions).
- Movement adds work: steering, separation, facing, and attack-range checks all run in the Combat Manager. This increases the schedule risk in GDD-02.

## 9. Summons
The Spirit is a unit with a lifetime (Spirit Duration) and damage (Spirit Damage). It uses the same unit and event machinery, with these exceptions: it cannot be targeted by enemies unless no party unit is alive (it does not take over aggro), it is not revived, it never counts for the party-wipe check, and it is removed when the fight ends.

## 10. Fight lifecycle
1. **Spawn** both sides from the room's rolled pack; apply floor scaling to enemies.
2. **Run** the fixed-step loop. Enrage starts at 45 s: enemy damage +10% every 5 s.
3. **End** when all enemies are dead (win) or all four party units are dead (wipe). A wipe ends the run.
4. **After a win:** if the Priest is alive, revive dead units at 1 HP. Pay Essence and Gold. Update the kill quota.
5. **Rest rooms** heal 30% HP and revive any dead units at 1 HP, whether or not the Priest is alive.

## 11. Combat log and cause of death
Every event is appended to a ring buffer. It feeds:
- the **death screen**: cause of death first (which unit fell first, who killed it, and the highest threat/damage source); the story line is secondary;
- the **post-fight summary** (damage, healing, threat per unit);
- a **headless soak test** that runs N seeded fights at maximum speed and fails any fight that exceeds the enrage cap (feasibility review, R2).

## 12. Build order and agent split
Interfaces first, so agents do not wait on one another:
1. **Stat resolver + event bus** (C++): the interfaces everything else uses.
2. **Damage and heal pipelines** + combat log.
3. **Unit actor** (thin Blueprint) + Combat Manager loop and fight lifecycle + **movement and positioning behaviors** (section 8b).
4. **Threat table + targeting.**
5. **Ability system** + the six class abilities.
6. **Rewards** (Run Manager listeners: Essence, Gold, kill quota) and **sidebar upgrades**.
7. **Combat UI:** floating numbers, sidebar, results screen; **Healing Echo**, relics and Stretch stats last.
The Combat Manager stays one agent's file ownership; other systems add listeners in their own files.

## 13. Open decisions
**Confirmed by the designer**
- Combat has movement (not the fixed-formation arena in the base GDD). Role positioning as in section 8b; the Barbarian has a hidden threat multiplier above everyone but the Warrior.
- C++ for the combat core, with Blueprints and DataTables for data and glue.
- Fixed simulation tick of 1/30 s.
- Summon aggro rules (section 9), healing threat at 25% of effective healing, and "Ally is low" at below 40% HP.

- **Staggered spawns:** some fights spawn enemies after the fight starts: one extra wave on some Combat rooms and every Elite room. Reinforcements join the same threat tables and count toward the kill quota.

**Still open**
1. Movement values in section 8b are **accepted by the designer as starting values** and tuned in play.
