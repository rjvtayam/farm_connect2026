#!/usr/bin/env bash
set -o errexit

pip install -r requirements.txt

# Attempt database setup — non-fatal if it fails (tables may already exist
# or psycopg2 may be incompatible with the cached Python version).
# If this fails, run `flask init-db` via Render Shell after deploy.
python database/setup_database.py || echo "[WARN] Database setup skipped — run 'flask init-db' via Render Shell"
