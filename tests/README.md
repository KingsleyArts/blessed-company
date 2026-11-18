# Native tests for `Source/BlessedCompany/Core`

No framework. Build from an "x64 Native Tools Command Prompt for VS 2022" at the repo root.

Stat resolver, event bus, class data (pass the real CSV so it is checked too):
```
cl /std:c++17 /EHsc /W4 /ISource\BlessedCompany\Core tests\stat-resolver-event-bus\tests.cpp /Fe:tests_resolver.exe
tests_resolver.exe data\ClassData.csv
```

Floor generator:
```
cl /std:c++17 /EHsc /W4 /ISource\BlessedCompany\Core tests\floor-generator\tests.cpp Source\BlessedCompany\Core\FloorGenerator.cpp /Fe:tests_floor.exe
tests_floor.exe
```

Both print `All tests passed` or the first failing check.

Run state:
```
cl /std:c++17 /EHsc /W4 /ISource\BlessedCompany\Core tests\run\tests.cpp Source\BlessedCompany\Core\FloorGenerator.cpp /Fe:tests_run.exe
tests_run.exe
```

Headless Unreal check (after a UBT build; no editor window). Expect `LogTolRun` and `LogTolUnit` lines:
```
& 'C:\Program Files\Epic Games\UE_5.7\Engine\Binaries\Win64\UnrealEditor-Cmd.exe' "$PWD\BlessedCompany.uproject" /Engine/Maps/Entry -game -unattended -nosplash -nullrhi -stdout -FullStdOutLogOutput '-ExecCmds=tol.StartRun 42,tol.SpawnUnit Warrior,quit'
```

Essence sidebar (also prints the bot distribution over 20 seeds with and without spending):
```n cl /std:c++17 /EHsc /W4 /ISource\BlessedCompany\Core tests\essence\tests.cpp Source\BlessedCompany\Core\FloorGenerator.cpp /Fe:tests_essence.exe
 tests_essence.exe data
```
