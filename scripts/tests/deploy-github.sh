#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
helper="$script_dir/../deploy-github.sh"
fixture=$(mktemp -d)
trap 'rm -rf -- "$fixture"' EXIT
export RESULT_DIR="$fixture/result"
mkdir -p "$fixture/repository/scripts" "$RESULT_DIR"
git -C "$fixture/repository" init -b main --quiet
git -C "$fixture/repository" config user.name 'Deployment test'
git -C "$fixture/repository" config user.email 'deployment@example.invalid'
cat > "$fixture/repository/scripts/production-release.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" > "$RESULT_DIR/arguments"
tar -xOzf "$5" version.txt > "$RESULT_DIR/version"
printf '%s\n' "$5" > "$RESULT_DIR/archive"
exit "${RUNNER_EXIT:-0}"
EOF
printf 'committed\n' > "$fixture/repository/version.txt"
git -C "$fixture/repository" add .
git -C "$fixture/repository" commit --quiet -m fixture
commit=$(git -C "$fixture/repository" rev-parse HEAD)
printf 'uncommitted\n' > "$fixture/repository/version.txt"
export DEPLOY_REPOSITORY="file://$fixture/repository"
export DEPLOY_ROOT=/opt/sneepcut-github-test

bash "$helper" deploy all
mapfile -t args < "$RESULT_DIR/arguments"
[[ "${args[0]}" == deploy && "${args[1]}" == all ]]
[[ "${args[2]}" == "${commit:0:16}" && "${args[3]}" == "$DEPLOY_ROOT" ]]
[[ "$(cat "$RESULT_DIR/version")" == committed ]]
[[ ! -e "$(cat "$RESULT_DIR/archive")" ]]

bash "$helper" build api
mapfile -t args < "$RESULT_DIR/arguments"
[[ "${args[0]}" == build && "${args[1]}" == api ]]

if RUNNER_EXIT=7 bash "$helper" deploy all; then
  echo 'Runner failure was ignored' >&2; exit 1
else
  [[ $? == 7 ]]
fi
[[ ! -e "$(cat "$RESULT_DIR/archive")" ]]

for scenario in component path branch; do
  case "$scenario" in
    component) command=(bash "$helper" deploy nonexistent) ;;
    path) command=(env DEPLOY_ROOT=/opt/sneepcut/.. bash "$helper" deploy all) ;;
    branch) command=(env DEPLOY_BRANCH=missing-branch bash "$helper" deploy all) ;;
  esac
  rm -f "$RESULT_DIR/arguments"
  if "${command[@]}"; then
    echo "Invalid $scenario was accepted" >&2; exit 1
  fi
  [[ ! -e "$RESULT_DIR/arguments" ]]
done
echo 'GitHub deployment tests passed.'
