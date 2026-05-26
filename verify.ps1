# Empyrean Verification Helper
#
# Run this from the Empyrean project folder:
#
#   .\verify.ps1
#
# What it checks:
#   1. JavaScript syntax for main.js.
#   2. JavaScript syntax for the helper modules main.js imports.
#   3. PowerShell parse health for checkpoint.ps1.
#   4. Important files exist.
#
# What it does not check:
#   - It does not open the browser.
#   - It does not prove the 3D scene looks correct.
#   - It does not replace a Live Server visual check.
#
# Why this exists:
#   It gives you a quick "did I break the project structurally?" test after
#   editing config, encounters, docs, or small pieces of code.

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $ProjectRoot

Write-Host "Empyrean verification starting..."
Write-Host "Project: $ProjectRoot"
Write-Host ""

$RequiredFiles = @(
  "index.html",
  "main.js",
  "physics.js",
  "rig.js",
  "world.js",
  "skin.js",
  "combatPhysics.js",
  "combat_updated.js",
  "encounters.js",
  "styles.css",
  "README.md",
  "SOLO_WORKFLOW.md",
  "WORLD_COOKBOOK.md",
  "ENCOUNTERS.md",
  "NEXT_STEPS.md",
  "checkpoint.ps1"
)

Write-Host "Checking required files..."
foreach ($File in $RequiredFiles) {
  if (-not (Test-Path -LiteralPath $File)) {
    throw "Missing required file: $File"
  }
  Write-Host "  OK $File"
}

Write-Host ""
Write-Host "Checking JavaScript syntax..."
node --check main.js
node --check physics.js
node --check rig.js
node --check world.js
node --check skin.js
node --check combatPhysics.js
node --check combat_updated.js
node --check encounters.js
Write-Host "  OK JavaScript syntax"

Write-Host ""
Write-Host "Checking checkpoint.ps1 parse health..."
$ParseErrors = $null
[System.Management.Automation.PSParser]::Tokenize(
  (Get-Content -Raw -LiteralPath "checkpoint.ps1"),
  [ref] $ParseErrors
) | Out-Null

if ($ParseErrors) {
  $ParseErrors | Format-List *
  throw "checkpoint.ps1 has parse errors."
}
Write-Host "  OK checkpoint.ps1"

Write-Host ""
Write-Host "Checking common assets..."
$AssetFiles = @(
  "assets/femaleMesh.glb",
  "assets/Sigewynn.glb",
  "assets/enemy.glb",
  "assets/sword.glb",
  "assets/plainSword.glb",
  "assets/Jupiter.jpg",
  "assets/moon.glb",
  "assets/tree.glb",
  "assets/deadTree.glb",
  "assets/background.mp3",
  "assets/ambient.ogg",
  "assets/battle.mp3",
  "assets/diffuse.jpg",
  "assets/normal.jpg",
  "assets/ao.jpg",
  "assets/displacement.jpg",
  "assets/stoneFloorDiff.jpg",
  "assets/stoneFloorDisp.png",
  "assets/stoneWallDiff.jpg",
  "assets/StoneWallDisp.png",
  "assets/torch.glb"
)

foreach ($Asset in $AssetFiles) {
  if (Test-Path -LiteralPath $Asset) {
    Write-Host "  OK $Asset"
  } else {
    Write-Host "  MISSING optional/common asset: $Asset"
  }
}

Write-Host ""
Write-Host "Empyrean verification complete."
Write-Host "Next: open index.html with VS Code Live Server and do a visual check."
