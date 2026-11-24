#!/usr/bin/env bash
#
# sync_dependabot_labels.sh
#
# Create every label that .github/dependabot.yml references but the GitHub
# repository lacks. Dependabot only auto-creates its default labels; custom
# `labels:` entries that don't exist are silently dropped from its PRs.
# Run this once after forking the template.
#
# Usage:
#   ./scripts/sync_dependabot_labels.sh [--check] [--repo owner/name] [path]
#
#   --check   Report missing labels and exit 1 instead of creating them.
#   --repo    Target repository (default: the current gh repository).
#
# Exit codes:
#   0 - All referenced labels exist (or were created)
#   1 - Missing labels in --check mode, missing dependency, or gh failure
#
# Requires gh (authenticated) and bun, run from the repository root after
# `bun install` (the YAML is parsed with the project's js-yaml).
#
set -euo pipefail

CHECK_ONLY=false
REPO_ARGS=()
DEPENDABOT_PATH=".github/dependabot.yml"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check)
      CHECK_ONLY=true
      shift
      ;;
    --repo)
      REPO_ARGS=(--repo "${2:?--repo requires owner/name}")
      shift 2
      ;;
    *)
      DEPENDABOT_PATH="$1"
      shift
      ;;
  esac
done

for tool in gh bun; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "[ERROR] $tool is required." >&2
    exit 1
  fi
done

if [[ ! -f "$DEPENDABOT_PATH" ]]; then
  echo "[ERROR] Dependabot config not found at: $DEPENDABOT_PATH" >&2
  exit 1
fi

# Unique labels across all update entries, one per line.
WANTED=$(bun -e '
  const { load } = await import("js-yaml");
  const config = load(await Bun.file(process.argv[1]).text()) ?? {};
  const labels = (config.updates ?? []).flatMap(update => update.labels ?? []);
  console.log([...new Set(labels)].join("\n"));
' "$DEPENDABOT_PATH")

if [[ -z "$WANTED" ]]; then
  echo "[INFO] $DEPENDABOT_PATH references no custom labels."
  exit 0
fi

EXISTING=$(gh label list "${REPO_ARGS[@]}" --limit 1000 --json name --jq '.[].name')

label_metadata() {
  case "$1" in
    dependencies) echo "0366d6|Pull requests that update a dependency file" ;;
    ci) echo "000000|Changes to CI workflows and GitHub Actions" ;;
    docker) echo "21ceff|Pull requests that update Docker images" ;;
    *) echo "ededed|Applied by Dependabot" ;;
  esac
}

missing=0
while IFS= read -r label; do
  if grep -Fxq -- "$label" <<<"$EXISTING"; then
    echo "[OK] label exists: $label"
    continue
  fi
  if [[ "$CHECK_ONLY" == true ]]; then
    echo "[MISSING] label referenced by $DEPENDABOT_PATH: $label" >&2
    missing=1
    continue
  fi
  IFS='|' read -r color description <<<"$(label_metadata "$label")"
  gh label create "$label" "${REPO_ARGS[@]}" --color "$color" --description "$description"
  echo "[CREATED] label: $label"
done <<<"$WANTED"

if [[ "$missing" -ne 0 ]]; then
  echo "[ERROR] Run ./scripts/sync_dependabot_labels.sh to create the missing labels." >&2
  exit 1
fi
