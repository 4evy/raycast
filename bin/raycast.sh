#!/bin/bash
# shellcheck shell=bash
# Run the Raycast CLI from this checkout

set -euo pipefail

root="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
exec node "${root}/src/cli/main.mts" "$@"
