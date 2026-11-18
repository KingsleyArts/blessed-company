# Data sync log

Owner: data-designer. Lists values that changed in `data/` and the exact doc edits the director may apply (agents do not edit `docs/`).

## Draft values awaiting measurement

| Table | Row | Column | Old | New | Status | Source |
|---|---|---|---|---|---|---|
| ClassData | Warrior | BaseHP | 300 | 250 | DRAFT, tuning target (sim-balancer to measure) | Director, Nov 13: floor 1 without the Priest is now an easy tutorial floor and floor 2 starts with the Priest rescue, so the Warrior can be weaker. Defense stays 40. |

Measured with a scratch headless harness (200 seeds, floor 1, 3 Grunts, Grunt HP 110, damage 8):
- Warrior + Mage: Warrior HP lost 121 either way (40.3% of max at 300, 48.4% at 250); party HP lost 31.9% -> 36.7%; 200/200 wins; fight 18.0 s.
- Warrior + Priest + Mage: Warrior HP lost 43.4 -> 35.9 (14.5% -> 14.3% of max); party HP lost 9.3% -> 8.6%; 200/200 wins.

## Proposed doc edits (director applies)

- `docs/DESIGN-DECISIONS.md` line 186 (Warrior survivability retune): add a line "Nov 13 (director, DRAFT): Warrior base HP 300 to 250, Defense stays 40; floor 1 without the Priest is an easy tutorial floor and floor 2 starts with the Priest rescue. Measured next by the sim-balancer."
- The Warrior row of the GDD class table, if it quotes 300 HP: change to 250 (draft).
