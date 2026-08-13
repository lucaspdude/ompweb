# Standalone installer for Rocinante on Windows.
#
# Pipeline:
#   1. Verify Node.js >= 22.19.0 (offer to install if missing).
#   2. Install the upstream `omp` binary via the official oh-my-pi installer
#      (irm https://omp.sh/install | iex). Skip when already present.
#   3. Smoke-test the omp binary (`omp --version`).
#   4. Install @lucaspdude/rocinante via npm globally.
#   5. Print a friendly "Run 'rocinante' to start" message.
#
# Usage (PowerShell):
#   irm https://raw.githubusercontent.com/lucaspdude/ompweb/main/scripts/install.ps1 | iex
#   $env:PI_INSTALL_DIR = "$HOME\bin"; irm ... | iex
#   $env:PI_REF = "v17.2.15"; irm ... | iex
#
# This script is idempotent: re-running it skips the steps that already
# succeeded on the host (omp installed, Rocinante installed).

[CmdletBinding()]
param(
  [string]$InstallDir = "$env:USERPROFILE\.local\bin",
  [string]$Ref = "",
  [string]$Package = "@lucaspdude/rocinante"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$NodeMinMajor = 22
$NodeMinMinor = 19
$OmpInstallUrl = "https://omp.sh/install"

function Log($msg)  { Write-Host "[install] $msg" -ForegroundColor Cyan }
function Warn($msg) { Write-Host "[warn] $msg" -ForegroundColor Yellow }
function Fail($msg) {
  Write-Host "[error] $msg" -ForegroundColor Red
  exit 1
}

function Ensure-Node {
  $node = $null
  try { $node = & node --version 2>$null } catch { $node = $null }
  if (-not $node) {
    Fail "Node.js not found. Install Node.js >= $NodeMinMajor.$NodeMinMinor from https://nodejs.org/ and re-run this script."
  }
  if ($node -match "^v(\d+)\.(\d+)\.") {
    $major = [int]$Matches[1]
    $minor = [int]$Matches[2]
    if (($major -lt $NodeMinMajor) -or (($major -eq $NodeMinMajor) -and ($minor -lt $NodeMinMinor))) {
      Fail "Node.js $node is too old. Rocinante requires >= $NodeMinMajor.$NodeMinMinor."
    }
  }
  Log "Node.js $node OK"
}

function Ensure-Omp {
  $existing = $null
  try { $existing = & omp --version 2>$null } catch { $existing = $null }
  if ($existing) {
    Log "omp already on PATH (will reuse)"
  } else {
    Log "Installing omp from $OmpInstallUrl into $InstallDir…"
    if (-not (Test-Path $InstallDir)) {
      New-Item -ItemType Directory -Path $InstallDir | Out-Null
    }
    $env:PI_INSTALL_DIR = $InstallDir
    if ($Ref) { $env:PI_REF = $Ref }
    try {
      irm $OmpInstallUrl | iex
    } catch {
      Fail "omp installer failed. See https://github.com/can1357/oh-my-pi#manual-install"
    }
    # Refresh PATH for this session.
    $env:PATH = "$InstallDir;$env:PATH"
  }

  Log "Smoke-testing omp --version…"
  try {
    $version = & omp --version 2>&1
    if ($LASTEXITCODE -ne 0) {
      Fail "omp --version exited with code $LASTEXITCODE."
    }
  } catch {
    Fail "omp --version could not be executed: $_"
  }
  Log "omp $version OK"
}

function Ensure-Rocinante {
  $existing = $null
  try { $existing = & rocinante --version 2>$null } catch { $existing = $null }
  if ($existing) {
    Log "rocinante already on PATH (will reinstall to pick up the latest version)"
  }
  $npm = $null
  try { $npm = & npm --version 2>$null } catch { $npm = $null }
  if (-not $npm) {
    Fail "npm not found. Install Node.js (which bundles npm) from https://nodejs.org/."
  }
  Log "Installing $Package globally…"
  # --ignore-scripts is the npm-recommended defense against postinstall
  # supply-chain attacks. Rocinante has no postinstall by design.
  & npm install -g --ignore-scripts $Package
  if ($LASTEXITCODE -ne 0) {
    Fail "npm install -g $Package failed. Check npm logs above."
  }
}

function Main {
  Log "Installing Rocinante…"
  Ensure-Node
  Ensure-Omp
  Ensure-Rocinante

  Write-Host ""
  Write-Host "Rocinante installed." -ForegroundColor Green
  Write-Host "  Run 'rocinante' to start the web UI."
  Write-Host "  The UI opens on http://127.0.0.1:30178 by default."
  Write-Host "  Custom port: `$env:ROCINANTE_PORT=4000; rocinante"
}

Main
