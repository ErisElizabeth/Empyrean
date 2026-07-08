# Empyrean Verification Helper
#
# Run this from the Empyrean project folder:
#
#   .\verify.ps1
#
# What it checks:
#   1. JavaScript syntax for main.js.
#   2. JavaScript syntax for the helper modules main.js imports.
#   3. Deterministic lunar-phase contract behavior.
#   4. PowerShell parse health for checkpoint.ps1.
#   5. Important files exist.
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
  "moonPhase.js",
  "moonPhase.test.mjs",
  "assets/moon_2K.jpg",
  "rig.js",
  "puppetShop.js",
  "sword.js",
  "world.js",
  "skin.js",
  "audioManager.js",
  "combatPhysics.js",
  "oracleD20.js",
  "combat_updated.js",
  "enemy.js",
  "entity.js",
  "entityControllers.js",
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
node --check moonPhase.js
node --check moonPhase.test.mjs
node --check rig.js
node --check puppetShop.js
node --check sword.js
node --check world.js
node --check skin.js
node --check audioManager.js
node --check combatPhysics.js
node --check oracleD20.js
node --check combat_updated.js
node --check enemy.js
node --check entity.js
node --check entityControllers.js
node --check encounters.js
Write-Host "  OK JavaScript syntax"

Write-Host ""
Write-Host "Checking lunar-phase data contract..."
node moonPhase.test.mjs
Write-Host "  OK lunar-phase data contract"

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
  "assets/Cathedral_lowPoly2.glb",
  "assets/texture_0.png",
  "assets/Cathedral_lowPoly.glb",
  "assets/Cathedral.glb",
  "assets/churchRough.glb",
  "assets/cave.glb",
  "assets/campfire.glb",
  "assets/skull.glb",
  "assets/rock1.glb",
  "assets/rock2.glb",
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
