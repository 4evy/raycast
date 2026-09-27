#!/bin/bash
# shellcheck shell=bash
# Extract Raycast's SQLCipher database encryption key
#
# Raycast boots its backend through a bundled Node binary. This script swaps
# that binary for a wrapper, restarts Raycast to capture the key, then restores
# the original. The key is cached beside the runtime with mode 0600
#
# Restarts Raycast twice and exits early when a key is already cached

set -euo pipefail

restore_node() {
  if [[ -f "$2" ]]; then
    rm -f "$1"
    mv "$2" "$1"
  fi
}

# Lock extraction, preload the key hook, and restore Node after Raycast starts
main() {
  if [[ -z "${RAYCAST_LOCK_HELD:-}" ]]; then
    local lock
    lock="/tmp/raycast-manager-$(id -u).lock"
    exec /usr/bin/lockf -k "${lock}" /usr/bin/env RAYCAST_LOCK_HELD=1 "$0" "$@"
  fi

  local script_dir default_app_support app_support app keydump_hook wait_timeout
  script_dir="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
  default_app_support="${HOME}/Library/Application Support/com.raycast.macos"
  app_support="${RAYCAST_APP_SUPPORT:-${default_app_support}}"
  app="${RAYCAST_APP_BUNDLE:-${RAYCAST_APP:-/Applications/Raycast.app}}"
  keydump_hook="${RAYCAST_KEYDUMP_HOOK:-${script_dir}/../keydump.cts}"
  if [[ -f "${script_dir}/../keydump.cjs" &&
    -z "${RAYCAST_KEYDUMP_HOOK:-}" ]]; then
    keydump_hook="${script_dir}/../keydump.cjs"
  fi
  wait_timeout="${RAYCAST_KEYDUMP_TIMEOUT:-60}"

  if [[ ! -f "${keydump_hook}" ]]; then
    echo "keydump hook not found: ${keydump_hook}" >&2
    exit 1
  fi
  if [[ ! "${wait_timeout}" =~ ^[0-9]+$ ]]; then
    echo "invalid keydump timeout: ${wait_timeout}" >&2
    exit 1
  fi

  local runtime="${app_support}/node/runtime"
  if [[ ! -d "${runtime}" ]]; then
    echo 'starting Raycast once to initialize its Node runtime'
    /usr/bin/open "${app}"
    local i=0
    while [[ ! -d "${runtime}" ]] && ((i < wait_timeout)); do
      ((i += 1))
      sleep 1
    done
    if [[ ! -d "${runtime}" ]]; then
      echo "Raycast Node runtime not found under ${runtime}" >&2
      exit 1
    fi
  fi

  local bin_dir='' candidate version best_version='' latest_version
  shopt -s nullglob
  for candidate in "${runtime}"/node-v*/bin; do
    [[ -f "${candidate}/node" || -f "${candidate}/node.real" ]] || continue
    version="${candidate%/bin}"
    version="${version##*/node-v}"
    latest_version="$(
      printf '%s\n%s\n' "${version}" "${best_version}" |
        sort -V | tail -n 1
    )"
    if [[ "${latest_version}" == "${version}" ]]; then
      best_version="${version}"
      bin_dir="${candidate}"
    fi
  done
  shopt -u nullglob
  if [[ -z "${bin_dir}" ]]; then
    echo "no node runtime found under ${runtime}" >&2
    exit 1
  fi

  local node_bin="${bin_dir}/node"
  local node_real="${bin_dir}/node.real"
  local key_file="${bin_dir}/.raycast-key-cache"

  # Recover a swap left behind by an interrupted earlier run
  restore_node "${node_bin}" "${node_real}"
  rm -f "${bin_dir}/.keydump.cjs"
  if [[ -s "${key_file}" ]]; then
    chmod 600 "${key_file}"
    echo "using cached Raycast DB key: ${key_file}"
    return
  fi

  local quoted_key_file quoted_node_real quoted_keydump_hook
  printf -v quoted_key_file '%q' "${key_file}"
  printf -v quoted_node_real '%q' "${node_real}"
  printf -v quoted_keydump_hook '%q' "${keydump_hook}"

  cleanup_node_bin="${node_bin}"
  cleanup_node_real="${node_real}"
  trap 'restore_node "${cleanup_node_bin}" "${cleanup_node_real}"' EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  mv "${node_bin}" "${node_real}"
  cat >"${node_bin}" <<EOF_WRAPPER
#!/bin/bash
export RAYCAST_KEYDUMP_FILE=${quoted_key_file}
exec ${quoted_node_real} --require ${quoted_keydump_hook} "\$@"
EOF_WRAPPER
  chmod 755 "${node_bin}"

  echo 'extracting Raycast DB key (Raycast will restart)'
  /usr/bin/killall Raycast 2>/dev/null || true
  /usr/bin/open "${app}"
  local i=0
  while [[ ! -s "${key_file}" ]] && ((i < wait_timeout)); do
    ((i += 1))
    sleep 1
  done
  /usr/bin/killall Raycast 2>/dev/null || true
  sleep 2

  restore_node "${node_bin}" "${node_real}"
  trap - EXIT INT TERM
  if [[ -s "${key_file}" ]]; then
    chmod 600 "${key_file}"
    echo "Raycast DB key extracted: ${key_file}"
  else
    echo "failed to capture Raycast DB key within ${wait_timeout}s" >&2
    exit 1
  fi
}

main "$@"
