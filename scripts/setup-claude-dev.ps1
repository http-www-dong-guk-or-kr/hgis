# setup-claude-dev.ps1 - 새 PC 에서 한 번 실행하는 Claude Code 개발 환경 설치.
#   더블클릭: scripts\setup-claude-dev.bat     직접: powershell -NoProfile -File scripts\setup-claude-dev.ps1 [옵션]
# 하는 일(각 단계는 이미 되어 있으면 건너뛴다. 여러 번 실행해도 안전하다):
#   1) 전역 Claude 개발설정 적용(.claude\skills\dev-setup\apply.mjs: 백업·병합, 내 설정 보존)
#   2) Archify 고정 리비전 설치(.claude\skills\archify, 저장소에는 커밋하지 않음)
#   3) Graft 엔진 설치(scripts\setup-graft.ps1: 고정 커밋, Visual Studio C++ 도구·Python 필요)
#   4) (선택) clangd 컴파일 DB 생성
#   5) 바탕화면에 "Claude 개발 (ka-hgis)" 바로가기 만들기
#   6) 옛 자동 푸시 예약 작업이 있으면 알려 주고 지울지 묻기(묻지 않고 지우지 않는다)
# 옵션: -SkipArchify -SkipGraft -NoShortcut -CompileCommands
param(
  [switch]$SkipArchify,
  [switch]$SkipGraft,
  [switch]$NoShortcut,
  [switch]$CompileCommands
)

$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo

$archifyRepo = 'https://github.com/tt-a1i/archify.git'
$archifyRev = 'a07fa1d5b2a10cbea110c5a2be2817397a301cdc'

function Write-Step([string]$text) { Write-Host ''; Write-Host ("== {0}" -f $text) }
function Have([string]$name) { return [bool](Get-Command $name -CommandType Application -ErrorAction SilentlyContinue) }

$results = New-Object System.Collections.ArrayList
function Add-Result([string]$what, [string]$state, [string]$detail) { [void]$results.Add([pscustomobject]@{ What = $what; State = $state; Detail = $detail }) }

Write-Host '=== Claude Code 개발 환경 설치 (고고학 전용 HGIS) ==='
Write-Host ("저장소: {0}" -f $repo)

$haveNode = Have 'node'
$haveGit = Have 'git'
if (-not $haveNode) { Write-Host '[X] Node.js 가 없습니다. Node.js 22 LTS 를 먼저 설치하세요(훅·Graft·Archify 가 사용).' }
if (-not $haveGit) { Write-Host '[X] Git 이 없습니다. Git for Windows 를 먼저 설치하세요.' }

# ---------------------------------------------------------------- 1) 전역 설정
Write-Step '1) 전역 Claude 개발설정'
$apply = Join-Path $repo '.claude\skills\dev-setup\apply.mjs'
if ($haveNode -and (Test-Path -LiteralPath $apply)) {
  & node $apply --scope global --project $repo
  if ($LASTEXITCODE -eq 0) { Add-Result '전역 개발설정' 'OK' '~\.claude 에 적용됨(백업은 *.bak-날짜)' }
  else { Add-Result '전역 개발설정' 'X' ("apply.mjs 종료 코드 {0}" -f $LASTEXITCODE) }
} else {
  Add-Result '전역 개발설정' 'X' 'Node.js 또는 apply.mjs 없음'
}

# ---------------------------------------------------------------- 2) Archify
Write-Step '2) Archify(구조도 도구, 고정 리비전)'
$archDest = Join-Path $repo '.claude\skills\archify'
$archCli = Join-Path $archDest 'bin\archify.mjs'
if ($SkipArchify) {
  Add-Result 'Archify' '!' '건너뜀(-SkipArchify)'
} elseif (Test-Path -LiteralPath $archCli) {
  Add-Result 'Archify' 'OK' '이미 설치됨'
} elseif (-not ($haveGit -and $haveNode)) {
  Add-Result 'Archify' 'X' 'Git 과 Node.js 가 필요합니다'
} else {
  try {
    $src = Join-Path $repo 'build\tooling\archify-src'
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $src) | Out-Null
    if (-not (Test-Path -LiteralPath $src)) {
      & git clone --no-checkout $archifyRepo $src
      if ($LASTEXITCODE -ne 0) { throw 'archify 저장소를 받지 못했습니다(네트워크 확인).' }
    }
    & git -C $src fetch --quiet origin
    & git -C $src checkout --quiet --detach $archifyRev
    if ($LASTEXITCODE -ne 0) { throw '고정 리비전 체크아웃에 실패했습니다.' }
    $head = (& git -C $src rev-parse HEAD).Trim()
    if ($head -ne $archifyRev) { throw ("예상과 다른 리비전입니다: {0}" -f $head) }
    $inner = Join-Path $src 'archify'
    if (-not (Test-Path -LiteralPath (Join-Path $inner 'bin\archify.mjs'))) { throw 'archify 폴더 구조가 예상과 다릅니다(bin\archify.mjs 없음).' }
    if (Test-Path -LiteralPath $archDest) { Remove-Item -LiteralPath $archDest -Recurse -Force }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $archDest) | Out-Null
    Copy-Item -LiteralPath $inner -Destination $archDest -Recurse
    & (Join-Path $PSScriptRoot 'archify.ps1') doctor
    if ($LASTEXITCODE -eq 0) { Add-Result 'Archify' 'OK' ("고정 리비전 {0} 설치, doctor 통과" -f $archifyRev.Substring(0, 8)) }
    else { Add-Result 'Archify' '!' 'doctor 가 경고/실패를 냈습니다(Chrome 이 없으면 visual-check 만 안 됨)' }
  } catch {
    Add-Result 'Archify' 'X' $_.Exception.Message
  }
}

# ---------------------------------------------------------------- 3) Graft
Write-Step '3) Graft(정의 검색 MCP 서버 엔진)'
$graftTools = Join-Path $repo 'build\tooling\graft-source\dist\mcp\tools.js'
if ($SkipGraft) {
  Add-Result 'Graft' '!' '건너뜀(-SkipGraft)'
} elseif (Test-Path -LiteralPath $graftTools) {
  Add-Result 'Graft' 'OK' '이미 설치됨'
} elseif (-not $haveNode -or -not $haveGit) {
  Add-Result 'Graft' 'X' 'Git 과 Node.js(npm)가 필요합니다'
} else {
  try {
    & (Join-Path $PSScriptRoot 'setup-graft.ps1')
    if (Test-Path -LiteralPath $graftTools) { Add-Result 'Graft' 'OK' '고정 커밋 설치 완료' }
    else { Add-Result 'Graft' 'X' '설치 스크립트가 끝났지만 dist\mcp\tools.js 가 없습니다' }
  } catch {
    Add-Result 'Graft' 'X' ("{0} (Visual Studio C++ 도구와 Python 이 필요합니다)" -f $_.Exception.Message)
  }
}

# ---------------------------------------------------------------- 4) 컴파일 DB(선택)
if ($CompileCommands) {
  Write-Step '4) clangd 컴파일 DB(build\compile_commands.json)'
  try {
    & (Join-Path $PSScriptRoot 'gen-compile-commands.ps1')
    if (Test-Path -LiteralPath (Join-Path $repo 'build\compile_commands.json')) { Add-Result '컴파일 DB' 'OK' 'build\compile_commands.json' }
    else { Add-Result '컴파일 DB' 'X' '생성되지 않음' }
  } catch {
    Add-Result '컴파일 DB' 'X' $_.Exception.Message
  }
}

# ---------------------------------------------------------------- 5) 바탕화면 바로가기
Write-Step '5) 바탕화면 바로가기'
if ($NoShortcut) {
  Add-Result '바로가기' '!' '건너뜀(-NoShortcut)'
} else {
  try {
    $desktop = [Environment]::GetFolderPath('Desktop')
    $lnk = Join-Path $desktop 'Claude 개발 (ka-hgis).lnk'
    $ws = New-Object -ComObject WScript.Shell
    $sc = $ws.CreateShortcut($lnk)
    $sc.TargetPath = Join-Path $repo 'scripts\claude-dev.bat'
    $sc.WorkingDirectory = $repo
    $sc.Description = '고고학 전용 HGIS - Claude Code 개발 시작'
    $sc.Save()
    Add-Result '바로가기' 'OK' $lnk
  } catch {
    Add-Result '바로가기' '!' ("만들지 못함: {0}" -f $_.Exception.Message)
  }
}

# ---------------------------------------------------------------- 6) 옛 자동 푸시 예약 작업
Write-Step '6) 옛 자동화 점검'
$task = $null
try { $task = Get-ScheduledTask -TaskName 'ka-hgis-auto-git-push' -ErrorAction Stop } catch { $task = $null }
if ($task) {
  Write-Host '[!] 예약 작업 "ka-hgis-auto-git-push" 가 등록되어 있습니다.'
  Write-Host '    30분마다 작업 폴더 전체를 원격 백업 브랜치(backup/auto-save)로 강제 푸시하는 옛 자동화입니다.'
  Write-Host '    이 프로젝트 규칙(숨은 자동 푸시 금지, force-push 금지)과 충돌하고, 계정 파일이 섞여 올라갈 위험이 있습니다.'
  $ans = Read-Host '    지울까요? (y = 지움 / 그 밖 = 그대로 둠)'
  if ($ans -match '^[yY]') {
    & (Join-Path $PSScriptRoot 'uninstall-auto-push-task.ps1')
    Add-Result '옛 자동 푸시' 'OK' '예약 작업을 지웠습니다'
  } else {
    Add-Result '옛 자동 푸시' '!' '그대로 둠(원격 백업이 필요한 경우일 수 있어 사용자가 결정)'
  }
} else {
  Add-Result '옛 자동 푸시' 'OK' '예약 작업 없음'
}

# ---------------------------------------------------------------- 요약
Write-Host ''
Write-Host '=== 설치 결과 ==='
foreach ($r in $results) {
  $tag = '[OK]'
  if ($r.State -eq 'X') { $tag = '[X] ' } elseif ($r.State -eq '!') { $tag = '[!] ' }
  Write-Host ("{0} {1}: {2}" -f $tag, $r.What, $r.Detail)
}
Write-Host ''
Write-Host '--- 환경 점검 ---'
& (Join-Path $PSScriptRoot 'ka-doctor.ps1') -Quick
Write-Host ''
Write-Host '다음 할 일: 바탕화면 "Claude 개발 (ka-hgis)" 아이콘(또는 scripts\claude-dev.bat)으로 Claude Code 를 시작하세요.'
$bad = @($results | Where-Object { $_.State -eq 'X' })
if ($bad.Count -gt 0) { exit 1 }
exit 0
