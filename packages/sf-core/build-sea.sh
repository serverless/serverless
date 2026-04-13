#!/usr/bin/env bash
# =============================================================================
# build-sea.sh — Build a Serverless Framework SEA binary
# =============================================================================
#
# Produces a standalone binary that replaces `node sf-core.js`.
# No Node.js, npm, or npm install needed on the target machine.
#
# Requires: Node.js 25.5+ (for --build-sea)
#
# Usage: cd packages/sf-core && bash build-sea.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

REPO_ROOT="$(cd ../.. && pwd)"
VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('package.json','utf8')).version)")

echo "=== Building Serverless Framework SEA v${VERSION} ==="
echo ""

# ---------------------------------------------------------------------------
# Step 0: Verify Node.js version
# ---------------------------------------------------------------------------
NODE_VERSION=$(node --version)
MAJOR=$(echo "$NODE_VERSION" | sed 's/v\([0-9]*\).*/\1/')
if [ "$MAJOR" -lt 25 ]; then
  echo "ERROR: Node.js 25.5+ required for --build-sea. You have $NODE_VERSION"
  exit 1
fi
echo "Node.js: $NODE_VERSION"

# ---------------------------------------------------------------------------
# Step 1: Build the dev mode shim (needed before bundling)
# ---------------------------------------------------------------------------
echo ""
echo "Step 1: Building dev mode shim..."
SHIM_DIR="${REPO_ROOT}/packages/serverless/lib/plugins/aws/dev"
if [ ! -f "$SHIM_DIR/shim.min.js" ] || [ "$SHIM_DIR/shim.js" -nt "$SHIM_DIR/shim.min.js" ]; then
  cd "$SHIM_DIR"
  "${REPO_ROOT}/node_modules/.bin/esbuild" ./shim.js --bundle --platform=node --minify --outfile=./shim.min.js 2>&1
  cd "$SCRIPT_DIR"
  echo "Shim built."
else
  echo "Shim already up to date, skipping."
fi

# ---------------------------------------------------------------------------
# Step 2: Bundle sf-core with esbuild (no externals, SEA-specific config)
# ---------------------------------------------------------------------------
echo ""
echo "Step 2: Bundling sf-core (all deps included)..."
# esbuild-sea.js imports 'esbuild' which is installed in the repo's node_modules.
# Run with the repo's Node (not necessarily Node 25) since esbuild just needs
# to bundle files — no SEA-specific APIs needed here.
# Set ESBUILD_BINARY_PATH so esbuild's JS API can find its native binary.
ESBUILD_BINARY_PATH="${REPO_ROOT}/node_modules/@esbuild/$(node -e "
  const p = process.platform === 'darwin' ? 'darwin' : 'linux';
  const a = process.arch === 'arm64' ? 'arm64' : 'x64';
  process.stdout.write(p + '-' + a);
")/bin/esbuild" node esbuild-sea.js

BUNDLE_SIZE=$(du -h dist/sf-core.bundle.js | cut -f1)
echo "Bundle: dist/sf-core.bundle.js ($BUNDLE_SIZE)"

# ---------------------------------------------------------------------------
# Step 3: Find platform-specific esbuild binary
# ---------------------------------------------------------------------------
echo ""
echo "Step 3: Locating esbuild native binary..."

PLATFORM="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$PLATFORM" in
  darwin) ESBUILD_PLATFORM="darwin" ;;
  linux)  ESBUILD_PLATFORM="linux" ;;
  *)      echo "Unsupported: $PLATFORM"; exit 1 ;;
esac

case "$ARCH" in
  x86_64)       ESBUILD_ARCH="x64" ;;
  aarch64|arm64) ESBUILD_ARCH="arm64" ;;
  *)            echo "Unsupported: $ARCH"; exit 1 ;;
esac

ESBUILD_BIN="${REPO_ROOT}/node_modules/@esbuild/${ESBUILD_PLATFORM}-${ESBUILD_ARCH}/bin/esbuild"
if [ ! -f "$ESBUILD_BIN" ]; then
  echo "ERROR: esbuild binary not found at $ESBUILD_BIN"
  exit 1
fi
echo "esbuild binary: $ESBUILD_BIN ($(du -h "$ESBUILD_BIN" | cut -f1))"

# ---------------------------------------------------------------------------
# Step 4: Collect support files and build asset manifest
# ---------------------------------------------------------------------------
echo ""
echo "Step 4: Collecting support files for SEA assets..."

STAGING="dist/staging"
rm -rf "$STAGING"
mkdir -p "$STAGING"

# Write version file
echo "$VERSION" > "$STAGING/version.txt"

# Helper: copy file to staging and record in manifest
MANIFEST="$STAGING/manifest.json"
echo "[]" > "$MANIFEST"

add_asset() {
  local src="$1"
  local target="$2"
  local executable="${3:-false}"
  local asset_key="asset:${target}"

  mkdir -p "$STAGING/assets/$(dirname "$target")"
  cp "$src" "$STAGING/assets/$target"

  # Append to manifest JSON
  local tmp=$(mktemp)
  node -e "
    const m = JSON.parse(require('fs').readFileSync('$MANIFEST','utf8'));
    m.push({assetKey:'$asset_key',target:'$target',executable:$executable});
    require('fs').writeFileSync('$MANIFEST',JSON.stringify(m,null,2));
  "
}

# CloudFormation templates
SLS_LIB="${REPO_ROOT}/packages/serverless/lib"
add_asset "$SLS_LIB/plugins/aws/package/lib/core-cloudformation-template.json" \
          "lib/plugins/aws/package/lib/core-cloudformation-template.json"
add_asset "$SLS_LIB/plugins/aws/package/lib/iam-role-lambda-execution-template.json" \
          "lib/plugins/aws/package/lib/iam-role-lambda-execution-template.json"

# Invoke-local runtime wrappers
add_asset "$SLS_LIB/plugins/aws/invoke-local/runtime-wrappers/invoke.py" \
          "lib/plugins/aws/invoke-local/runtime-wrappers/invoke.py" true
add_asset "$SLS_LIB/plugins/aws/invoke-local/runtime-wrappers/invoke.rb" \
          "lib/plugins/aws/invoke-local/runtime-wrappers/invoke.rb" true

# Java runtime wrapper (jar)
if [ -f "$SLS_LIB/plugins/aws/invoke-local/runtime-wrappers/java/target/invoke-bridge-1.0.1.jar" ]; then
  add_asset "$SLS_LIB/plugins/aws/invoke-local/runtime-wrappers/java/target/invoke-bridge-1.0.1.jar" \
            "lib/plugins/aws/invoke-local/runtime-wrappers/java/target/invoke-bridge-1.0.1.jar"
fi

# Custom resources
for f in $(find "$SLS_LIB/plugins/aws/custom-resources/resources" -type f); do
  rel="${f#$SLS_LIB/}"
  add_asset "$f" "lib/$rel"
done

# Dev mode shim
add_asset "$SLS_LIB/plugins/aws/dev/shim.min.js" \
          "lib/plugins/aws/dev/shim.min.js"

# Dev local-lambda runtime wrapper
add_asset "$SLS_LIB/plugins/aws/dev/local-lambda/runtime-wrappers/node.js" \
          "lib/plugins/aws/dev/local-lambda/runtime-wrappers/node.js" true

# Python unzip_requirements.py
add_asset "$SLS_LIB/plugins/python/unzip_requirements.py" \
          "lib/plugins/python/unzip_requirements.py"

# CFN runner JSON (statuses.json, base.json)
SF_CORE_SRC="${SCRIPT_DIR}/src"
add_asset "$SF_CORE_SRC/lib/runners/cfn/aws/statuses.json" "dist/statuses.json"
add_asset "$SF_CORE_SRC/lib/runners/cfn/aws/base.json" "dist/base.json"

# Containers (Dockerfiles + support for dev mode)
ENGINE_CONTAINERS="${REPO_ROOT}/packages/engine/src/lib/devMode/containers"
if [ -d "$ENGINE_CONTAINERS" ]; then
  for f in $(find "$ENGINE_CONTAINERS" -type f); do
    rel="${f#$ENGINE_CONTAINERS/}"
    add_asset "$f" "dist/containers/$rel"
  done
fi

# Docs (for MCP server)
DOCS_DIR="${REPO_ROOT}/docs"
if [ -d "$DOCS_DIR" ]; then
  for f in $(find "$DOCS_DIR" -type f); do
    rel="${f#$DOCS_DIR/}"
    add_asset "$f" "docs/$rel"
  done
fi

# Sourcemap
if [ -f "dist/sf-core.bundle.js.map" ]; then
  add_asset "dist/sf-core.bundle.js.map" "dist/sf-core.js.map"
fi

# .node files (native addons copied by esbuild's file loader)
for node_file in dist/*.node; do
  if [ -f "$node_file" ]; then
    basename=$(basename "$node_file")
    add_asset "$node_file" "dist/$basename"
  fi
done

ASSET_COUNT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$MANIFEST','utf8')).length)")
echo "Collected $ASSET_COUNT support files"

# ---------------------------------------------------------------------------
# Step 5: Write sea-config.json
# ---------------------------------------------------------------------------
echo ""
echo "Step 5: Writing sea-config.json..."

# Build the assets object for sea-config
ASSETS_JSON=$(node -e "
  const manifest = JSON.parse(require('fs').readFileSync('$MANIFEST','utf8'));
  const assets = {
    'version': '$STAGING/version.txt',
    'asset-manifest.json': '$MANIFEST',
    'esbuild-bin': '$ESBUILD_BIN',
  };
  for (const entry of manifest) {
    assets[entry.assetKey] = '$STAGING/assets/' + entry.target;
  }
  console.log(JSON.stringify(assets, null, 4));
")

cat > dist/sea-config.json << EOF
{
  "main": "dist/sf-core.bundle.js",
  "output": "dist/sf-core-sea",
  "mainFormat": "module",
  "assets": $ASSETS_JSON,
  "disableExperimentalSEAWarning": true
}
EOF

# ---------------------------------------------------------------------------
# Step 6: Build the SEA binary
# ---------------------------------------------------------------------------
echo ""
echo "Step 6: Building SEA binary..."
node --build-sea dist/sea-config.json

SEA_SIZE=$(du -h dist/sf-core-sea | cut -f1)
echo "SEA binary: dist/sf-core-sea ($SEA_SIZE)"

# ---------------------------------------------------------------------------
# Step 7: Sign on macOS
# ---------------------------------------------------------------------------
if [ "$(uname)" = "Darwin" ]; then
  echo ""
  echo "Step 7: Signing (macOS)..."
  codesign --sign - dist/sf-core-sea
fi

# ---------------------------------------------------------------------------
# Step 8: Quick smoke test
# ---------------------------------------------------------------------------
echo ""
echo "=== Smoke test ==="
echo ""
./dist/sf-core-sea --version || echo "WARN: --version failed (may need further debugging)"

echo ""
echo "=== Build complete ==="
echo "Binary: $(pwd)/dist/sf-core-sea ($SEA_SIZE)"
echo "To test: ./dist/sf-core-sea --help"
