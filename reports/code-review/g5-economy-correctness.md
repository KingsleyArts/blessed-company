# Code review: g5-blessed-economy (rules + correctness lens), Nov 18

Scope: `git diff main...HEAD` for `Core/` (CombatSim.h, MiracleGauge.h, CastTimes.h, MetaSave.h, Temple.h, EssenceSidebar.h, FloorGenerator.cpp) and `Run/` (RunManager). Native suites all pass (resolver, floor, run, combat, essence, ui, 8 unit suites); Editor target builds.

Verdict: no BLOCKING, no MAJOR. Merge allowed.

## Checked and fine
- Miracle Gauge: fills only from party hits (miracles and enemies use source = no unit, so no self-feeding); spend is atomic (`CanAfford` before `Spend`); a refused cast is silent and spends nothing. Smite on empty ground still spends, as decided.
- Divine Shield: `DealDamage` returns before any event, so no gauge fill and no threat from a blocked hit. Timer ticks in `TickTimers`, cleared on `StartFight` reset.
- Casts: a caster's cast is cleared on death (`Kill`) and on fight reset; fizzled auto swings are refunded and capped (`interval + dt`); ability cooldown starts at cast begin and is refunded when nothing valid is left at resolve. Cast table is empty by default, so Core tests keep instant actions.
- Warrior frontline rule: pool falls back to all foes when no melee foe exists; the harasser branch only triggers when every melee foe is already on the Warrior.
- Meta save: v1 `gold` still loads as Faith; `partyGold` clamped like Faith; `ResetProgress` clears both. Soak bots never read or write the save (`bBotSession`).
- Pause: Auto step and new-run timers re-arm at 0.2 s while paused instead of acting.

## MINOR (not blocking)
1. A unit keeps moving (`UpdateMovement`) while casting, and an auto swing resolves without re-checking range, so a target that walks away mid-windup can still be hit. Acceptable for the current feel (director confirmed Warrior and Smite behaviour); revisit if melee windups should "commit" in place.
2. `ResetAllProgress` is a no-op for the save in a bot session (by design) but still restarts the run; debug-only, fine.
3. All cast times, gauge fills and costs are still PLACEHOLDERS (documented in the headers); the soak balance pass has not run on them.
