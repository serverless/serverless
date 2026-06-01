#!/bin/bash
# Package packages/framework-dist into a tarball matching the release format.
# Must be invoked with framework-dist as CWD.
# Shared by prepareReleaseTars.sh (release flow) and test:build (local dev).
set -euo pipefail

version=$(jq -r .version package.json)

# Remove temporary test files that should not be in the release archive.
rm -f dist/test-*.js dist/test-*.js.map

# --uid/--gid/--uname/--gname: normalize ownership to 0/0 to avoid leaking the
# invoking user into the archive.
#
# `db.json.gz` is the AWS resource-spec database used by `serverless diff` —
# the bundled code resolves its path relative to its own location at the
# package root, so the file must sit there as a sibling of `package.json`
# rather than under `dist/`/`lib/`/`docs/`. It's copied into place by
# `prepareDistributionTarballs.js` before this script runs.
if tar --version 2>&1 | grep -q 'GNU'; then
    tar czf "serverlessinc-framework-alpha-${version}.tgz" \
        --transform='s,^,package/,' \
        --owner=0 --group=0 --numeric-owner \
        package.json dist lib docs db.json.gz
else
    # BSD tar (macOS)
    tar czf "serverlessinc-framework-alpha-${version}.tgz" \
        -s ',^,package/,' \
        --uid=0 --gid=0 --uname='' --gname='' \
        package.json dist lib docs db.json.gz
fi
