#!/bin/bash
set -e

echo "=== Sneepcut Setup ==="

if [ ! -f .env ]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
  echo "Edit .env with your API keys before starting."
fi

echo "Building and starting services..."
docker compose up --build -d

echo "Waiting for services to be healthy..."
make health
curl --fail --silent --show-error http://localhost > /dev/null
echo "Frontend: ok"

echo ""
echo "=== Setup complete ==="
echo "Frontend: http://localhost"
echo "Frontend (canonical local URL): http://localhost:3000"
echo "Backend readiness: http://localhost/api/ready"
echo "Go API (dev overlay only): http://localhost:8080"
echo "Dev overlay: docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build"
