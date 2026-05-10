# Empyrean Checkpoint Helper
#
# Run this from the Empyrean project folder:
#
#   .\checkpoint.ps1
#
# What it does:
#   1. Finds the folder this script lives in.
#   2. Builds a timestamped destination name.
#   3. Copies the entire project folder to the Desktop.
#   4. Prints the checkpoint path.
#
# Why this exists:
#   Empyrean is an experimental workshop. You should be able to try strange
#   ideas without worrying that one bad edit will bury a working version.
#
# Safety notes:
#   - This script only copies.
#   - It does not delete anything.
#   - It does not modify the original project folder.
#   - Checkpoints can get large over time, so delete old ones manually when you
#     know you do not need them anymore.

$ErrorActionPreference = "Stop"

# $MyInvocation.MyCommand.Path is the full path to this script.
# Split-Path -Parent gives the folder containing this script, which should be
# C:\Users\S. Jones\Desktop\Empyrean.
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# Get the final folder name, usually "Empyrean".
$ProjectName = Split-Path -Leaf $ProjectRoot

# Timestamp format:
#   yyyyMMdd-HHmmss
#
# Example:
#   20260510-141530
#
# This keeps checkpoint names sortable by time.
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

# Use Windows' known Desktop path instead of hard-coding a user name.
$Desktop = [Environment]::GetFolderPath("Desktop")

# Final destination example:
#   C:\Users\S. Jones\Desktop\Empyrean_checkpoint_20260510-141530
$Destination = Join-Path $Desktop "$ProjectName`_checkpoint_$Timestamp"

Write-Host "Creating Empyrean checkpoint..."
Write-Host "Source:      $ProjectRoot"
Write-Host "Destination: $Destination"

Copy-Item -LiteralPath $ProjectRoot -Destination $Destination -Recurse -Force

Write-Host ""
Write-Host "Checkpoint complete:"
Write-Host $Destination
