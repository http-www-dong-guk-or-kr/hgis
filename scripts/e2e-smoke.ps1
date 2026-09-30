$ErrorActionPreference = "Continue"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root
. "$root\scripts\dev-env.ps1"
$ev = Join-Path $root "build\qa\e2e"
New-Item -ItemType Directory -Force -Path $ev | Out-Null
$log = Join-Path $ev "task-10-e2e.txt"
function Log([string]$m) { Add-Content -LiteralPath $log -Value $m; Write-Host $m }
Set-Content -LiteralPath $log -Value "=== ka-hgis-next e2e ===" -Encoding utf8
Log "root=$root"
$rules = Join-Path $root "data\rules\drawing_checklist.v1.json"
if (-not (Test-Path $rules)) { Log "FAIL rules"; exit 1 }
Log "OK rules"
if (-not (Test-Path "$root\docs\architecture\data-flow.md")) { Log "FAIL graph"; exit 1 }
Log "OK graph"
$hits = Get-ChildItem "$root\src" -Recurse -Include *.cpp,*.h | Select-String -Pattern "D:/qgis" -SimpleMatch
if ($hits) { Log "FAIL hardcode"; exit 1 }
Log "OK no hardcode"
$testExe = Join-Path $root "build\Release\ka_hgis_tests.exe"
if (-not (Test-Path $testExe)) { Log "FAIL tests missing"; exit 1 }
$p = Start-Process -FilePath $testExe -WorkingDirectory $root -Wait -PassThru -NoNewWindow -RedirectStandardOutput (Join-Path $ev "t-out.txt") -RedirectStandardError (Join-Path $ev "t-err.txt")
if ($p.ExitCode -ne 0) { Log "FAIL unit $($p.ExitCode)"; exit $p.ExitCode }
Log "OK unit tests"
$wf = Join-Path $root "build\Release\ka_workflow_tests.exe"
if (Test-Path $wf) {
  $pw = Start-Process -FilePath $wf -WorkingDirectory $root -Wait -PassThru -NoNewWindow -RedirectStandardOutput (Join-Path $ev "wf-out.txt") -RedirectStandardError (Join-Path $ev "wf-err.txt")
  if ($pw.ExitCode -ne 0) { Log "FAIL workflow $($pw.ExitCode)"; exit $pw.ExitCode }
  Log "OK workflow tests"
} else { Log "SKIP workflow tests missing" }
$app = Join-Path $root "build\Release\ka-hgis.exe"
$p2 = Start-Process -FilePath $app -ArgumentList "--smoke-quit" -WorkingDirectory (Split-Path $app) -Wait -PassThru -NoNewWindow -RedirectStandardOutput (Join-Path $ev "a-out.txt") -RedirectStandardError (Join-Path $ev "a-err.txt")
if ($p2.ExitCode -ne 0) { Log "FAIL smoke $($p2.ExitCode)"; exit $p2.ExitCode }
Log "OK smoke-quit"
$j = Get-Content $rules -Raw | ConvertFrom-Json
if ($j.rules.Count -lt 12) { Log "FAIL rules count"; exit 1 }
Log "OK rule_count=$($j.rules.Count)"
Log "E2E PASS"
exit 0

