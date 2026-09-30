# Run the pinned project-local Archify skill without changing global settings.
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ArchifyArgs
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
# Claude Code skill location first; the old Codex/Cursor location (.agents) is still honored if it exists.
$cli = Join-Path $repoRoot '.claude\skills\archify\bin\archify.mjs'
if (-not (Test-Path -LiteralPath $cli -PathType Leaf)) {
  $cli = Join-Path $repoRoot '.agents\skills\archify\bin\archify.mjs'
}
if (-not (Test-Path -LiteralPath $cli -PathType Leaf)) {
  throw 'Project-local Archify is missing. Run scripts\setup-claude-dev.bat (or follow docs/archify-setup.md) to install the pinned revision into .claude\skills\archify.'
}
$nodeCommand = Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $nodeCommand) {
  throw 'Node.js >=18 is required for Archify. Add Node.js to PATH, then run scripts/archify.ps1 doctor.'
}

$previousUpdateCheck = $env:ARCHIFY_UPDATE_CHECK_DISABLED
$previousTemp = $env:TEMP
$previousTmp = $env:TMP
$toolTemp = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'build\tooling\tmp'))
New-Item -ItemType Directory -Force -Path $toolTemp | Out-Null
Push-Location $repoRoot
try {
  $env:ARCHIFY_UPDATE_CHECK_DISABLED = '1'
  $env:TEMP = $toolTemp
  $env:TMP = $toolTemp
  & $nodeCommand.Source $cli @ArchifyArgs
  $archifyExitCode = $LASTEXITCODE
} finally {
  $env:ARCHIFY_UPDATE_CHECK_DISABLED = $previousUpdateCheck
  $env:TEMP = $previousTemp
  $env:TMP = $previousTmp
  Pop-Location
}
exit $archifyExitCode
