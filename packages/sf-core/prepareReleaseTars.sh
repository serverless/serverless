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
npm pack
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
