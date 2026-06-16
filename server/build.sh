#!/usr/bin/env bash
set -o errexit

pip install -r requirements.txt

# Database setup is done at runtime via: flask init-db
# (Cannot run during build — Render PostgreSQL is not accessible from the build container)
