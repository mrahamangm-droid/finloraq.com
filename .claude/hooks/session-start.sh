#!/bin/bash
# Installs dependencies for Claude Code on the web sessions so lint,
# typecheck and tests work out of the box. `npm install` runs the
# `postinstall` script, which runs `prisma generate`.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
npm install --no-audit --no-fund
