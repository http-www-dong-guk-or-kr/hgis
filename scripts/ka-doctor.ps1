# ka-doctor.ps1 - 이 PC의 개발 준비 상태를 점검한다(읽기 전용: 아무것도 설치하거나 바꾸지 않는다).
#   powershell -NoProfile -File scripts\ka-doctor.ps1 [-Quick] [-Json]
# 표시: [OK] 준비됨 / [X] 없음(해야 할 일을 함께 보여 줌) / [!] 확인 필요
# -Quick 은 문제가 있는 줄([X], [!])만 보여 준다. 종료 코드: [X] 가 없으면 0, 있으면 1.
param(
  [switch]$Quick,
  [switch]$Json
)

$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$script:rows = New-Object System.Collections.ArrayList
$isWin = ($env:OS -eq 'Windows_NT')

function Add-Check {
  param([string]$Name, [string]$State, [string]$Detail, [string]$Fix = '')
  [void]$script:rows.Add([pscustomobject]@{ Name = $Name; State = $State; Detail = $Detail; Fix = $Fix })
}

function Get-App([string]$name) {
  $c = Get-Command $name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { return $c.Source }
  return $null
}

function Get-FirstLine([string]$exe, [string[]]$exeArgs) {
  try {
    $o = & $exe @exeArgs 2>&1 | Select-Object -First 1
    return ([string]$o).Trim()
  } catch { return $null }
}

function Get-VersionFrom([string]$text) {
  if ($text -match '(\d+)\.(\d+)\.(\d+)') { return New-Object System.Version ([int]$Matches[1]), ([int]$Matches[2]), ([int]$Matches[3]) }
  return $null
}

# ---------------------------------------------------------------- 공통 도구
$git = Get-App 'git'
if ($git) { Add-Check 'Git' 'OK' (Get-FirstLine $git @('--version')) } else { Add-Check 'Git' 'X' '없음' 'https://git-scm.com 에서 Git for Windows 를 설치하세요(Git Bash 포함).' }

$node = Get-App 'node'
if ($node) {
  $nv = Get-FirstLine $node @('--version')
  $ver = Get-VersionFrom $nv
  if ($ver -and $ver.Major -ge 18) {
    $lockNote = ''
    if ($ver.Major -ne 22) { $lockNote = ' (저장소 잠금 판은 22.x - Graft 설치에 영향이 있을 수 있음)' }
    $st = 'OK'; if ($lockNote) { $st = '!' }
    Add-Check 'Node.js' $st ("$nv$lockNote") 'Node.js 22 LTS 를 설치하면 Graft·Archify·훅이 모두 안정적입니다.'
  } else {
    Add-Check 'Node.js' 'X' "$nv (18 이상 필요)" 'Node.js 22 LTS 를 설치하세요(훅·Graft·Archify 가 사용).'
  }
} else {
  Add-Check 'Node.js' 'X' '없음' 'Node.js 22 LTS 를 설치하세요(Claude Code 훅·Graft·Archify 가 사용).'
}

$claude = Get-App 'claude'
if ($claude) {
  $cv = Get-FirstLine $claude @('--version')
  $ver = Get-VersionFrom $cv
  $min = New-Object System.Version 2, 1, 280
  if ($ver -and $ver -ge $min) { Add-Check 'Claude Code' 'OK' $cv }
  else { Add-Check 'Claude Code' 'X' "$cv (2.1.280 이상 필요: Opus 5.5)" 'PowerShell 에서 "claude update" 를 실행한 뒤 다시 시작하세요.' }
} else {
  Add-Check 'Claude Code' 'X' '없음' 'PowerShell 에서: irm https://claude.ai/install.ps1 | iex   (또는 winget install Anthropic.ClaudeCode)'
}

# ---------------------------------------------------------------- Claude 설정
$homeClaude = Join-Path $HOME '.claude'
$globalSettings = Join-Path $homeClaude 'settings.json'
$globalSkill = Join-Path (Join-Path $homeClaude 'skills') 'dev-setup'
if (Test-Path -LiteralPath $globalSettings) {
  $gs = ''
  try { $gs = [System.IO.File]::ReadAllText($globalSettings) } catch { $gs = '' }
  if ($gs -match 'claude-opus-5-5') { Add-Check '전역 Claude 설정' 'OK' $globalSettings }
  else { Add-Check '전역 Claude 설정' '!' "$globalSettings 에 Opus 5.5 설정이 없음" 'Claude 안에서 /개발설정 을 실행하세요.' }
} else {
  Add-Check '전역 Claude 설정' 'X' '없음' 'Claude 안에서 /개발설정 을 실행하거나 scripts\setup-claude-dev.bat 을 더블클릭하세요.'
}
if (Test-Path -LiteralPath (Join-Path $globalSkill 'SKILL.md')) { Add-Check '/개발설정 스킬(전역)' 'OK' $globalSkill }
else { Add-Check '/개발설정 스킬(전역)' '!' '전역에 아직 등록되지 않음(이 저장소 안에서는 사용 가능)' 'scripts\setup-claude-dev.bat 을 한 번 실행하세요.' }

$projSettings = Join-Path $repo '.claude\settings.json'
if (Test-Path -LiteralPath $projSettings) { Add-Check '프로젝트 Claude 설정' 'OK' '.claude\settings.json, CLAUDE.md, .mcp.json' }
else { Add-Check '프로젝트 Claude 설정' 'X' '.claude\settings.json 없음' 'git pull 로 최신 저장소를 받으세요.' }

# ---------------------------------------------------------------- 빌드 도구(Windows 전용)
if (-not $isWin) {
  Add-Check '운영체제' '!' 'Windows 가 아님' '빌드·시험·앱 실행은 Windows PC 에서만 가능합니다(이 점검은 나머지를 건너뜀).'
} else {
  # OSGeo4W (dev-env.ps1 과 같은 순서)
  $osgeo = $null
  foreach ($c in @($env:OSGEO4W_ROOT, 'C:\OSGeo4W', 'D:\OSGeo4W', 'A:\OSGeo4W')) {
    if ($c -and (Test-Path -LiteralPath (Join-Path $c 'apps\qgis-dev\bin\qgis_core.dll'))) { $osgeo = $c; break }
  }
  if ($osgeo) { Add-Check 'OSGeo4W qgis-dev' 'OK' $osgeo }
  else { Add-Check 'OSGeo4W qgis-dev' 'X' 'C:\OSGeo4W, D:\OSGeo4W, A:\OSGeo4W, OSGEO4W_ROOT 어디에도 없음' 'docs\other-pc-setup.md 의 순서로 OSGeo4W(qgis-dev, Qt6)를 설치하세요(용량이 커서 자동 설치하지 않음).' }

  # Visual Studio C++
  $vsw = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
  $vsPath = $null
  if (Test-Path -LiteralPath $vsw) {
    try { $vsPath = (& $vsw -latest -version '[17.0,18.0)' -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null | Select-Object -First 1) } catch { $vsPath = $null }
  }
  if ($vsPath) { Add-Check 'Visual Studio 2022 C++' 'OK' $vsPath }
  else { Add-Check 'Visual Studio 2022 C++' 'X' '없음' 'Visual Studio 2022(또는 Build Tools)의 "C++를 사용한 데스크톱 개발" 워크로드를 설치하세요.' }

  # CMake
  $cmake = Get-App 'cmake'
  if (-not $cmake) { foreach ($d in @("${env:ProgramFiles}\CMake\bin", 'C:\CMake\bin')) { if (Test-Path -LiteralPath (Join-Path $d 'cmake.exe')) { $cmake = Join-Path $d 'cmake.exe'; break } } }
  if ($cmake) { Add-Check 'CMake' 'OK' (Get-FirstLine $cmake @('--version')) } else { Add-Check 'CMake' 'X' '없음' 'CMake 3.21 이상을 설치하세요(https://cmake.org).' }

  # Python
  $py = Get-App 'py'
  if (-not $py) { $py = Get-App 'python' }
  if ($py) { Add-Check 'Python' 'OK' (Get-FirstLine $py @('--version')) } else { Add-Check 'Python' '!' '없음' 'clangd 정의 조회(scripts\clangd-definition.py)와 비밀 검사에 필요합니다. Python 3 를 설치하세요.' }

  # clangd
  $clangd = Get-App 'clangd'
  if (-not $clangd -and (Test-Path -LiteralPath 'C:\Program Files\LLVM\bin\clangd.exe')) { $clangd = 'C:\Program Files\LLVM\bin\clangd.exe' }
  if ($clangd) { Add-Check 'clangd' 'OK' $clangd } else { Add-Check 'clangd' '!' '없음' 'LLVM(https://llvm.org)을 설치하면 clangd 가 함께 들어옵니다.' }

  # 저장소 도구
  if (Test-Path -LiteralPath (Join-Path $repo 'build\tooling\graft-source\dist\mcp\tools.js')) { Add-Check 'Graft 엔진' 'OK' 'build\tooling\graft-source' }
  else { Add-Check 'Graft 엔진' 'X' '설치 안 됨' 'scripts\setup-claude-dev.bat 을 실행하세요.' }

  $archifyNew = Join-Path $repo '.claude\skills\archify\bin\archify.mjs'
  $archifyOld = Join-Path $repo '.agents\skills\archify\bin\archify.mjs'
  if (Test-Path -LiteralPath $archifyNew) { Add-Check 'Archify(고정 리비전)' 'OK' '.claude\skills\archify' }
  elseif (Test-Path -LiteralPath $archifyOld) { Add-Check 'Archify(고정 리비전)' '!' '옛 위치(.agents\skills\archify)에 있음' 'scripts\setup-claude-dev.bat 으로 .claude\skills\archify 에 다시 설치하세요.' }
  else { Add-Check 'Archify(고정 리비전)' 'X' '설치 안 됨' 'scripts\setup-claude-dev.bat 을 실행하세요.' }

  if (Test-Path -LiteralPath (Join-Path $repo 'build\compile_commands.json')) { Add-Check 'clangd 컴파일 DB' 'OK' 'build\compile_commands.json' }
  else { Add-Check 'clangd 컴파일 DB' '!' '없음' 'scripts\gen-compile-commands.ps1 로 만드세요(Visual Studio 개발 셸 필요, 시간이 걸림).' }

  if (Test-Path -LiteralPath (Join-Path $repo 'build\CMakeCache.txt')) { Add-Check '빌드 구성' 'OK' 'build\CMakeCache.txt' }
  else { Add-Check '빌드 구성' '!' '아직 구성되지 않음' 'scripts\ka-build.ps1 을 실행하세요(첫 빌드는 오래 걸립니다).' }

  if (Test-Path -LiteralPath (Join-Path $repo 'build\Release\ka-hgis.exe')) { Add-Check 'ka-hgis.exe' 'OK' 'build\Release\ka-hgis.exe' }
  else { Add-Check 'ka-hgis.exe' '!' '아직 빌드되지 않음' 'scripts\ka-build.ps1 로 빌드하세요.' }

  # 실행 중인 앱
  $proc = Get-Process -Name 'ka-hgis' -ErrorAction SilentlyContinue
  if ($proc) { Add-Check '앱 실행 상태' '!' 'ka-hgis 가 실행 중입니다(smoke 시험·재빌드 전에 사용자가 닫아야 함)' '' }

  # 옛 자동화
  $task = $null
  try { $task = Get-ScheduledTask -TaskName 'ka-hgis-auto-git-push' -ErrorAction Stop } catch { $task = $null }
  if ($task) { Add-Check '옛 자동 푸시 예약 작업' '!' '"ka-hgis-auto-git-push" 가 등록되어 있음(30분마다 작업 폴더 전체를 원격 백업 브랜치로 강제 푸시)' '이 프로젝트 규칙(숨은 자동 푸시·force-push 금지)과 충돌합니다. 끄려면 scripts\uninstall-auto-push-task.ps1. 백업이 필요하면 먼저 알려 주세요.' }
  if ($git) {
    $hp = Get-FirstLine $git @('config', '--get', 'core.hooksPath')
    if ($hp) { Add-Check 'git 훅 경로' 'OK' "core.hooksPath=$hp (커밋 때 docs\COMMIT_STATUS.md 가 갱신될 수 있음)" }
  }
}

# ---------------------------------------------------------------- 출력
$bad = @($script:rows | Where-Object { $_.State -eq 'X' })
$warn = @($script:rows | Where-Object { $_.State -eq '!' })
$ok = @($script:rows | Where-Object { $_.State -eq 'OK' })

if ($Json) {
  $script:rows | ConvertTo-Json -Depth 3
  if ($bad.Count -gt 0) { exit 1 } else { exit 0 }
}

Write-Host ("ka-hgis 개발 환경 점검  (준비됨 {0} / 확인 필요 {1} / 없음 {2})" -f $ok.Count, $warn.Count, $bad.Count)
foreach ($r in $script:rows) {
  if ($Quick -and $r.State -eq 'OK') { continue }
  $tag = '[OK]'
  if ($r.State -eq 'X') { $tag = '[X] ' } elseif ($r.State -eq '!') { $tag = '[!] ' }
  Write-Host ("{0} {1}: {2}" -f $tag, $r.Name, $r.Detail)
  if ($r.Fix -and $r.State -ne 'OK') { Write-Host ("      -> {0}" -f $r.Fix) }
}
if ($bad.Count -eq 0 -and $warn.Count -eq 0) { Write-Host '모두 준비되었습니다.' }
elseif ($bad.Count -eq 0) { Write-Host '필수 항목은 준비되었습니다. [!] 항목은 필요할 때 처리하면 됩니다.' }
else { Write-Host '[X] 항목부터 위에서 아래 순서로 처리하세요.' }
if ($bad.Count -gt 0) { exit 1 }
exit 0
