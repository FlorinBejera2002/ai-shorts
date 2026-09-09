#!/usr/bin/env bash
set -euo pipefail

action=${1:-}
component=${2:-all}

case "$action" in
  config|build|deploy|status|verify) ;;
  *) echo "Unknown production action: $action" >&2; exit 2 ;;
esac
case "$component" in
  all|backend|frontend|api|workers|gateway) ;;
  *) echo "Unknown production component: $component" >&2; exit 2 ;;
esac

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd "$script_dir/.." && pwd)
environment_file=${PRODUCTION_ENV_FILE:-$repo_root/.env.production.local}

if [[ ! -f "$environment_file" ]]; then
  echo "Missing production environment file: $environment_file" >&2
  exit 1
fi

compose=(
  docker compose
  --env-file "$environment_file"
  -f "$repo_root/docker-compose.production.yml"
)

config() {
  "${compose[@]}" config --quiet
  docker run --rm --network none \
    --volume "$repo_root/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" \
    caddy:2-alpine \
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
}

build() {
  config
  case "$component" in
    all) "${compose[@]}" build ;;
    backend) "${compose[@]}" build migrate backend-go worker job-dispatcher ;;
    frontend) "${compose[@]}" build frontend ;;
    api) "${compose[@]}" build migrate backend-go ;;
    workers) "${compose[@]}" build worker job-dispatcher ;;
    gateway) "${compose[@]}" pull nginx caddy ;;
  esac
}

wait_for_health() {
  local service=$1
  local timeout_seconds=$2
  local container_id status
  container_id=$("${compose[@]}" ps -q "$service")
  if [[ -z "$container_id" ]]; then
    echo "No container found for $service." >&2
    return 1
  fi

  for ((attempt = 0; attempt < timeout_seconds / 2; attempt++)); do
    status=$(docker inspect --format \
      '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
      "$container_id")
    case "$status" in
      healthy|running) return 0 ;;
      exited|dead|unhealthy)
        echo "$service entered state $status." >&2
        "${compose[@]}" logs --tail=100 "$service" >&2
        return 1
        ;;
    esac
    sleep 2
  done

  echo "$service did not become healthy within ${timeout_seconds}s." >&2
  "${compose[@]}" logs --tail=100 "$service" >&2
  return 1
}

start_infrastructure() {
  "${compose[@]}" up -d postgres redis clamav
  wait_for_health postgres 120
  wait_for_health redis 120
  wait_for_health clamav 240
}

run_migrations() {
  "${compose[@]}" run --rm migrate
}

start_api() {
  "${compose[@]}" up -d --no-deps --force-recreate backend-go
  wait_for_health backend-go 120
  "${compose[@]}" up -d --no-deps --force-recreate nginx
}

start_workers() {
  "${compose[@]}" up -d --no-deps --force-recreate worker job-dispatcher
}

start_frontend() {
  "${compose[@]}" up -d --no-deps --force-recreate frontend
  wait_for_health frontend 120
}

start_gateway() {
  "${compose[@]}" up -d --no-deps --force-recreate caddy
}

deploy() {
  config
  case "$component" in
    all)
      start_infrastructure
      run_migrations
      start_api
      start_workers
      start_frontend
      start_gateway
      ;;
    backend)
      start_infrastructure
      run_migrations
      start_api
      start_workers
      start_gateway
      ;;
    frontend)
      start_frontend
      start_gateway
      ;;
    api)
      start_infrastructure
      run_migrations
      start_api
      start_gateway
      ;;
    workers)
      start_infrastructure
      run_migrations
      if [[ -z "$("${compose[@]}" ps -q backend-go)" ]]; then
        start_api
      fi
      start_workers
      ;;
    gateway)
      "${compose[@]}" up -d nginx
      start_gateway
      ;;
  esac
}

verify_api() {
  "${compose[@]}" exec -T nginx nginx -t
  for attempt in {1..30}; do
    if curl --fail --silent --show-error \
      https://api.sneepcut.com/api/ready >/dev/null; then
      break
    fi
    if [[ "$attempt" == 30 ]]; then
      echo "The public API readiness check failed." >&2
      return 1
    fi
    sleep 2
  done

  local media_status
  media_status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
    https://api.sneepcut.com/media/not-authorized.mp4)
  case "$media_status" in
    401|403) ;;
    *) echo "Unsigned media request returned unexpected HTTP $media_status." >&2; return 1 ;;
  esac
}

verify_workers() {
  "${compose[@]}" exec -T clamav clamdscan --ping=1
  "${compose[@]}" exec -T worker \
    celery -A app.workers.celery_app:celery_app inspect ping --timeout=10
}

verify_frontend() {
  "${compose[@]}" exec -T frontend node -e \
    "fetch('http://127.0.0.1:3000/').then(r => { if (r.status >= 500) process.exit(1); console.log('frontend HTTP', r.status) }).catch(error => { console.error(error); process.exit(1) })"
}

verify_public_frontend() {
  local url
  for url in https://sneepcut.com https://www.sneepcut.com; do
    curl --fail --silent --show-error --location --max-time 30 \
      --output /dev/null "$url"
  done
}

verify() {
  config
  case "$component" in
    all)
      verify_api
      verify_workers
      verify_frontend
      verify_public_frontend
      ;;
    backend) verify_api; verify_workers ;;
    frontend) verify_frontend ;;
    api) verify_api ;;
    workers) verify_workers ;;
    gateway) "${compose[@]}" exec -T nginx nginx -t ;;
  esac
  "${compose[@]}" ps -a
}

case "$action" in
  config) config ;;
  build) build ;;
  deploy) deploy ;;
  status) "${compose[@]}" ps -a ;;
  verify) verify ;;
esac
