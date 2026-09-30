# ka-smoke.ps1 - 앱 시작 검사(run-ka-hgis.ps1 --smoke-quit). 사용자의 실행 중인 앱은 절대 끄지 않는다.
#   powershell -NoProfile -File scripts\ka-smoke.ps1
# 종료 코드: 0 = 시작·종료 성공 / 3 = 앱이 실행 중이라 건너뜀(검사를 하지 못한 것이므로 통과로 보고하지 말 것) / 그 밖 = 실패
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot

$running = Get-Process -Name 'ka-hgis' -ErrorAction SilentlyContinue
if ($running) {
  Write-Host '[건너뜀] ka-hgis 가 이미 실행 중입니다. 사용자의 앱을 끄지 않으므로 smoke 검사를 하지 않았습니다.'
  Write-Host '         앱을 닫은 뒤 다시 실행하거나, 이 검사는 "하지 못함"으로 보고하세요.'
  exit 3
}
$exe = Join-Path $repo 'build\Release\ka-hgis.exe'
if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) {
  Write-Host '[오류] build\Release\ka-hgis.exe 가 없습니다. 먼저 scripts\ka-build.ps1 로 빌드하세요.'
  exit 2
}

$sw = [System.Diagnostics.Stopwatch]::StartNew()
& (Join-Path $PSScriptRoot 'run-ka-hgis.ps1') --smoke-quit
$code = $LASTEXITCODE
$sw.Stop()
if ($code -eq 0) { Write-Host ("[결과] smoke 통과: 앱이 시작하고 정상 종료했습니다 (종료 코드 0, {0:N1}초)" -f $sw.Elapsed.TotalSeconds) }
else { Write-Host ("[결과] smoke 실패: 종료 코드 {0} ({1:N1}초). 앱 로그는 build\test-logs 또는 %LOCALAPPDATA%\ka-hgis 아래에 있을 수 있습니다." -f $code, $sw.Elapsed.TotalSeconds) }
exit $code
