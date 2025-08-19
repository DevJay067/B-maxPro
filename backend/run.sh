#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# Load environment variables from .env if present
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Activate virtual environment if available
if [ -d venv ]; then
  source venv/bin/activate
fi

PORT=${PORT:-8000}

exec python -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT"