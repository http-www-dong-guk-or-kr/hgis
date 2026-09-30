# ka-build.ps1 - ka-hgis 를 구성(없으면)하고 빌드한다. 전체 출력은 로그 파일에 저장하고 화면에는 요약만 보여 준다.
#   powershell -NoProfile -File scripts\ka-build.ps1 [-Target ka-hgis] [-Config Release] [-Reconfigure]
# 첫 전체 빌드는 10분이 넘을 수 있다. Claude 는 이 스크립트를 백그라운드로 돌리고 요약만 읽는다.
# 로그: build\qa\<날짜-시각>-build\build.log , 요약: 같은 폴더의 summary.txt
# 종료 코드: 0 성공 / 그 밖 실패.
param(
  [string]$Target = '',
  [string]$Config = 'Release',
  [switch]$Reconfigure
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'dev-env.ps1')

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outDir = Join-Path $repo ("build\qa\{0}-build" -f $stamp)
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$log = Join-Path $outDir 'build.log'
$summary = Join-Path $outDir 'summary.txt'
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$exitCode = 0
$step = ''

Push-Location $repo
try {
  $needConfigure = $Reconfigure -or -not (Test-Path -LiteralPath (Join-Path $repo 'build\CMakeCache.txt'))
  if ($needConfigure) {
    $step = '구성(cmake configure)'
    Write-Host "[구성] cmake 구성 중... 로그: $log"
    $cfg = @('-S', '.', '-B', 'build', '-G', 'Visual Studio 17 2022', '-A', 'x64', "-DOSGEO4W_ROOT=$env:OSGEO4W_ROOT", '-DKA_HGIS_BUILD_TESTS=ON')
    & cmake @cfg *>&1 | Out-File -FilePath $log -Encoding utf8
    $exitCode = $LASTEXITCODE
  }
  if ($exitCode -eq 0) {
    $step = '빌드(cmake --build)'
    Write-Host "[빌드] $Config 빌드 중... (오래 걸릴 수 있습니다) 로그: $log"
    $bld = @('--build', 'build', '--config', $Config, '--parallel')
    if ($Target) { $bld += @('--target', $Target) }
    & cmake @bld *>&1 | Out-File -FilePath $log -Encoding utf8 -Append
    $exitCode = $LASTEXITCODE
  }
} catch {
  $exitCode = 1
  ("스크립트 오류: " + $_.Exception.Message) | Out-File -FilePath $log -Encoding utf8 -Append
} finally {
  Pop-Location
}
$sw.Stop()
$secs = [int]$sw.Elapsed.TotalSeconds

$lines = @()
if ($exitCode -eq 0) {
  $lines += ("[결과] 빌드 성공 ({0}초) - {1}{2}" -f $secs, $Config, $(if ($Target) { " / 대상 $Target" } else { '' }))
  $exe = Join-Path $repo 'build\Release\ka-hgis.exe'
  if (Test-Path -LiteralPath $exe) { $lines += ("[실행 파일] {0} ({1:yyyy-MM-dd HH:mm})" -f $exe, (Get-Item -LiteralPath $exe).LastWriteTime) }
} else {
  $lines += ("[결과] 빌드 실패 - 단계: {0}, 종료 코드 {1}, {2}초" -f $step, $exitCode, $secs)
  $errs = @()
  if (Test-Path -LiteralPath $log) {
    $errs = @(Select-String -LiteralPath $log -Pattern 'error C\d+|error LNK\d+|fatal error|CMake Error|: error :' -ErrorAction SilentlyContinue | Select-Object -First 8)
  }
  if ($errs.Count -gt 0) {
    $lines += '[처음 나온 오류]'
    foreach ($e in $errs) { $lines += ('  ' + $e.Line.Trim()) }
  } elseif (Test-Path -LiteralPath $log) {
    $lines += '[로그 끝부분]'
    $lines += (Get-Content -LiteralPath $log -Tail 12 | ForEach-Object { '  ' + $_ })
  }
}
$lines += "[로그] $log"
$lines | Out-File -FilePath $summary -Encoding utf8
$lines | ForEach-Object { Write-Host $_ }
exit $exitCode
