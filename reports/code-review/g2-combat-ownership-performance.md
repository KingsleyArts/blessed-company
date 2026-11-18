# Code review: g2-combat-core, lens OWNERSHIP AND PERFORMANCE

Change: `git diff main..HEAD` on branch g2-combat-core (G1 commits plus G2 commits c36937e, 58fc929, e79d124). Checked against the CLAUDE.md ownership table. Native tests were run (`tests/combat/tests.cpp`: all passed, 2541 checks). A micro benchmark (scratchpad `bench.cpp`, MSVC /O2, not in the repo) measured the sim. Read only; nothing in the repo was edited. The Unreal side was read, not built or run.

## Verdict: send back (two MAJOR, both about the Combat Manager public surface, cheap to fix)

Ownership is clean and the sim is fast enough. The blocker for the next builders is the Combat Manager API: the run-programmer and ui-programmer cannot do their jobs through it without editing combat files.

## Ownership

- The combat-programmer commit c36937e touches only `Combat/`, `Core/CombatData.h`, `Core/CombatSim.h`, `Core/CombatSupport.h`, `tests/combat/tests.cpp` and the architect-shared `Units/TolUnit.h/.cpp`. No ownership violation. It did not touch `StatResolver.h`, `EventBus.h`, `Config/`, `.Build.cs`, `.uproject` or `Core/datatable_structs.h`; `CombatData.h` reuses the data-designer's row structs rather than redefining them.
- The other files in the diff (`Run/`, `Core/RunState.h`, `Data/TolTableRows.h`, `scripts/import_datatables.py`, `Config/`, `.uproject`, `Content/`, `tests/run/`, `tests/README.md`) came in with the G1 commits (d77b82b, fcb8393), not from the combat-programmer. `EnemyData.csv`, `DESIGN-DECISIONS.md` and the `DT_EnemyData.uasset` regeneration are the orchestrator's, as stated; not flagged.
- `TolUnit.h/.cpp` edits are minimal, additive and safe: new public `InitPlaceholder`, `SetSimState`, `GetSimHp/GetSimMaxHp`; private `ApplyColor` (a behaviour-preserving extraction from `InitFromClass`); `Mesh->SetMobility(Movable)` (needed for moving actors). No existing signature changed, so other builders extending `ATolUnit` keep compiling. Residual notes are in findings 6 and 7.

## Findings (most severe first)

### 1. MAJOR: `GetSim()` is const, so nobody outside Combat/ can run the between-fight lifecycle, add waves or subscribe to events
`Combat/CombatManager.h:33` returns `const tol::CombatSim*`. `PostWinRevive`, `RestRoom`, `PrepareNextFight`, `ScheduleWave`, `Bus()` and `MutableUnit` (CombatSim.h lines 225, 279, 292, 300, 346) are all non-const, and the manager wraps none of them. `StartFight(Seed, Party, Enemies, Floor)` has no wave parameter either. The task asks that the run-programmer and ui-programmer can use these without editing combat files; they cannot.
Failure scenario: G3 run-programmer wants the post-win revive after a fight, the rest-room heal on a rest node, and a reinforcement wave on a 12-enemy room. `Manager->GetSim()->RestRoom()` does not compile. The only way forward is editing `CombatManager.h/.cpp` (combat-programmer files), which means a combat-programmer round trip in the middle of G3. The ui-programmer cannot subscribe to `DamageDealt` for floating numbers or to `FightEnded` for a result screen; the only signal is polling `IsFinished()` every frame. Nothing is `UFUNCTION`/`BlueprintCallable`/a dynamic delegate either, so UMG or Blueprint cannot call the manager at all.
Fix (combat-programmer): add manager methods `PostWinRevive()`, `RestRoom()`, `PrepareNextFight()`, `ScheduleWave(Seconds, Enemies, Floor)`, a `StartFight` overload or `AddWave` before start, a non-const `GetSimMutable()` or `GetBus()` for subscribers, and a `FOnFightFinished` multicast delegate fired from `FinishFight`. Mark the read/query ones `BlueprintCallable` if the ui-programmer works in UMG.

### 2. MAJOR: `StartFight` builds a fresh sim every time, so HP cannot carry between fights, and the previous fight's actors leak and are reused wrongly
`Combat/CombatManager.cpp:51-79`: `StartFight` reloads four CSVs from disk (`LoadData`), `MakeUnique`s a new `CombatSim` and re-adds the party by class name. The sim's own carry-over (`PrepareNextFight`, test `Test_HpCarriesOverToTheNextFight`) is unreachable through the manager. Separately, `UnitActors` (header line 48) is never cleared and nothing destroys the actors when the manager is destroyed or restarts: unit ids restart at 0 in each new sim.
Failure scenario A: floor 1 fight 1 ends with Warrior at 40 percent HP. The run-programmer calls `StartFight` for fight 2: the Warrior spawns at full HP. Run-wide attrition (a core part of the loop, plus the post-win revive and the rest room) cannot be built on this API.
Failure scenario B: the run-programmer calls `StartFight` again on the same manager, as the console command pattern invites. Id 2 was a Mage actor in fight 1 and is a Grunt in fight 2; `SyncActors` finds the old actor by id (`CombatManager.cpp:131`), skips `InitFromClass/InitPlaceholder`, so the Grunt shows with the Mage's blue colour and name. Enemy actors from fight 1 with ids not reused stay in the world (hidden only when `removed`, which a fresh sim never sets). Spawning a new manager per fight instead leaks all prior actors, since `Destroy()` on the manager does not destroy them.
Fix (combat-programmer): keep one sim across a run (reuse `Data`, add `PrepareNextFight` plus "add enemies for the next fight"), destroy and clear `UnitActors` when starting a fresh sim, and destroy owned unit actors in `EndPlay`.

### 3. MAJOR (performance, grows with run length): units are never removed from the sim, so per-tick work and per-frame actor updates grow over a run
`CombatSim.h:1123` `std::deque<Unit> units_`; `PrepareNextFight` only flags old enemies and summons `removed` (line 300); every Spirit cast (`SpawnSpirit`, line 1093) appends a unit. `Foes`, `Allies`, `CheckEnd`, `Separate` (an O(N squared) pair loop that checks `alive` only on the inner element after indexing), `TriggerAllows` all iterate every unit ever created. `SyncActors` in `CombatManager.cpp:125-168` does a map lookup plus `SetActorLocation`, `SetActorScale3D` and `SetActorHiddenInGame` for every unit including removed ones, every frame, and the actors of removed units are never destroyed.
Measured (native, /O2): after 60 consecutive fights of 4 versus 8 enemies on one sim (the shape a run would use through `PrepareNextFight`), `units_` held 651 units and the cost per tick rose from 10.5 us (fight 1) to 30-34 us (fights 50-60). That is still small natively. The real cost is Unreal: about 650 live actors with a mesh, each receiving three transform or visibility calls every frame, a few ms per frame on the game thread on top of rendering 650 cubes, at a point (late run) where the player expects 4x speed to be smooth. It also compounds finding 2 scenario B.
Fix: compact `units_` in `PrepareNextFight` (remove retired ids and keep an id to index map, or free-list the slots), destroy actors for removed units, and skip the `SetSimState` call in `SyncActors` when position, HP and alive are unchanged.

### 4. MINOR: `SyncActors` does unconditional transform work every frame
`CombatManager.cpp:162-165`, `TolUnit.cpp:55-58`: location, scale and hidden flag are written for every unit on every frame even when idle or dead, and at speed 0 (paused). With 19 units the cost is small (about 0.1 to 0.2 ms estimated; not measured in UE), and it does not scale with speed, because `Tick` steps the sim up to 16 times and syncs actors once per frame (good design). Cache last values and early-out. `SetActorLocation` without a sweep is the right call.

### 5. MINOR: sim allocations per tick (acceptable now, easy wins)
Measured with an `operator new` counter, party of 4 plus enemies (floor 5, mixed Grunt/Brute/Archer/Shaman, all units made unkillable so the fight lasts 3000 ticks):

| enemies | units | us per tick | allocs per tick | bytes per tick |
|---|---|---|---|---|
| 3 | 13 | 6.3 | 40 | 947 |
| 15 | 25 | 25.6 | 155 | 6113 |

So the full-game worst case (4 plus about 15) costs about 26 us per 1/30 s tick: at 4x speed that is 120 ticks per second, about 3 ms per real second, so well under 1 percent of a frame. No scaling problem within the stated unit counts; cost is roughly linear-to-quadratic in unit count but the quadratic parts (`Separate`, `Foes`) are tiny at N of 25. Sources of the allocations, if someone wants them gone: `Foes()`/`Allies()` return a fresh `std::vector<Unit*>` for every unit every tick (`UpdateTarget`) and again in `ComputeGoal`, `EffectTargets`, `CastAbility` (builds an `effects` vector plus `stable_sort` every tick for each unit whose ability timer is ready but whose trigger or targets are not satisfied); `EventBus::Raise` allocates a `std::function` queue entry per event (the `AbilityCast` capture holds a `std::string`); each log event builds `std::string` labels (`Label()` concatenates name and id). `TickTimers` does a linear string-keyed `FindAbility` per unit per tick; `StatResolver::Tick` and `RemoveBySource` allocate a fresh `std::vector` per call per unit per tick (architect file; note only). None of this needs changing for G2; reserve a member scratch vector for `Foes` if the profile ever shows it.

### 6. MINOR: combat log ring buffer is fine for speed, small for a long fight
`CombatSupport.h`: `CombatLog` is a `std::deque<LogEntry>` capped at 4096 (`CombatConfig::logCapacity`); entries cost one string allocation each, no per-tick string building when nothing happens. Measured volume: a 2 versus 3 Grunt fight is 140 entries over 645 ticks (21.5 s); the 15-enemy stress run is about 1800 entries per 100 s. A boss fight that reaches the 120 s cap with 15 enemies and summons could push roughly 2000 to 4000 entries, near the cap, so the written log may lose its first lines (the "FightStarted" and spawn lines go first) on the longest fights. `FinishFight` also writes every entry to `UE_LOG` (up to 4096 lines, one time, at fight end): fine headless, spammy in the editor output log. The log file name is `TolCombat_<seed>.log`, so two fights with the same seed in one run overwrite each other; the run-programmer should pass a different seed or the file name should include the fight index (`CombatManager.cpp:190`).

### 7. MINOR: `CoreIncludeCheck.cpp` should include the new Core headers
`Core/CoreIncludeCheck.cpp` still lists only `StatResolver`, `EventBus`, `ClassData`, `FloorGenerator`, `datatable_structs`. Add `CombatData.h`, `CombatSupport.h`, `CombatSim.h` and `RunState.h`. I compiled a file with all of those together (MSVC /W4, C++17): clean, no name clashes. Real build coverage still comes from `CombatManager.h` including `Core/CombatSim.h` in the module, but the include check is the cheap guard against future clashes (for example a unit-builder adding a type called `Unit` in `tol`). Who edits it is an ownership call: it is in `Core/` but is not combat logic or an architect file by the table; the combat-programmer or architect can do it.

### 8. MINOR: shared-file extensibility for unit-builders (`TolUnit`)
`CombatManager.cpp:134-153` always spawns the base `ATolUnit` and picks colour from `RoleColor` in `Units/TolUnit.cpp` (a class-name `if` chain). A unit-builder who owns `Units/Classes/<Name>*` therefore has to edit the architect-owned `TolUnit.cpp` (colour table) and the combat-owned manager (to spawn their subclass) to give a unit its own look. `SetSimState` is non-virtual and there is no per-unit view hook. Suggest a lookup (class name to `TSubclassOf<ATolUnit>` or a data-driven colour) in the manager, and virtual `SetSimState`, before the G3 unit builds start.

### 9. MINOR: `StartFight` can leave a dangling data reference on a failed reload
`CombatManager.cpp:40`: `Data = MakeUnique<...>()` destroys the old `CombatData` before `LoadCombatData` has succeeded, while the old `Sim` (holding `const CombatData&`) is still alive. If the reload then returns false (a table empty), `StartFight` returns false and the old `Sim` is left running against freed data (`Tick` would call `Step`). Failure needs a second `StartFight` on the same manager and a broken CSV, so it is unlikely but is undefined behaviour. Load into a local first, then swap after the sim is replaced.

### 10. MINOR: `InitFromClass` reads and parses `ClassData.csv` for every party actor
`Units/TolUnit.cpp:72-86` (G1 code, called by the manager for each party member): four disk reads per fight on the game thread, and the stats it computes are not used by the sim (the sim owns stats). Negligible at G2; use `InitPlaceholder` or the sim's resolved stats instead when the loop is built.

## Checked and fine

- Fixed step is frame-rate independent: accumulator plus 1/30 s, at most 16 steps per frame (so 4x is 8 steps at 60 fps and does not hit the cap; the cap only bites under a hitch of more than 133 ms of game time at 4x, and then time is dropped, not the outcome).
- Unreal object lifetime: `UnitActors` is a `UPROPERTY` `TMap<int32, TObjectPtr<ATolUnit>>`; `Data` is declared before `Sim` so it outlives it on destruction. No raw `UObject*` held.
- No Unreal headers in any `Core/` file; `CombatSim.h` is std-only (compiled natively).
- Determinism: own splitmix RNG stream seeded from the fight seed, no unordered iteration, no wall-clock use.
- Tests: `tests/combat/tests.cpp` builds and passes (all rules, 300-fight soak, 0 wipes, longest 22.0 s).

## Doc questions

None for this lens. (The between-fight sim lifetime in finding 2 is an interface decision for the combat-programmer; the docs, COMBAT-HOOKS 10, already describe HP carrying over and the rest-room/revive hooks.)
