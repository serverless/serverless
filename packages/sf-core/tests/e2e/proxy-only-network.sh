#!/usr/bin/env bash
# Runs the end-to-end proxy test (tests/e2e/proxy.test.js) in a Docker network
# whose only way to the internet is a proxy: the proxy sits on both networks,
# the tests on the internal one only. A request that ignores the proxy fails
# here instead of silently going direct.
#
# Usage: tests/e2e/proxy-only-network.sh [Node.js major versions]   (default: 24 26)
# Needs: Docker; the repository's dependencies installed (`npm ci`, on Linux,
# as the tests run the CLI from this checkout); SERVERLESS_ACCESS_KEY_DEV and
# AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN,
# AWS_REGION) in the environment. Set E2E_LOG_DIR to keep the proxy log, and
# E2E_EXTRA_CA to a CA bundle the tests' TLS connections must trust (a host
# whose own traffic goes through an intercepting proxy).
set -euo pipefail

cd "$(dirname "$0")/../.."
package_dir=$(pwd)
repo_dir=$(cd ../.. && pwd)
versions=${1:-24 26}
network=sf-core-e2e-internal
work=$(mktemp -d)
chmod 777 "$work"

remove_containers() {
  docker rm -f sf-core-e2e-tester sf-core-e2e-proxy >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
}
cleanup() {
  if [ -n "${E2E_LOG_DIR:-}" ]; then
    mkdir -p "$E2E_LOG_DIR" && cp "$work"/*.log "$E2E_LOG_DIR"/ 2>/dev/null || true
  fi
  remove_containers
  rm -rf "$work"
}
# Leftovers of an interrupted run would make the names below clash
remove_containers
trap cleanup EXIT

touch "$work/proxy.log"
chmod 666 "$work/proxy.log"

echo "creating the internal network"
docker network create --internal "$network" >/dev/null

# The npm installer's end-to-end proxy: tunnels CONNECT requests, logs each one
docker run -d --name sf-core-e2e-proxy -e HOST=0.0.0.0 \
  -v "$repo_dir/packages/sf-core-installer/tests/e2e:/e2e:ro" -v "$work:/work" \
  node:24-bookworm-slim node /e2e/proxy.js /work/proxy.log 3128 >/dev/null
docker network connect --alias proxy "$network" sf-core-e2e-proxy

extra_ca=()
if [ -n "${E2E_EXTRA_CA:-}" ]; then
  extra_ca=(-v "$E2E_EXTRA_CA:/extra-ca.pem:ro" -e NODE_EXTRA_CA_CERTS=/extra-ca.pem)
fi

run_tester() { # <node major> <command...>
  local major=$1
  shift
  # Variables passed by name, so their values stay off the command line.
  # The full image, not -slim: the CLI needs the system CA certificates.
  docker run --rm --name sf-core-e2e-tester --network "$network" \
    -v "$repo_dir:/repo:ro" -v "$work:/work" -w /repo/packages/sf-core \
    -e E2E_PROXY=http://proxy:3128 -e E2E_PROXY_LOG=/work/proxy.log \
    -e SERVERLESS_ACCESS_KEY_DEV \
    -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_SESSION_TOKEN \
    -e AWS_REGION -e AWS_DEFAULT_REGION \
    ${extra_ca[@]+"${extra_ca[@]}"} "node:$major-bookworm" "$@"
}

echo "waiting for the proxy"
ready=false
for _ in $(seq 1 30); do
  if docker run --rm --network "$network" node:24-bookworm-slim node -e \
    "require('net').connect(3128, 'proxy').on('connect', () => process.exit(0)).on('error', () => process.exit(1))"; then
    ready=true
    break
  fi
  sleep 1
done
if [ "$ready" != true ]; then
  echo "the proxy did not start listening" >&2
  exit 1
fi

echo "checking that the internal network has no direct internet access"
if run_tester 24 node -e "fetch('https://core.serverless.com/').then(() => process.exit(0), () => process.exit(1))"; then
  echo "direct internet access is possible; the network is not isolated" >&2
  exit 1
fi

for major in $versions; do
  echo "running the test on Node.js $major"
  run_tester "$major" node --test tests/e2e/proxy.test.js
done
