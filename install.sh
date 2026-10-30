#!/usr/bin/env bash
#
# trackdp one-shot installer.
# Installs Node.js and pnpm when missing, installs dependencies, then runs the
# interactive setup wizard.
#
set -euo pipefail

echo "== trackdp installer =="

# --- 1. Node.js ---------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found — installing…"
  if command -v brew >/dev/null 2>&1; then
    brew install node
  elif command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update && sudo apt-get install -y nodejs npm
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y nodejs
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -S --noconfirm nodejs npm
  else
    echo "No supported package manager found. Install Node.js (>=18.17) from https://nodejs.org and re-run." >&2
    exit 1
  fi
fi
echo "Node.js: $(node --version)"

# --- 2. pnpm (via Corepack) ---------------------------------------------------
if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found — enabling Corepack…"
  corepack enable
  corepack prepare pnpm@12.15.0 --activate
fi
echo "pnpm: $(pnpm --version)"

# --- 3. Dependencies + setup --------------------------------------------------
pnpm install
pnpm run setup
