# Builds and runs the C++ combat golden dumper. Needs VS 2022 and the Unreal reference repo (read-only).
param(
  [string]$Ref = 'C:\dev\tower-of-the-lost',
  [string]$Data = "$PSScriptRoot\..\..\data",
  [string]$Out = "$PSScriptRoot\..\..\spec-tests\combat",
  [string]$Work = "$env:TEMP\blessed-golden"
)
New-Item -ItemType Directory -Force $Work | Out-Null
New-Item -ItemType Directory -Force $Out | Out-Null
$core = "$Ref\Source\TowerOfTheLost\Core"
$vc = 'C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat'
$cmd = "call `"$vc`" >nul && cd /d $Work && cl /nologo /std:c++17 /EHsc /O2 /I$core `"$PSScriptRoot\dump_combat.cpp`" /Fe:dump_combat.exe && `"$Work\dump_combat.exe`" `"$(Resolve-Path $Data)`" `"$(Resolve-Path $Out)`""
cmd /c $cmd
