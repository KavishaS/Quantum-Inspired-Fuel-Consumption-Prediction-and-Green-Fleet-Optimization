#!/usr/bin/env bash
# One-time backend setup: venv, dependencies, dataset, model, database.
set -euo pipefail
cd "$(dirname "$0")"
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip -q
pip install -r requirements.txt
[ -f .env ] || cp .env.example .env
echo "Generating demo dataset..."
python -m app.ml.dataset
echo "Training fuel-consumption model..."
python -m app.ml.predictor
echo "Initialising database..."
python -m app.database.session
echo "Setup complete. Start with: ./scripts_run.sh"
