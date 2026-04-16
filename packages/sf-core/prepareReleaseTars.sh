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

version_folder=$(git describe --tags --abbrev=0)
aws s3 cp s3://${s3_bucket}/releases.json ./
node updateReleasesJson.cjs
node prepareDistributionTarballs.js
cd ../../framework-dist
# Replace npm pack — it strips node_modules/ directories (hardcoded).
# We need dist/node_modules/ for ajv runtime files + esbuild binaries.
# Remove temporary test files that should not be in the release archive.
rm -f dist/test-*.js dist/test-*.js.map

# --uid/--gid/--uname/--gname: normalize ownership to 0/0 like npm pack does
# (prevents leaking CI username into the archive)
if tar --version 2>&1 | grep -q 'GNU'; then
    tar czf "serverlessinc-framework-alpha-${version}.tgz" \
        --transform='s,^,package/,' \
        --owner=0 --group=0 --numeric-owner \
        package.json dist lib docs
else
    # BSD tar (macOS) for local testing
    tar czf "serverlessinc-framework-alpha-${version}.tgz" \
        -s ',^,package/,' \
        --uid=0 --gid=0 --uname='' --gname='' \
        package.json dist lib docs
fi
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
