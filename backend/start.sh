#!/bin/bash

echo "Waiting for database to be ready (5s)..."
sleep 5

echo "Running database setup..."
export PYTHONPATH=/app
# This runs the setup_db module inside the app package
python3 -m app.setup_db

echo "Starting Uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
