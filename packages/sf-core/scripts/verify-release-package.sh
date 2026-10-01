#!/bin/bash
# Verifies an extracted framework release package before it ships. The one
# list of packaging checks, shared by every place that builds the package:
# the release (prepareReleaseTars.sh, before any upload), PR CI (the
# "Test: Release Package" job in ci-framework.yml) and local runs (test:build).
# Add new packaging checks here, not at the call sites.
#
# Runs every check and fails if any failed, so one run reports all problems.
# Usage: bash verify-release-package.sh <extracted-package-dir>

package_dir="${1:?Usage: verify-release-package.sh <extracted-package-dir>}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

failed=()
check() {
  local name="$1"
  shift
  echo "--- ${name}"
  if ! "$@"; then
    failed+=("${name}")
  fi
}

# --version, not a bare run: with no command the CLI opens the interactive
# onboarding picker, which proves little and leaves escape codes in the log.
check 'packed CLI runs' node "${package_dir}/dist/sf-core.js" --version
check 'bundled skills' node "${script_dir}/verify-skills-packaging.js" "${package_dir}/dist/sf-core.js"
check 'MCP Lambda entry' node "${script_dir}/verify-mcp-entry-packaging.js" "${package_dir}"
check 'config validator' node "${script_dir}/verify-config-validator-packaging.js" "${package_dir}"

if [ "${#failed[@]}" -gt 0 ]; then
  echo 'Release package verification failed:' >&2
  printf '  - %s\n' "${failed[@]}" >&2
  exit 1
fi
echo 'Release package verification passed'
