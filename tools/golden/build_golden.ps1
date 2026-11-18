# Builds and runs the C++ golden dumper. Needs VS 2022 and the Unreal reference repo (read-only).
param(
  [string]$Ref = 'C:\dev\tower-of-the-lost',
  [string]$Out = "$PSScriptRoot\..\..\spec-tests\core",
  [string]$Work = "$env:TEMP\blessed-golden"
)
New-Item -ItemType Directory -Force $Work | Out-Null
$core = "$Ref\Source\TowerOfTheLost\Core"
$vc = 'C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat'
$cmd = "call `"$vc`" >nul && cd /d $Work && cl /nologo /std:c++17 /EHsc /O2 /I$core `"$PSScriptRoot\dump_golden.cpp`" `"$core\FloorGenerator.cpp`" /Fe:dump_golden.exe && `"$Work\dump_golden.exe`" `"$(Resolve-Path $Out)`""
cmd /c $cmd
