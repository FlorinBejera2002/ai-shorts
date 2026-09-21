#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/deploy.sh <build|deploy|rollback|status|verify> [component]

Components: all, backend, frontend, studio, api, workers, gateway

Environment:
  DEPLOY_HOST  SSH host or alias (default: sc)
  DEPLOY_ROOT  Absolute server checkout path (default: /opt/sneepcut)
EOF
}

action=${1:-}
component=${2:-all}
deploy_host=${DEPLOY_HOST:-sc}
deploy_root=${DEPLOY_ROOT:-/opt/sneepcut}

case "$action" in
  build|deploy|rollback|status|verify) ;;
  *) usage >&2; exit 2 ;;
esac

case "$component" in
  all|backend|frontend|studio|api|workers|gateway) ;;
  *) echo "Unknown production component: $component" >&2; exit 2 ;;
esac

if [[ ! "$deploy_host" =~ ^[a-zA-Z0-9_.@-]+$ ]]; then
  echo "DEPLOY_HOST contains unsupported characters." >&2
  exit 2
fi
if [[ ! "$deploy_root" =~ ^/(opt|srv)/[a-zA-Z0-9._-]+(/[a-zA-Z0-9._-]+)*$ ]] ||
  [[ "$deploy_root" =~ (^|/)(\.|\.\.)($|/) ]]; then
  echo "DEPLOY_ROOT must be a specific path below /opt or /srv." >&2
  exit 2
fi

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd "$script_dir/.." && pwd)
remote_runner="$script_dir/production-release.sh"

case "$action" in
  rollback|status|verify)
    ssh "$deploy_host" bash -s -- "$action" "$component" manual "$deploy_root" "" < "$remote_runner"
    exit
    ;;
esac

for tool in git tar ssh scp; do
  command -v "$tool" >/dev/null || {
    echo "Missing required deployment tool: $tool" >&2
    exit 1
  }
done

if command -v shasum >/dev/null; then
  sha256_command=(shasum -a 256)
  sha256() { shasum -a 256 "$@"; }
elif command -v sha256sum >/dev/null; then
  sha256_command=(sha256sum)
  sha256() { sha256sum "$@"; }
else
  echo "Missing required deployment tool: shasum or sha256sum" >&2
  exit 1
fi

temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/sneepcut-deploy.XXXXXX")
cleanup() {
  if [[ -n "${temp_dir:-}" && -d "$temp_dir" ]]; then
    rm -rf -- "$temp_dir"
  fi
}
trap cleanup EXIT

file_list="$temp_dir/files.list"
manifest="$temp_dir/manifest.sha256"
archive="$temp_dir/source.tar.gz"

cd "$repo_root"
# Ship only runtime/build inputs. This deliberately excludes local agent settings,
# secrets, caches, and an in-progress alternate frontend tree.
git ls-files -co --exclude-standard -z -- \
  backend frontend deploy scripts \
  editor/package.json editor/bun.lock editor/Dockerfile.sneepcut editor/.dockerignore \
  'editor/tsconfig*.json' editor/packages editor/registry editor/scripts editor/LICENSE editor/NOTICE \
  docker-compose.production.yml Makefile .gitattributes \
  ':(exclude)editor/packages/producer/tests' > "$file_list"

if [[ ! -s "$file_list" ]]; then
  echo "No production source files were found." >&2
  exit 1
fi

# Hash in batches: spawning two processes per file is very slow on Windows.
xargs -0 "${sha256_command[@]}" < "$file_list" > "$manifest"
release_id=$(sha256 "$manifest" | awk '{print substr($1, 1, 16)}')

COPYFILE_DISABLE=1 tar --no-xattrs -czf "$archive" --null -T "$file_list"
remote_archive="/tmp/sneepcut-release-${release_id}.tar.gz"

echo "Uploading release $release_id to $deploy_host..."
scp "$archive" "${deploy_host}:${remote_archive}"
ssh "$deploy_host" bash -s -- \
  "$action" "$component" "$release_id" "$deploy_root" "$remote_archive" \
  < "$remote_runner"
