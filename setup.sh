#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  EV Analyst — Setup Script
# ─────────────────────────────────────────────────────────────────────────────
set -e

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ⚡  EV Analyst Multi-Agent System — Setup"
echo "═══════════════════════════════════════════════════"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "✗ Node.js not found. Install Node.js 18+ from https://nodejs.org"
  exit 1
fi
NODE_VER=$(node --version)
echo "✓ Node.js: $NODE_VER"

# Check npm
if ! command -v npm &> /dev/null; then
  echo "✗ npm not found."
  exit 1
fi
echo "✓ npm: $(npm --version)"

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install
echo "✓ Dependencies installed"

# Build TypeScript
echo ""
echo "Compiling TypeScript..."
npm run build
echo "✓ TypeScript compiled → dist/"

# .env setup
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    echo ""
    echo "⚠  Created .env from .env.example"
    echo "   Add your ANTHROPIC_API_KEY to .env before running live analysis"
  fi
else
  echo "✓ .env file exists"
fi

# Validate API key (optional check)
if [ -f ".env" ]; then
  source .env 2>/dev/null || true
  if [ -n "$ANTHROPIC_API_KEY" ] && [ "$ANTHROPIC_API_KEY" != "your_anthropic_api_key_here" ]; then
    echo "✓ ANTHROPIC_API_KEY found in .env"
  else
    echo "⚠  ANTHROPIC_API_KEY not configured in .env (required for live mode)"
  fi
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  Setup complete! Try these commands:"
echo ""
echo "  Dry run (no API keys needed):"
echo "    node dist/cli.js --ticker TSLA --dry-run"
echo ""
echo "  Live analysis (requires ANTHROPIC_API_KEY):"
echo "    node dist/cli.js --ticker RIVN"
echo "    node dist/cli.js --ticker TSLA --output tsla_report.html --verbose"
echo ""
echo "  Or with npx after npm link:"
echo "    npx ev-analyst --ticker TSLA --dry-run"
echo "═══════════════════════════════════════════════════"
echo ""
