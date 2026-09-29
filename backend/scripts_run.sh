#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
[ -d .venv ] && source .venv/bin/activate
exec uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
