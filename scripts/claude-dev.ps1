# claude-dev.ps1 - Claude Code 를 이 저장소 루트에서 "개발 환경이 준비된 셸"로 시작한다.
#   더블클릭: scripts\claude-dev.bat      직접: powershell -NoProfile -File scripts\claude-dev.ps1 [claude 인자...]
# 하는 일: 저장소 루트로 이동 -> OSGeo4W/CMake 환경 준비(dev-env.ps1) -> Claude Code 설치·버전 확인 ->
#          처음이면 전역 개발설정 적용 -> claude 시작. 환경변수는 claude 와 그 자식 프로세스(빌드·시험)가 그대로 물려받는다.
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ClaudeArgs
)

$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo

Write-Host '=== 고고학 전용 HGIS - Claude Code 개발 시작 ==='
Write-Host ("저장소: {0}" -f $repo)

# 1) 개발 환경 준비(실패해도 Claude 는 시작한다: 설명·문서 작업은 빌드 환경 없이도 가능)
$envOk = $true
try {
  . (Join-Path $PSScriptRoot 'dev-env.ps1')
} catch {
  $envOk = $false
  Write-Host ("[!] 빌드 환경을 준비하지 못했습니다: {0}" -f $_.Exception.Message)
  Write-Host '    빌드·시험은 못 하지만 Claude 는 시작합니다. 나중에 Claude 에게 /ka-doctor 를 시키면 설치 방법을 알려 줍니다.'
}

# 2) Node.js (Claude Code 훅·Graft·Archify 가 사용)
if (-not (Get-Command node -CommandType Application -ErrorAction SilentlyContinue)) {
  Write-Host '[!] Node.js 가 PATH 에 없습니다. 훅(안전 점검·검증 게이트)과 Graft 가 동작하지 않습니다. Node.js 22 LTS 를 설치하세요.'
}

# 3) Claude Code 찾기
$claudeCmd = Get-Command claude -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
$claudePath = $null
if ($claudeCmd) { $claudePath = $claudeCmd.Source }
if (-not $claudePath) {
  foreach ($c in @((Join-Path $env:USERPROFILE '.local\bin\claude.exe'), (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\claude.exe'))) {
    if (Test-Path -LiteralPath $c) { $claudePath = $c; break }
  }
}
if (-not $claudePath) {
  Write-Host ''
  Write-Host '[X] Claude Code 가 설치되어 있지 않습니다. PowerShell 에서 아래 한 줄을 실행한 뒤 이 아이콘을 다시 누르세요:'
  Write-Host '      irm https://claude.ai/install.ps1 | iex'
  Write-Host '    (또는: winget install Anthropic.ClaudeCode)'
  Read-Host 'Enter 를 누르면 닫힙니다'
  exit 1
}

# 4) 버전 확인(Opus 5.5 는 2.1.280 이상)
$verText = ''
try { $verText = (& $claudePath --version 2>&1 | Select-Object -First 1) } catch { $verText = '' }
$needUpdate = $false
if ("$verText" -match '(\d+)\.(\d+)\.(\d+)') {
  $v = New-Object System.Version ([int]$Matches[1]), ([int]$Matches[2]), ([int]$Matches[3])
  if ($v -lt (New-Object System.Version 2, 1, 280)) { $needUpdate = $true }
  Write-Host ("Claude Code {0}" -f $v)
}
if ($needUpdate) {
  Write-Host '[!] Claude Code 가 오래되어 Opus 5.5 를 쓸 수 없습니다. 최신 버전으로 올립니다(claude update)...'
  try { & $claudePath update } catch { Write-Host ("    업데이트 실패: {0}. PowerShell 에서 직접 claude update 를 실행하세요." -f $_.Exception.Message) }
}

# 5) 처음이면 전역 개발설정 적용(멱등·백업: 이미 있으면 아무것도 바꾸지 않는다)
$homeClaude = Join-Path $env:USERPROFILE '.claude'
$firstRun = -not (Test-Path -LiteralPath (Join-Path $homeClaude 'skills\dev-setup\SKILL.md'))
$apply = Join-Path $repo '.claude\skills\dev-setup\apply.mjs'
if ($firstRun -and (Test-Path -LiteralPath $apply) -and (Get-Command node -CommandType Application -ErrorAction SilentlyContinue)) {
  Write-Host '처음 실행이라 전역 개발설정(모델 Opus 5.5·안전 점검·상태 줄)을 적용합니다...'
  try { & node $apply --scope global --project $repo } catch { Write-Host ("    적용 실패: {0}. Claude 안에서 /개발설정 을 실행하면 다시 시도합니다." -f $_.Exception.Message) }
}

Write-Host ''
if ($envOk) { Write-Host '개발 환경이 준비되었습니다. Claude Code 를 시작합니다. (도움말: /ka-help)' }
else { Write-Host 'Claude Code 를 시작합니다. (도움말: /ka-help, 환경 점검: /ka-doctor)' }
Write-Host ''

& $claudePath @ClaudeArgs
exit $LASTEXITCODE
