# Nightly package test, Thursday Nov 12

Result: **repo as committed does NOT package (compile error, owner architect). With one Build.cs line patched in a scratch copy, packaging, launch, map load, run start and party spawn all work.**

## Command
`powershell -NoProfile -ExecutionPolicy Bypass -File scripts\release\package.ps1 -OutputDir C:\dev\tol-builds\test-thu`
(ExecutionPolicy Bypass is per process only; the machine policy blocks unsigned scripts.) Wraps:
`RunUAT.bat BuildCookRun -project=...\BlessedCompany.uproject -noP4 -platform=Win64 -clientconfig=Development -build -cook -stage -pak -archive -archivedirectory=C:\dev\tol-builds\test-thu -utf8output -unattended -nosplash`
then copies `data\` into `Windows\BlessedCompany\data`, copies Windows\ to `test-thu-launch` and runs the exe `-nullrhi -nosound -log -unattended` for 25 s. Optional `-Config Shipping`, `-SkipPackage`, `-SkipLaunch`, `-RepoRoot <copy of project>`.

## Failure 1 (blocking): C4530 exceptions not enabled
Run on the real repo fails at the first compile (UAT builds the editor target too): `error C4530: C++ exception handler used, but unwind semantics are not enabled. Specify /EHsc` in `Core/ClassData.h(49)` and `Core/CombatData.h(36)` (`try { std::stof(...) } catch (...)`), hit by every module TU. This means the editor target also no longer builds with the current Source/.
- Owner: architect (`BlessedCompany.Build.cs`) or combat-programmer (remove try/catch in `ClassData.h`, `CombatData.h`; other Core headers also contain `try`: CombatSim.h, CombatSupport.h, EventBus.h, CombatManager.cpp).
- Fix tested: add `bEnableExceptions = true;` in `BlessedCompany.Build.cs` (tested in a scratch copy only; I did not touch Source/). Alternative: replace std::stof with non-throwing parsing.

## Result with the fix, from scratch copy (`...scratchpad\proj`, only Build.cs differs from the repo)
- BUILD SUCCESSFUL, cook 0 errors / 0 warnings.
- Output: `C:\dev\tol-builds\test-thu` (Windows\ = packaged game) = **826 MB** (under 1 GB; mostly Engine runtime + pdb; Development config). `C:\dev\tol-builds\test-thu-launch` is the fresh copy used for launching. Shipping would be smaller; not tried.
- Launch (fresh folder, no editor): starts, mounts paks, `LoadMap /Game/Maps/TestArena` (default map, cooked without any extra setting), no crash. Log excerpt:
```
LogLoad: LoadMap: /Game/Maps/TestArena?Name=Player
LogTolRun: Run started: seed 639325912121479702, party size 3
LogTolRun: Floor 1: 17 rooms, quota 12, crystal node 6, boss 0
LogTolUnit: Unit Warrior: HP 200.0 Damage 6.0 AttackSpeed 1.00 Defense 20.0 Threat 1.50
LogTolUnit: Unit Priest: HP 100.0 Damage 3.0 AttackSpeed 0.80 Defense 0.0 Threat 1.00
LogTolUnit: Unit Mage: HP 80.0 Damage 16.0 AttackSpeed 0.70 Defense 0.0 Threat 1.00
```
  Game runs until stopped (no self-quit); the script stops it after 25 s.
- Data problem confirmed and fixed: with `data/` removed from the packaged folder the log shows `LogTolUnit: Error: Cannot read ../../../BlessedCompany/data/ClassData.csv` x3 (and stats fall back). With the post-package copy the CSV values load (stats above).

## Data staging decision
`DirectoriesToAlwaysStageAsNonUFS` only stages under `Content/`, so it would not land in `<Project>/data`. Used a post-package copy step in `package.ps1` instead. No ini change needed. Long-term options: read data from `Content/` or `FPaths::ProjectContentDir()` (programmer), or keep the script copy. Anyone packaging by hand (editor Package menu) will miss data/.

## Config edits
None. (`Config/DefaultGame.ini` does not exist; no packaging setting was needed.)

## Not covered (done-when for Thursday)
Title screen, starting a run via UI and finishing a fight: no title screen exists yet and no fight loop runs in TestArena at launch; run start and party spawn only. Rendering was `-nullrhi`, so no visual or audio check.

## Director / orchestrator must do
1. Get the C4530 fixed (architect: `bEnableExceptions = true`, one line). Then re-run the command above; expect about 10 minutes. Editor must be closed.
2. Decide whether runtime CSV reading stays (script copy) or moves under Content.
