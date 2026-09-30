# ka-test.ps1 - ctest 를 영역별로 돌리고 "알려진 실패(docs\ctest-baseline.txt)"와 비교해 새 실패만 실패로 센다.
#   powershell -NoProfile -File scripts\ka-test.ps1 -Area save
#   powershell -NoProfile -File scripts\ka-test.ps1 -Regex '^(workflow_engine|save_open_edit)$'
#   powershell -NoProfile -File scripts\ka-test.ps1 -All          # 전체(약 220~290초, 백그라운드 권장)
#   powershell -NoProfile -File scripts\ka-test.ps1 -ListAreas    # 영역 이름 목록
# 로그: build\qa\<날짜-시각>-test\ctest.log , 요약: 같은 폴더의 summary.txt
# 종료 코드: 0 = 새 실패 없음 / 1 = 새 실패 있음 / 2 = 시험을 돌리지 못함(빌드 없음·영역 이름 오류 등)
param(
  [string]$Area = '',
  [string]$Regex = '',
  [switch]$All,
  [switch]$ListAreas,
  [string]$Config = 'Release'
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot

# 영역 -> ctest 이름 정규식 (docs\testing-map.md, ka-hgis-gis 스킬의 task-map, .claude\rules\tests.md 근거)
$areas = [ordered]@{
  'save'       = '^(storage_safety|save_open_)'
  'storage'    = '^storage_safety$'
  'sheet'      = '^(workflow_engine|heritage_style|save_open_drawing|layer_state_regressions)$'
  'heritage-number' = '^heritage_style$'
  'align'      = '^(workflow_engine|dem_trench_engine|layer_state_regressions|save_open_edit|cadastral)$'
  'crs-export' = '^(export_survey_areas|topographic_source_crs|checklist_engine)$'
  'topo'       = '^topographic_'
  'heritage'   = '^heritage_'
  'section'    = '^section_'
  'edit'       = '^(workflow_engine|save_open_edit)$'
  'perf'       = '^(perf_engine|parallel_render)$'
  'contour'    = '^survey_contour$'
  'dem'        = '^dem_'
  'layers'     = '^(layer_labels|layer_information|layer_state_regressions)$'
  'ui'         = '^(theme_qss|layer_information|above_labels|startup_splash)'
  'network'    = '^(network_services|reference_download|download_ui|heritage_download_retry)$'
  'source-text' = '^(workflow_engine|dem_trench_engine|georef_engine|parallel_render|recent_surveys|terrain_3d_engine|theme_qss|catch_log)$'
}

if ($ListAreas) {
  Write-Host '영역 이름과 ctest 정규식:'
  foreach ($k in $areas.Keys) { Write-Host ("  {0,-16} {1}" -f $k, $areas[$k]) }
  Write-Host '  (source-text = 소스 파일을 텍스트로 읽는 구조 시험 전부. 함수를 옮기거나 이름을 바꾼 뒤에 돌린다.)'
  exit 0
}

$pattern = ''
if ($All) { $pattern = '' }
elseif ($Regex) { $pattern = $Regex }
elseif ($Area) {
  if (-not $areas.Contains($Area)) {
    Write-Host ("[오류] 알 수 없는 영역: {0}. -ListAreas 로 목록을 보세요." -f $Area)
    exit 2
  }
  $pattern = $areas[$Area]
} else {
  Write-Host '[오류] -Area <이름> | -Regex <정규식> | -All 중 하나를 지정하세요. (-ListAreas 로 영역 목록)'
  exit 2
}

if (-not (Test-Path -LiteralPath (Join-Path $repo 'build\CMakeCache.txt'))) {
  Write-Host '[오류] 아직 빌드되지 않았습니다. 먼저 scripts\ka-build.ps1 을 실행하세요.'
  exit 2
}

. (Join-Path $PSScriptRoot 'dev-env.ps1')

# 기준선 읽기
$known = @{}
$flaky = @{}
$baselinePath = Join-Path $repo 'docs\ctest-baseline.txt'
if (Test-Path -LiteralPath $baselinePath) {
  foreach ($line in Get-Content -LiteralPath $baselinePath) {
    $t = $line.Trim()
    if (-not $t -or $t.StartsWith('#')) { continue }
    if ($t.StartsWith('~')) { $flaky[$t.Substring(1).Trim()] = $true } else { $known[$t] = $true }
  }
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outDir = Join-Path $repo ("build\qa\{0}-test" -f $stamp)
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$log = Join-Path $outDir 'ctest.log'
$summary = Join-Path $outDir 'summary.txt'

function Invoke-Ctest([string]$regexArg, [string]$logPath) {
  $a = @('--test-dir', 'build', '-C', $Config, '--output-on-failure', '--output-log', $logPath)
  if ($regexArg) { $a += @('-R', $regexArg) }
  & ctest @a *>&1 | Out-Null
  return $LASTEXITCODE
}

function Read-Results([string]$logPath) {
  $r = [pscustomobject]@{ Total = 0; Passed = 0; Failed = @(); NoTests = $false }
  if (-not (Test-Path -LiteralPath $logPath)) { return $r }
  $text = Get-Content -LiteralPath $logPath -Raw
  if ($text -match 'No tests were found') { $r.NoTests = $true }
  if ($text -match '(\d+)% tests passed, (\d+) tests failed out of (\d+)') {
    $r.Total = [int]$Matches[3]
    $r.Passed = $r.Total - [int]$Matches[2]
  }
  $names = @()
  foreach ($m in [regex]::Matches($text, '(?m)^\s*\d+\s*-\s*(\S+)\s+\((Failed|Timeout|SEGFAULT|Exception|Not Run|Subprocess aborted|Child aborted)[^)]*\)')) {
    $names += $m.Groups[1].Value
  }
  $r.Failed = @($names | Select-Object -Unique)
  return $r
}

Push-Location $repo
$sw = [System.Diagnostics.Stopwatch]::StartNew()
try {
  $code = Invoke-Ctest $pattern $log
} finally {
  Pop-Location
}
$res = Read-Results $log

# 흔들림 후보만 실패했으면 그 시험만 한 번 다시 돌려 본다.
$rerun = @()
$onlyFlaky = ($res.Failed.Count -gt 0) -and (@($res.Failed | Where-Object { -not $flaky.ContainsKey($_) -and -not $known.ContainsKey($_) }).Count -eq 0)
$flakyFailed = @($res.Failed | Where-Object { $flaky.ContainsKey($_) })
if ($flakyFailed.Count -gt 0) {
  $rx = '^(' + ($flakyFailed -join '|') + ')$'
  $log2 = Join-Path $outDir 'ctest-rerun.log'
  Push-Location $repo
  try { [void](Invoke-Ctest $rx $log2) } finally { Pop-Location }
  $res2 = Read-Results $log2
  foreach ($n in $flakyFailed) {
    if ($res2.Failed -notcontains $n) { $rerun += $n }
  }
}
$sw.Stop()
$secs = [int]$sw.Elapsed.TotalSeconds

$stillFailed = @($res.Failed | Where-Object { $rerun -notcontains $_ })
$newFail = @($stillFailed | Where-Object { -not $known.ContainsKey($_) -and -not $flaky.ContainsKey($_) })
$knownFail = @($stillFailed | Where-Object { $known.ContainsKey($_) })
$flakyStill = @($stillFailed | Where-Object { $flaky.ContainsKey($_) })

$lines = @()
if ($res.NoTests) {
  $lines += "[결과] 시험을 찾지 못했습니다(정규식: $pattern). ctest --test-dir build -C $Config -N 으로 이름을 확인하세요."
  $lines | Out-File -FilePath $summary -Encoding utf8
  $lines | ForEach-Object { Write-Host $_ }
  exit 2
}
if ($res.Total -eq 0 -and $code -ne 0) {
  $lines += ("[결과] ctest 가 시험을 돌리지 못했습니다(종료 코드 {0}). 로그를 확인하세요." -f $code)
  $lines += "[로그] $log"
  $lines | Out-File -FilePath $summary -Encoding utf8
  $lines | ForEach-Object { Write-Host $_ }
  exit 2
}

$verdict = '새 실패 없음'
$exit = 0
if ($newFail.Count -gt 0 -or $flakyStill.Count -gt 0) { $verdict = '새 실패 있음'; $exit = 1 }
$lines += ("[결과] {0} - 전체 {1}개 중 통과 {2}, 실패 {3} ({4}초)" -f $verdict, $res.Total, $res.Passed, $res.Failed.Count, $secs)
if ($pattern) { $lines += "[범위] -R '$pattern'" } else { $lines += '[범위] 전체' }
if ($newFail.Count -gt 0) { $lines += ('[새 실패] ' + ($newFail -join ', ') + '  <- 이 변경 때문인지 먼저 확인하세요') }
if ($flakyStill.Count -gt 0) { $lines += ('[시간 흔들림 후보가 다시 돌려도 실패] ' + ($flakyStill -join ', ')) }
if ($knownFail.Count -gt 0) { $lines += ('[알려진 실패(기준선)] ' + ($knownFail -join ', ')) }
if ($rerun.Count -gt 0) { $lines += ('[흔들림 후보, 다시 돌리니 통과] ' + ($rerun -join ', ')) }
$lines += "[로그] $log"
$lines | Out-File -FilePath $summary -Encoding utf8
$lines | ForEach-Object { Write-Host $_ }
exit $exit
