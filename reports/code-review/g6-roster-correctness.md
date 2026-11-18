# Code review: g6-roster-and-polish (rules + correctness lens), Nov 18

Scope: `Core/Roster.h` (new), `Core/MetaSave.h` (activeParty), `Core/RunFlow.h` (SetStartParty, SetPriestOwned), `Run/RunManager.cpp` (FlowStart, Temple Party toggle, rescue auto-slot). UI changes (Temple party strip, room theme, swing-bar hiding) are layout/art and skip review.

Verdict: no BLOCKING, no MAJOR.

## Checked and fine
- A fresh save and any save from before the picker start exactly as before: an empty `activeParty` means Warrior + Mage, plus the Priestess when she is already unlocked (she used to join from the start). Tested.
- A bad saved party (unowned, duplicate, too many, empty after cleaning) is sanitised on read; the file format change is one additive key, so v2 files without it load (tested).
- A benched Priestess is not rescued again: floors are generated with her counted as owned (`SetPriestOwned`), tested against the control (not owned -> rescue room present on floor 2).
- Soak bots: `bBotSession` resets the meta in memory, so the bot party stays Warrior + Mage and the save is untouched.
- Live check (headless Temple clicks): Priest benched, Assassin added, New Run started with Warrior, Mage, Assassin and the save wrote `activeParty=Warrior|Mage|Assassin`.

## MINOR (not blocking)
1. The rescue still adds the Priestess as a fourth unit when the player picked three other heroes and she is not owned yet (she joins on floor 2 and unlocks). Open design question for the director: should she replace a hero, wait for a free slot, or join as a guest? Left as is.
2. The Temple's gear rows only exist for Warrior and Mage (`kTempleClasses`); Assassin and Priestess have no Temple gear yet.
3. The test-setup flag `NextRun.bPriest` can push a fourth member into a three-hero party (debug only).
4. Assassin ownership from the start is a DRAFT (docs only say "suggest Assassin"); how the player gets her/him is not decided.
