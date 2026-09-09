#!/usr/bin/env bash
set -euo pipefail

action=${1:-}
component=${2:-all}
release_id=${3:-}
deploy_root=${4:-/opt/sneepcut}
archive=${5:-}

case "$action" in
  build|deploy|rollback|status|verify) ;;
  *) echo "Unknown release action: $action" >&2; exit 2 ;;
esac
case "$component" in
  all|backend|frontend|api|workers|gateway) ;;
  *) echo "Unknown release component: $component" >&2; exit 2 ;;
esac
if [[ ! "$deploy_root" =~ ^/(opt|srv)/[a-zA-Z0-9._-]+(/[a-zA-Z0-9._-]+)*$ ]] ||
  [[ "$deploy_root" =~ (^|/)(\.|\.\.)($|/) ]]; then
  echo "Unsafe deployment root: $deploy_root" >&2
  exit 2
fi

previous_root="${deploy_root}.previous"
incoming_root="${deploy_root}.incoming"
lock_file="${deploy_root}.deploy.lock"

exec 9>"$lock_file"
if ! flock --nonblock 9; then
  echo "Another production release operation is already running." >&2
  exit 1
fi

for release_path in "$deploy_root" "$previous_root" "$incoming_root"; do
  if [[ -L "$release_path" ]]; then
    echo "Refusing to use a symlink as a release path: $release_path" >&2
    exit 1
  fi
done

run_at() {
  local release_root=$1
  local current_action=$2
  local current_component=$3
  local current_release=production
  if [[ -f "$release_root/.release-id" ]]; then
    current_release=$(<"$release_root/.release-id")
  fi
  cd "$release_root"
  DEPLOYMENT_VERSION="$current_release" \
    PRODUCTION_ENV_FILE="$release_root/.env.production.local" \
    "$release_root/scripts/production-compose.sh" "$current_action" "$current_component"
}

run_current() {
  local current_action=$1
  local current_component=$2
  run_at "$deploy_root" "$current_action" "$current_component"
}

case "$action" in
  status|verify)
    if [[ ! -d "$deploy_root" ]]; then
      echo "Production checkout does not exist: $deploy_root" >&2
      exit 1
    fi
    run_current "$action" "$component"
    exit
    ;;
  rollback)
    if [[ ! -d "$previous_root" ]]; then
      echo "No previous production release is available." >&2
      exit 1
    fi
    if [[ ! -f "$deploy_root/.env.production.local" ]]; then
      echo "The production environment file is missing from $deploy_root." >&2
      exit 1
    fi
    swap_root="${deploy_root}.rollback-swap"
    if [[ -e "$swap_root" ]]; then
      echo "Refusing rollback because the swap path already exists: $swap_root" >&2
      exit 1
    fi

    cp "$deploy_root/.env.production.local" "$previous_root/.env.production.local"
    chmod 600 "$previous_root/.env.production.local"
    run_at "$previous_root" build all

    mv "$deploy_root" "$swap_root"
    mv "$previous_root" "$deploy_root"
    mv "$swap_root" "$previous_root"

    if ! run_current deploy all || ! run_current verify all; then
      echo "Rollback failed; restoring the release that was active before rollback." >&2
      mv "$deploy_root" "$swap_root"
      mv "$previous_root" "$deploy_root"
      mv "$swap_root" "$previous_root"
      run_current build all
      run_current deploy all
      run_current verify all
      exit 1
    fi
    echo "Rollback completed. Exactly one alternate release remains at $previous_root."
    exit
    ;;
esac

if [[ ! "$release_id" =~ ^[a-f0-9]{16}$ ]]; then
  echo "Invalid release ID: $release_id" >&2
  exit 2
fi
if [[ ! "$archive" =~ ^/tmp/sneepcut-release-[a-f0-9]{16}\.tar\.gz$ || ! -f "$archive" ]]; then
  echo "Missing or unsafe release archive: $archive" >&2
  exit 2
fi
if [[ ! -f "$deploy_root/.env.production.local" ]]; then
  echo "The production environment file is missing from $deploy_root." >&2
  exit 1
fi

current_id=""
if [[ -f "$deploy_root/.release-id" ]]; then
  current_id=$(<"$deploy_root/.release-id")
fi

if [[ "$current_id" == "$release_id" ]]; then
  rm -f -- "$archive"
  run_current build "$component"
  if [[ "$action" == deploy ]]; then
    run_current deploy "$component"
    run_current verify "$component"
  fi
  echo "Release $release_id is already current; $component $action completed without rotating backups."
  exit
fi

incoming_id=""
if [[ -f "$incoming_root/.release-id" ]]; then
  incoming_id=$(<"$incoming_root/.release-id")
fi

if [[ "$incoming_id" != "$release_id" ]]; then
  if [[ -e "$incoming_root" ]]; then
    rm -rf -- "$incoming_root"
  fi
  mkdir -p "$incoming_root"
  tar -xzf "$archive" -C "$incoming_root"
  printf '%s\n' "$release_id" > "$incoming_root/.release-id"
fi
rm -f -- "$archive"

cp "$deploy_root/.env.production.local" "$incoming_root/.env.production.local"
chmod 600 "$incoming_root/.env.production.local"

cd "$incoming_root"
DEPLOYMENT_VERSION="$release_id" \
  PRODUCTION_ENV_FILE="$incoming_root/.env.production.local" \
  "$incoming_root/scripts/production-compose.sh" config "$component"

build_marker="$incoming_root/.built-$component"
if [[ ! -f "$build_marker" && ! -f "$incoming_root/.built-all" ]]; then
  DEPLOYMENT_VERSION="$release_id" \
    PRODUCTION_ENV_FILE="$incoming_root/.env.production.local" \
    "$incoming_root/scripts/production-compose.sh" build "$component"
  touch "$build_marker"
fi

if [[ "$action" == build ]]; then
  echo "Release $release_id is built and staged at $incoming_root."
  exit
fi

if [[ -e "$previous_root" ]]; then
  rm -rf -- "$previous_root"
fi
mv "$deploy_root" "$previous_root"
mv "$incoming_root" "$deploy_root"

run_current deploy "$component"
run_current verify "$component"
echo "Release $release_id is active. The one previous release is at $previous_root."
