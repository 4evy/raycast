#!/bin/bash
# shellcheck shell=bash
# Derive Raycast's SQLCipher passphrase from its login Keychain backup
# The passphrase is cached beside the runtime with mode 0600

set -euo pipefail

# Lock extraction and cache the passphrase without modifying Raycast
main() {
  if [[ -z "${RAYCAST_LOCK_HELD:-}" ]]; then
    local lock
    lock="/tmp/raycast-manager-$(id -u).lock"
    exec /usr/bin/lockf -k "${lock}" /usr/bin/env RAYCAST_LOCK_HELD=1 "$0" "$@"
  fi

  local default_app_support app_support app wait_timeout
  default_app_support="${HOME}/Library/Application Support/com.raycast.macos"
  app_support="${RAYCAST_APP_SUPPORT:-${default_app_support}}"
  app="${RAYCAST_APP_BUNDLE:-${RAYCAST_APP:-/Applications/Raycast.app}}"
  wait_timeout=60

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
    [[ -f "${candidate}/node" ]] || continue
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

  local key_file="${bin_dir}/.raycast-key-cache"

  if [[ -s "${key_file}" ]]; then
    chmod 600 "${key_file}"
    echo "using cached Raycast DB key: ${key_file}"
    return
  fi

  local key key_temp
  if ! key="$(/usr/bin/security find-generic-password \
    -s com.raycast.macos -a database_key_backup -w)"; then
    echo 'cannot read the Raycast database key backup from Keychain; open Raycast and allow Keychain access, then retry' >&2
    exit 1
  fi
  if [[ ! "${key}" =~ ^[[:xdigit:]]{64}$ ]]; then
    echo 'Raycast database key backup must contain 64 hexadecimal characters' >&2
    exit 1
  fi

  umask 077
  key_temp="$(mktemp "${key_file}.XXXXXX")"
  cleanup_key_file="${key_temp}"
  trap 'rm -f "${cleanup_key_file}"' EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  # Raycast's derivePassphrase hashes the stored key followed by this salt
  printf '%s%s' "${key}" 'yvkwWXzxPPBAqY2tmaKrB*DvYjjMaeEf' |
    /usr/bin/shasum -a 256 | cut -d ' ' -f 1 >"${key_temp}"
  chmod 600 "${key_temp}"
  mv "${key_temp}" "${key_file}"
  trap - EXIT INT TERM
  echo "Raycast DB key extracted from Keychain: ${key_file}"
}

main "$@"
