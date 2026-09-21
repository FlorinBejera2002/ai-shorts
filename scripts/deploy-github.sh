#!/usr/bin/env bash
set -euo pipefail

# Run on the server. Source comes exclusively from the selected Git branch.
action=${1:-deploy}
component=${2:-all}
deploy_root=${DEPLOY_ROOT:-/opt/sneepcut}
repository=${DEPLOY_REPOSITORY:-https://github.com/FlorinBejera2002/ai-shorts.git}
branch=${DEPLOY_BRANCH:-main}

case "$action" in
  build|deploy|rollback|status|verify) ;;
  *) echo "Usage: deploy-github.sh <build|deploy|rollback|status|verify> [component]" >&2; exit 2 ;;
esac
case "$component" in
  all|backend|frontend|studio|api|workers|gateway) ;;
  *) echo "Unknown production component: $component" >&2; exit 2 ;;
esac
if [[ ! "$deploy_root" =~ ^/(opt|srv)/[a-zA-Z0-9._-]+(/[a-zA-Z0-9._-]+)*$ ]] ||
  [[ "$deploy_root" =~ (^|/)(\.|\.\.)($|/) ]]; then
  echo "DEPLOY_ROOT must be a specific path below /opt or /srv." >&2
  exit 2
fi
if [[ $# -gt 2 ]]; then
  echo "Expected an action and optional component only." >&2
  exit 2
fi

case "$action" in
  rollback|status|verify)
    exec bash "$deploy_root/scripts/production-release.sh" "$action" "$component" manual "$deploy_root" ""
    ;;
esac

temp_dir=$(mktemp -d)
archive=""
cleanup() {
  rm -rf -- "$temp_dir"
  if [[ -n "$archive" ]]; then rm -f -- "$archive"; fi
}
trap cleanup EXIT

echo "Fetching $branch from $repository..."
git clone --depth 1 --single-branch --branch "$branch" -- "$repository" "$temp_dir/source"
commit=$(git -C "$temp_dir/source" rev-parse HEAD)
release_id=${commit:0:16}
# Serialize callers producing the same archive, independently of the release lock.
exec 8>"/tmp/sneepcut-github-${release_id}.lock"
flock 8
archive="/tmp/sneepcut-release-${release_id}.tar.gz"
git -C "$temp_dir/source" archive --format=tar.gz --output="$archive" HEAD

echo "Deploy source: $commit ($branch)"
bash "$temp_dir/source/scripts/production-release.sh" \
  "$action" "$component" "$release_id" "$deploy_root" "$archive"
