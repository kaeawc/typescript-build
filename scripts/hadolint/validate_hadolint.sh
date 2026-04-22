#!/usr/bin/env bash

set -euo pipefail

INSTALL_HADOLINT_WHEN_MISSING=${INSTALL_HADOLINT_WHEN_MISSING:-false}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Get project root (parent directory of scripts)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Check for required commands and install missing commands if allowed
echo -e "${YELLOW}Checking for required commands...${NC}"

# Check if hadolint is installed
if ! command_exists hadolint; then
    echo -e "${RED}hadolint is not installed${NC}"
    if [[ "${INSTALL_HADOLINT_WHEN_MISSING}" == "true" ]]; then
        echo -e "${YELLOW}Installing hadolint...${NC}"
        if [[ -f "$PROJECT_ROOT/scripts/hadolint/install_hadolint.sh" ]]; then
            if ! bash "$PROJECT_ROOT/scripts/hadolint/install_hadolint.sh"; then
                echo -e "${RED}Failed to install hadolint${NC}"
                exit 1
            fi
        else
            echo -e "${RED}hadolint installation script not found${NC}"
            exit 1
        fi
    else
        echo -e "${RED}hadolint is required. Set INSTALL_HADOLINT_WHEN_MISSING=true to auto-install or install manually${NC}"
        exit 1
    fi
fi

# Verify hadolint is available
if ! command_exists hadolint; then
    echo -e "${RED}hadolint is still not available after installation attempt${NC}"
    exit 1
fi

echo -e "${GREEN}hadolint is available${NC}"

# Verify hadolint works with --version
echo -e "${YELLOW}Verifying hadolint version...${NC}"
if hadolint --version; then
    echo -e "${GREEN}hadolint version check passed${NC}"
else
    echo -e "${RED}hadolint version check failed${NC}"
    exit 1
fi

# Discover Dockerfiles anywhere in the project (git-tracked, if available).
echo -e "${YELLOW}Discovering Dockerfiles...${NC}"

dockerfiles=()
cd "$PROJECT_ROOT"

if command_exists git && git rev-parse --git-dir >/dev/null 2>&1; then
    while IFS= read -r file; do
        [[ -n "$file" ]] && dockerfiles+=("$file")
    done < <(git ls-files --cached --others --exclude-standard -z -- '**/Dockerfile' '**/Dockerfile.*' 'Dockerfile' 'Dockerfile.*' | tr '\0' '\n')
else
    while IFS= read -r file; do
        [[ -n "$file" ]] && dockerfiles+=("$file")
    done < <(find . -type f \( -name 'Dockerfile' -o -name 'Dockerfile.*' \) -not -path '*/node_modules/*' -not -path '*/.git/*' | sed 's|^\./||')
fi

if [[ ${#dockerfiles[@]} -eq 0 ]]; then
    echo -e "${YELLOW}No Dockerfiles found in $PROJECT_ROOT${NC}"
    echo -e "${GREEN}Skipping Dockerfile validation${NC}"
    exit 0
fi

# Check if .hadolint.yaml config exists
config_args=()
if [[ -f "$PROJECT_ROOT/.hadolint.yaml" ]]; then
    config_args=(--config "$PROJECT_ROOT/.hadolint.yaml")
    echo -e "${GREEN}Using hadolint config: $PROJECT_ROOT/.hadolint.yaml${NC}"
fi

echo -e "${YELLOW}Linting ${#dockerfiles[@]} Dockerfile(s):${NC}"
for f in "${dockerfiles[@]}"; do
    echo "  - $f"
done

hadolint_result=0
for dockerfile in "${dockerfiles[@]}"; do
    if [[ ${#config_args[@]} -gt 0 ]]; then
        hadolint "${config_args[@]}" "$dockerfile" || hadolint_result=$?
    else
        hadolint "$dockerfile" || hadolint_result=$?
    fi
done

if [[ $hadolint_result -eq 0 ]]; then
    echo -e "${GREEN}Dockerfile validation passed${NC}"
    exit 0
else
    echo -e "${RED}Dockerfile validation failed${NC}"
    exit 1
fi
