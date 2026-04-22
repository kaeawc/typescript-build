#!/usr/bin/env bash
#
# Validate the package artifact shape, exported types, and built CLI entry.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

mkdir -p scratch/package-quality

bun run build

if [[ ! -x dist/src/index.js ]]; then
  echo "dist/src/index.js must be executable" >&2
  exit 1
fi

./dist/src/index.js --help > scratch/package-quality/cli-help.txt

bunx publint run --pack bun --strict > scratch/package-quality/publint.log
bunx attw --pack . --profile esm-only --format table --no-emoji > scratch/package-quality/attw.log

echo "OK: package quality checks passed"
