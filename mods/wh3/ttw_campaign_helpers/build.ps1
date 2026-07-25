# Build ttw_campaign_helpers.pack from src/ (requires RPFM CLI + WH3 schema).

$ErrorActionPreference = "Stop"

$schema = "$env:APPDATA\FrodoWazEre\rpfm\config\schemas\schema_wh3.ron"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $root "src"
$pack = Join-Path $root "ttw_campaign_helpers.pack"
$rpfm = if ($env:TTW_RPFM_CLI) { $env:TTW_RPFM_CLI } else { "D:\Life\rpfm\rpfm_cli.exe" }

if (-not (Test-Path $rpfm)) { throw "RPFM CLI not found: $rpfm (set TTW_RPFM_CLI)" }
if (-not (Test-Path $schema)) { throw "WH3 schema not found: $schema" }
if (-not (Test-Path $src)) { throw "Source folder missing: $src" }

Remove-Item $pack -ErrorAction SilentlyContinue
& $rpfm --game warhammer_3 pack create --pack-path $pack
& $rpfm --game warhammer_3 pack add --pack-path $pack --tsv-to-binary $schema --folder-path "$src;/"

Write-Host "Built: $pack"
