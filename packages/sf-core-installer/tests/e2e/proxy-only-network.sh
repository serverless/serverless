#!/usr/bin/env bash
# Runs the end-to-end install tests in a Docker network whose only way to the
# internet is a proxy: the registry and the proxies sit on both networks, the
# tests on the internal one only. A download that ignores the proxy fails
# here instead of silently going direct.
#
# Usage: tests/e2e/proxy-only-network.sh [package-manager specs]
# Set E2E_LOG_DIR to keep the proxy and registry logs.
# Requires Docker. Run from anywhere; paths are resolved from this script.
set -euo pipefail

cd "$(dirname "$0")/../.."
package_dir=$(pwd)
e2e_dir="$package_dir/tests/e2e"
specs=${1:-npm@11.20.0,npm@12.1.0,pnpm@11.28.2,yarn@1.22.22,yarn@4.18.1,bun}
node_image=node:24-bookworm-slim
network=sf-e2e-internal
work=$(mktemp -d)
chmod 777 "$work"

remove_containers() {
  docker rm -f sf-e2e-tester sf-e2e-registry sf-e2e-proxy sf-e2e-auth-proxy >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
}
cleanup() {
  # Keep the proxy logs for inspection when asked (CI uploads them)
  if [ -n "${E2E_LOG_DIR:-}" ]; then
    mkdir -p "$E2E_LOG_DIR" && cp "$work"/*.log "$E2E_LOG_DIR"/ 2>/dev/null || true
    for name in sf-e2e-registry sf-e2e-proxy sf-e2e-auth-proxy; do
      docker logs "$name" > "$E2E_LOG_DIR/$name.log" 2>&1 || true
    done
  fi
  remove_containers
  rm -rf "$work"
}
# Leftovers of an interrupted run would make the names below clash
remove_containers
trap cleanup EXIT

echo "packing the installer"
npm pack --pack-destination "$work" >/dev/null
tarball=$(basename "$(ls "$work"/*.tgz)")
touch "$work/proxy.log" "$work/auth-proxy.log"
chmod 666 "$work"/*.log

echo "creating the internal network"
docker network create --internal "$network" >/dev/null

start() { # <name> <command...>: runs on the default network, joins the internal one
  local name=$1
  shift
  docker run -d --name "$name" -e HOST=0.0.0.0 \
    -v "$e2e_dir:/e2e:ro" -v "$work:/work" \
    "$node_image" "$@" >/dev/null
  docker network connect --alias "${name#sf-e2e-}" "$network" "$name"
}
start sf-e2e-registry node /e2e/registry.js "/work/$tarball" 4873
start sf-e2e-proxy node /e2e/proxy.js /work/proxy.log 3128
start sf-e2e-auth-proxy node /e2e/proxy.js /work/auth-proxy.log 3129 'e2e user:p@ss'

echo "building the test image with the package managers preinstalled"
# The full image, not -slim: the launcher needs the system CA certificates
# that slim images leave out
docker build -q -t sf-e2e-tester - >/dev/null <<EOF
FROM node:24-bookworm
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 COREPACK_ENABLE_STRICT=0
RUN corepack pnpm@11.28.2 --version && corepack yarn@4.18.1 --version \\
  && corepack yarn@1.22.22 --version \\
  && npm install -g --no-audit --no-fund bun@1.3.12 \\
  && npx -y npm@11.20.0 --version && npx -y npm@12.1.0 --version
EOF

run_tester() {
  docker run --rm --name sf-e2e-tester --network "$network" \
    -v "$package_dir:/repo:ro" -v "$work:/work" -w /repo \
    -e E2E_REGISTRY=http://registry:4873 \
    -e E2E_PROXY=http://proxy:3128 \
    -e E2E_AUTH_PROXY='http://e2e%20user:p%40ss@auth-proxy:3129' \
    -e E2E_PROXY_LOG=/work/proxy.log \
    -e E2E_AUTH_PROXY_LOG=/work/auth-proxy.log \
    -e E2E_DIRECT=false \
    -e E2E_PACKAGE_MANAGERS="$specs" \
    sf-e2e-tester "$@"
}

# The registry starts listening only after hashing the tarball, so a
# connection it accepts means it is ready
wait_for() { # <host> <port>
  for _ in $(seq 1 30); do
    if docker run --rm --network "$network" "$node_image" node -e \
      "require('net').connect($2, '$1').on('connect', () => process.exit(0)).on('error', () => process.exit(1))"; then
      return 0
    fi
    sleep 1
  done
  echo "$1:$2 did not start listening" >&2
  exit 1
}
echo "waiting for the registry and the proxies"
wait_for registry 4873
wait_for proxy 3128
wait_for auth-proxy 3129

echo "checking that the internal network has no direct internet access"
if run_tester node -e "fetch('https://install.serverless.com/installer-builds/').then(() => process.exit(0), () => process.exit(1))"; then
  echo "direct internet access is possible; the network is not isolated" >&2
  exit 1
fi

echo "running the tests for: $specs"
run_tester node --test tests/e2e/install.test.js
