#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd "$script_dir/../.." && pwd)
mkdir -p "$repo_root/.cache/tmp"
fixture=$(mktemp -d "$repo_root/.cache/tmp/production-compose.XXXXXX")
trap 'rm -rf -- "$fixture"' EXIT
mkdir -p "$fixture/bin"
export ACTION_LOG="$fixture/actions"
export PRODUCTION_ENV_FILE="$fixture/production.env"
printf 'SYNTHETIC_ENV=deployment-test\n' > "$PRODUCTION_ENV_FILE"

cat > "$fixture/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == inspect ]]; then
  service=${!#}
  printf 'health %s\n' "$service" >> "$ACTION_LOG"
  if [[ "$service" == youtube-pot-provider && "${PROVIDER_UNHEALTHY:-}" == 1 ]]; then
    echo unhealthy
  else
    echo healthy
  fi
  exit
fi
if [[ "$1" == run ]]; then exit; fi
[[ "$1" == compose ]]
shift
while [[ "$1" == --env-file || "$1" == -f ]]; do shift 2; done
printf '%s\n' "$*" >> "$ACTION_LOG"
if [[ "$1" == ps ]]; then printf '%s\n' "${!#}"; fi
MOCK
chmod +x "$fixture/bin/docker"
export PATH="$fixture/bin:$PATH"

for component in all backend workers; do
  : > "$ACTION_LOG"
  bash "$repo_root/scripts/production-compose.sh" deploy "$component"
  provider_start=$(grep -nFx 'up -d --no-deps youtube-pot-provider' "$ACTION_LOG" | cut -d: -f1)
  provider_health=$(grep -nFx 'health youtube-pot-provider' "$ACTION_LOG" | cut -d: -f1)
  worker_start=$(grep -nFx 'up -d --no-deps --force-recreate worker' "$ACTION_LOG" | cut -d: -f1)
  [[ "$provider_start" -lt "$provider_health" && "$provider_health" -lt "$worker_start" ]]
done

: > "$ACTION_LOG"
if PROVIDER_UNHEALTHY=1 bash "$repo_root/scripts/production-compose.sh" deploy workers > "$fixture/output" 2>&1; then
  echo 'An unhealthy token provider was accepted.' >&2
  exit 1
fi
grep -q 'youtube-pot-provider entered state unhealthy' "$fixture/output"
if grep -qFx 'up -d --no-deps --force-recreate worker' "$ACTION_LOG"; then
  echo 'Worker was recreated before its token provider was healthy.' >&2
  exit 1
fi

: > "$ACTION_LOG"
bash "$repo_root/scripts/production-compose.sh" deploy api
if grep -q youtube-pot-provider "$ACTION_LOG"; then
  echo 'An API-only deployment unexpectedly started the token provider.' >&2
  exit 1
fi

echo 'Production Compose dependency tests passed.'
