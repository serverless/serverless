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

# Verify the packed tarball before anything is uploaded: a packaging drift
# (a missing MCP Lambda entry, bundled skill or config-validator runtime file)
# would ship a CLI that fails only in the release, and no PR CI runs this
# workflow. PR CI runs the same checks on its own build of the package.
# `|| exit 1` because this script does not `set -e` — without it a failed check
# would be printed and then the broken tarball uploaded anyway.
verify_dir=$(mktemp -d)
trap 'rm -rf "${verify_dir}"' EXIT
tar -xzf ./serverlessinc-framework-alpha-${version}.tgz -C "${verify_dir}" || exit 1
bash ../sf-core/scripts/verify-release-package.sh "${verify_dir}/package" || exit 1

if [ "$is_canary" = true ]; then
    aws s3 cp ./serverlessinc-framework-alpha-${version}.tgz s3://${s3_bucket}/archives/canary-${version}.tgz
    aws s3 cp ./serverlessinc-framework-alpha-${version}.tgz s3://${s3_bucket}/archives/canary.tgz
else
    aws s3 cp ./serverlessinc-framework-alpha-${version}.tgz s3://${s3_bucket}/archives/serverless-${version}.tgz
fi

cd ../sf-core/scripts
aws s3 cp ./releases.json s3://${s3_bucket}/releases.json

if [ "$is_canary" = false ]; then
    npm run -w=@serverlessinc/release-scripts publish:release ${version}
    npm run -w=@serverlessinc/release-scripts publish:release-metadata ${version}
    git tag sf-core-installer@${version}
    git push --tags
fi
