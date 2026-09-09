#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/deploy.sh <build|deploy|rollback|status|verify> [component]

Components: all, backend, frontend, api, workers, gateway

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
  all|backend|frontend|api|workers|gateway) ;;
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

for tool in git tar ssh scp shasum; do
  command -v "$tool" >/dev/null || {
    echo "Missing required deployment tool: $tool" >&2
    exit 1
  }
done

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
  backend backend-go frontend deploy scripts \
  docker-compose.production.yml Makefile .gitattributes > "$file_list"

if [[ ! -s "$file_list" ]]; then
  echo "No production source files were found." >&2
  exit 1
fi

: > "$manifest"
while IFS= read -r -d '' path; do
  digest=$(shasum -a 256 "$path" | awk '{print $1}')
  printf '%s  %s\n' "$digest" "$path" >> "$manifest"
done < "$file_list"
release_id=$(shasum -a 256 "$manifest" | awk '{print substr($1, 1, 16)}')

COPYFILE_DISABLE=1 tar --no-xattrs -czf "$archive" --null -T "$file_list"
remote_archive="/tmp/sneepcut-release-${release_id}.tar.gz"

echo "Uploading release $release_id to $deploy_host..."
scp "$archive" "${deploy_host}:${remote_archive}"
ssh "$deploy_host" bash -s -- \
  "$action" "$component" "$release_id" "$deploy_root" "$remote_archive" \
  < "$remote_runner"
