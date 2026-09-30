# Check that this PC's Node matches dev-env.lock.json and that the Claude Code Graft wiring is in place.
# Claude Code reads Graft from the committed .mcp.json (server hgis_graft), so nothing is written outside the repo now.
# The old version of this script also wrote Codex (.codex/config.toml) and Cursor (~/.cursor/mcp.json) MCP files; that is gone.
# To install everything (global settings, Graft, Archify, desktop icon) run scripts\setup-claude-dev.bat instead.
#
#   .\scripts\setup-dev-paths.ps1
param()

$ErrorActionPreference = "Stop"
$Repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw "node not found. Graft needs the Node major in dev-env.lock.json." }

$lockPath = Join-Path $Repo "dev-env.lock.json"
if (Test-Path -LiteralPath $lockPath) {
  try {
    $lock = Get-Content -LiteralPath $lockPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $lockNode = [string]$lock.tools.node
    $hereNode = (& node --version).Trim().TrimStart("v")
    $lockMajor = ($lockNode -split '\.')[0]
    $hereMajor = ($hereNode -split '\.')[0]
    if ($lockMajor -and $hereMajor -and $lockMajor -ne $hereMajor) {
      Write-Host ("[경고] Node 주 판이 잠금과 다르다: 잠금 {0} / 이 PC {1}. Graft는 잠금 주 판이 필요하다." -f $lockNode, $hereNode) -ForegroundColor Yellow
    }
  } catch {
    Write-Host ("[경고] dev-env.lock.json 의 Node 판을 읽지 못했다: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
  }
}

$mcpJson = Join-Path $Repo ".mcp.json"
if (Test-Path -LiteralPath $mcpJson) {
  Write-Host ("[같음] Claude Code Graft 연결: {0} (서버 hgis_graft)" -f $mcpJson) -ForegroundColor Green
} else {
  Write-Host ("[경고] .mcp.json 이 없다: {0}. git 에서 다시 받으세요." -f $mcpJson) -ForegroundColor Yellow
}

$graftTools = Join-Path $Repo "build\tooling\graft-source\dist\mcp\tools.js"
if (Test-Path -LiteralPath $graftTools) {
  Write-Host "[같음] Graft 엔진이 설치되어 있다." -ForegroundColor Green
} else {
  Write-Host "[안내] Graft 엔진이 아직 없다. .\scripts\setup-claude-dev.bat 을 실행하면 고정 판으로 설치한다." -ForegroundColor Yellow
}
Write-Host ("Graft cwd: {0}" -f $Repo)
