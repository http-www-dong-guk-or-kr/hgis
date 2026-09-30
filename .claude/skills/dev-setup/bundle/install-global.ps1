# One-click global setup for Claude Code (general C++ development settings, not tied to any project).
# Double-click INSTALL-GLOBAL.bat (it runs this file). Windows PowerShell 5.1 compatible.
#   -Check : only show what would change (writes nothing)
param([switch]$Check)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
try { $OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$apply = Join-Path (Join-Path $here 'dev-setup') 'apply.mjs'
if (-not (Test-Path -LiteralPath $apply)) {
  # 저장소를 받아 .claude\skills\dev-setup\bundle 안에서 실행한 경우: 바로 위 폴더에 apply.mjs 가 있다
  $alt = Join-Path (Split-Path -Parent $here) 'apply.mjs'
  if (Test-Path -LiteralPath $alt) { $apply = $alt }
}

function Say([string]$Text, [string]$Color = 'White') { Write-Host $Text -ForegroundColor $Color }

Say ''
if ($Check) {
  Say '=== Claude Code 전역 개발설정: 미리보기(아무것도 바꾸지 않습니다) ===' 'Cyan'
} else {
  Say '=== Claude Code 전역 개발설정을 이 컴퓨터에 적용합니다 ===' 'Cyan'
}
Say '어느 프로젝트에서나 쓰는 범용 C++ 개발설정입니다(특정 프로젝트 전용 규칙 없음).'
Say ''

# 1) 설치 파일이 같이 있는지(ZIP 을 풀지 않고 실행하면 없다)
if (-not (Test-Path -LiteralPath $apply)) {
  Say '[X] 설치 파일(dev-setup 폴더)을 찾지 못했습니다.' 'Red'
  Say '    ZIP 파일을 먼저 "모두 압축 풀기"로 푼 다음, 풀린 폴더 안의 INSTALL-GLOBAL.bat 을 다시 실행하세요.'
  exit 2
}

# 2) Node.js (설치기와 안전 점검 훅이 Node.js 로 동작한다)
function Get-NodeMajor {
  $n = Get-Command node -ErrorAction SilentlyContinue
  if (-not $n) { return 0 }
  try {
    $v = (& node --version 2>$null | Out-String).Trim().TrimStart('v')
    return [int](($v -split '\.')[0])
  } catch { return 0 }
}

$major = Get-NodeMajor
if ($major -lt 18) {
  if ($major -eq 0) { Say '[!] Node.js 가 설치되어 있지 않습니다. 이 설정의 안전 점검 기능이 Node.js 로 동작하므로 필요합니다.' 'Yellow' }
  else { Say ('[!] Node.js 가 너무 오래되었습니다(v{0}). 18 이상이 필요합니다.' -f $major) 'Yellow' }
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($Check) {
    Say '    (미리보기 모드라 설치하지 않습니다. 적용하려면 Node.js LTS 가 필요합니다: https://nodejs.org)' 'Yellow'
    exit 3
  }
  if ($winget) {
    $ans = Read-Host '    Node.js LTS 를 지금 설치할까요? 설치 프로그램이 인터넷에서 받습니다. (Y/N)'
    if ($ans -match '^[Yy]') {
      & winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
      # 방금 설치한 Node.js 를 이 창에서도 찾도록 경로를 다시 읽는다
      $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
      $major = Get-NodeMajor
    }
  }
  if ($major -lt 18) {
    Say '[X] Node.js 를 사용할 수 없습니다. https://nodejs.org 에서 LTS 를 설치한 뒤 INSTALL-GLOBAL.bat 을 다시 실행하세요.' 'Red'
    exit 3
  }
}

# 3) 적용(이미 있는 내 설정은 유지하고, 바꾸는 파일은 백업본을 남긴다)
$argList = @($apply, '--scope', 'global')
if ($Check) { $argList += '--check' }

$prev = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& node @argList
$code = $LASTEXITCODE
$ErrorActionPreference = $prev

Say ''
if ($code -ne 0) {
  Say '[X] 적용하지 못했습니다. 위 메시지를 그대로 캡처해서 Claude 에게 보여 주세요.' 'Red'
  Say '    (흔한 원인: ~\.claude\settings.json 에 주석(//)이나 쉼표 오류가 있음 → 파일은 건드리지 않았습니다. 고친 뒤 다시 실행하세요.)'
  exit $code
}

if ($Check) {
  Say '위는 미리보기입니다. 적용하려면 INSTALL-GLOBAL.bat 을 더블클릭하세요.' 'Cyan'
  exit 0
}

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  Say '[안내] claude 명령이 이 창에서 보이지 않습니다. 설정 파일은 정상 적용됐고, Claude Code 를 실행하는 곳에서 적용됩니다.' 'Yellow'
}
Say '완료했습니다.' 'Green'
Say '다음 할 일: Claude Code 를 완전히 종료했다가 다시 실행하세요.'
Say '확인: Claude Code 에서 /status 를 입력하면 모델이 Opus 5.5 로 보이고, /개발설정 명령을 어느 프로젝트에서나 쓸 수 있습니다.'
Say '되돌리기: 이미 설정이 있던 파일은 바뀐 파일 옆에 .bak-날짜 백업이 생깁니다. 그 이름에서 .bak-... 부분을 지우면 원래 상태입니다.'
exit 0
