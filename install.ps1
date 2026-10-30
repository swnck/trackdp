# trackdp one-shot installer (Windows).
# Installs Node.js and pnpm when missing, installs dependencies, then runs the
# interactive setup wizard.
$ErrorActionPreference = "Stop"

Write-Host "== trackdp installer =="

# --- 1. Node.js ---------------------------------------------------------------
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js not found - installing via winget..."
  winget install -e --id OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
  $env:Path += ";$env:ProgramFiles\nodejs"
}
Write-Host "Node.js: $(node --version)"

# --- 2. pnpm (via Corepack) ---------------------------------------------------
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host "pnpm not found - enabling Corepack..."
  corepack enable
  corepack prepare pnpm@12.15.0 --activate
}
Write-Host "pnpm: $(pnpm --version)"

# --- 3. Dependencies + setup --------------------------------------------------
pnpm install
pnpm run setup
