#!/bin/bash

# Stop at the first failed step. The archive is uploaded before the files that
# point launchers at it, so a failure part-way never lists a release that is not
# on the host; and every step can run again, so a failed run can be repeated.
set -euo pipefail

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
# (a missing MCP Lambda entry, Dev Mode layer zip, Dev Mode runtime client or
# TypeScript loader, bundled skill or config-validator runtime file)
# would ship a CLI that fails only in the release, and no PR CI runs this
# workflow. PR CI runs the same checks on its own build of the package.
verify_dir=$(mktemp -d)
trap 'rm -rf "${verify_dir}"' EXIT
tar -xzf ./serverlessinc-framework-alpha-${version}.tgz -C "${verify_dir}"
bash ../sf-core/scripts/verify-release-package.sh "${verify_dir}/package"

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
    tag="sf-core-installer@${version}"
    if ! git rev-parse -q --verify "refs/tags/${tag}" >/dev/null; then
        git tag "${tag}"
    fi
    git push origin "${tag}"
fi
