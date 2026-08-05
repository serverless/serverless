#!/bin/bash

version=$(cat ./package.json | jq -r .version)
is_canary=${IS_CANARY:-false}
s3_bucket="install.serverless.com"

if [ "$is_canary" = true ]; then
    s3_bucket="install.serverless-dev.com"
    # For canary builds, append the git SHA
    version="$(git rev-parse --short HEAD)"
fi

echo "Preparing release for version ${version}"
echo "Using S3 bucket: ${s3_bucket}"

# cd $upload_temp_dir
cd ./scripts

aws s3 cp s3://${s3_bucket}/releases.json ./
node updateReleasesJson.cjs
node prepareDistributionTarballs.js
cd ../../framework-dist
bash ../sf-core/scripts/pack-framework-dist.sh

# Assert the packed tarball really carries the prebuilt MCP Lambda entry before
# anything is uploaded: a path drift would ship a CLI where every MCP deploy
# fails with MCP_ENTRY_BUNDLE_MISSING, and no PR CI runs this workflow.
# `|| exit 1` because this script does not `set -e` — without it a failed check
# would be printed and then the broken tarball uploaded anyway.
verify_dir=$(mktemp -d)
trap 'rm -rf "${verify_dir}"' EXIT
tar -xzf ./serverlessinc-framework-alpha-${version}.tgz -C "${verify_dir}" || exit 1
node ../sf-core/scripts/verify-mcp-entry-packaging.js "${verify_dir}/package" || exit 1

if [ "$is_canary" = true ]; then
    aws s3 cp ./serverlessinc-framework-alpha-${version}.tgz s3://${s3_bucket}/archives/canary-${version}.tgz
    aws s3 cp ./serverlessinc-framework-alpha-${version}.tgz s3://${s3_bucket}/archives/canary.tgz
else
    aws s3 cp ./serverlessinc-framework-alpha-${version}.tgz s3://${s3_bucket}/archives/serverless-${version}.tgz
fi

cd ../sf-core/scripts
aws s3 cp ./releases.json s3://${s3_bucket}/releases.json

if [ "$is_canary" = false ]; then
    npm run -w=release-scripts publish:release ${version}
    npm run -w=release-scripts publish:release-metadata ${version}
    git tag sf-core-installer@${version}
    git push --tags
fi
