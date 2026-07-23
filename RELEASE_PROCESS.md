# Release Process

This document describes our complete release process—from version bumping and testing to deployment.

> **Note:** Although we publish to npm as part of the process, installing the serverless CLI does not require a npm package. Users can install it using:
>
> ```bash
> curl -o- -L https://install.serverless.com | bash
> ```
>
> This ensures that the newly released version is available without requiring npm publishing.

---

## Table of Contents

1. [Overview](#overview)
2. [Pipeline Jobs](#pipeline-jobs)
3. [Release Workflow](#release-workflow)
   - [1. Version Bump & PR Creation](#1-version-bump--pr-creation)
   - [2. CI/CD Pipeline Execution](#2-cicd-pipeline-execution)
   - [3. Canary Release & Version Tagging](#3-canary-release--version-tagging)
   - [4. Production Release](#4-production-release)
   - [5. npm Package Publish](#5-npm-package-publish)
4. [Canary Releases](#canary-releases)

---

## Overview

Our release process involves updating two separate `package.json` files, running tests via our CI/CD pipeline, and executing multiple deployment jobs.
The process is automated through GitHub Actions and consists of tagging, building, publishing artifacts to S3, updating our release metadata in MongoDB, and publishing to npm.

---

## Pipeline Jobs ([release-framework.yml](.github/workflows/release-framework.yml))

The workflow triggers on pushes to `main` that touch `packages/sf-core/**`, `packages/serverless/**`, `packages/engine/**`, or `packages/mcp/**` (plus manual `workflow_dispatch`), and consists of five jobs:

- **`test-engine`:**
  Runs the engine package's unit tests.

- **`test-matrix`:**
  Runs integration tests across multiple platforms (Linux, Windows, ARM) using a matrix strategy.

- **`release-canary`:**
  Builds the project and publishes a canary release (Git-SHA-versioned). Its final step detects a version bump by diffing `packages/sf-core/package.json` against the previous commit; if a new version is found, it tags the repository with `sf-core@{version}` and pushes the tag. Note: on `workflow_dispatch` runs the diff base (`github.event.before`) is empty, so manual runs cannot produce a tag or stable release.

- **`release-stable`:**
  Only runs when a new version was detected. Builds and uploads the production tarballs, updates release metadata (MongoDB and S3), and tags the repository with `sf-core-installer@{version}` (this tag is created inside `packages/sf-core/prepareReleaseTars.sh`, not in the workflow file — distinct from the `sf-core@{version}` tag created by `release-canary`).

- **`release-npm`:**
  Publishes the installer package to npm after the stable release completes.

> **Note:** The Go-based binary installer (the `curl` install script and launcher binaries) has its own, separate release pipeline: `.github/workflows/release-binary-installer.yml`, triggered manually via `workflow_dispatch`.

---

## Release Workflow

### 1. Version Bump & PR Creation

- **Files to update:**
  - `packages/sf-core-installer/package.json`
  - `packages/sf-core/package.json`

- **Procedure:**
  Update the version in both files. Then, create a pull request (PR) with the title: `chore: release x.x.x` where `x.x.x` is the new version number. Choose the version bump per [VERSIONING.md](VERSIONING.md).

> **Warning:** The pipeline's version detection reads **only** `packages/sf-core/package.json`, and `npm publish` publishes **whatever version is in** `packages/sf-core-installer/package.json` — nothing cross-checks the two. If you bump only the installer file, no release happens at all; if you bump only the sf-core file, npm publishes a stale installer version. Always bump both, in the same PR.

### 2. CI/CD Pipeline Execution

- **Trigger:**
  Once the PR is merged into the `main` branch, our GitHub Actions pipeline (`.github/workflows/release-framework.yml`) is triggered.

- **Testing:**
  - The workflow first runs the `test-engine` job to verify the engine package functionality.
  - Then it runs the `test-matrix` job which executes integration tests across multiple platforms (Linux, Windows, ARM).
  - These tests ensure the framework works correctly across all supported environments.

- **Conditional Release Jobs:**
  If all tests pass, the release process continues with the following jobs.

### 3. Canary Release & Version Tagging

- **Job:** `release-canary`
- **Steps:**
  - Check out the repository.
  - Set up Node.js 24.x and install dependencies.
  - **Build Process:**
    - Minify the dev mode shim using esbuild.
    - Build the code using the npm build script.
  - **AWS Configuration:**
    - Configure AWS credentials using the GitHub Actions role.
  - **Canary Release:**
    - Run `prepareReleaseTars.sh` with `IS_CANARY=true` environment variable.
    - This script:
      - Uses the Git SHA as the version identifier.
      - Updates the canary `releases.json` file.
      - Prepares distribution tarballs with necessary files.
      - Uploads the tarballs to the canary S3 bucket (`install.serverless-dev.com`).
  - **CloudFront Invalidation:**
    - Create an invalidation for the canary CloudFront distribution.
  - **Version Detection & Tagging:**
    - Check if there's a new version by comparing the current `package.json` with the previous one.
    - If a new version is detected (and not 0.0.0), tag the repository with `sf-core@x.x.x`.
    - Push the tag to GitHub.
    - Output the new version for use by subsequent jobs.

- **Outcome:**
  - A canary release is published for early testing.
  - If a new version is detected, the repository is tagged and the release process continues.

### 4. Production Release

- **Job:** `release-stable`
- **Condition:** Only runs if a new version was detected in the previous job.
- **Steps:**
  - Check out the repository.
  - Set up Node.js 24.x and install dependencies.
  - **Build Process:**
    - Minify the dev mode shim using esbuild.
    - Build the code using the npm build script.
  - **AWS Configuration:**
    - Configure AWS credentials using the production deployment role.
  - **Release Tarball Preparation:**
    - Run `prepareReleaseTars.sh` without the `IS_CANARY` flag.
    - This script:
      - Uses the version from `package.json`.
      - Updates the production `releases.json` (via `updateReleasesJson.cjs`).
      - Runs `prepareDistributionTarballs.js` to copy additional files required for the final archive.
        - **This step is critical because if file locations change, the release could break due to missing files.**
      - Packs the distribution via `scripts/pack-framework-dist.sh` (a direct `tar` archive with a `package/` path prefix — `npm pack` is not used).
      - Uploads tarballs to the production S3 bucket (`install.serverless.com`).
      - Updates release metadata via two scripts:
        - `publish:release` (MongoDB, using the `RELEASES_MONGO_URI` secret): inserts a new record into the `releases` collection AND adds the version to the `release-metadata` collection's supported versions.
        - `publish:release-metadata` (S3): adds the version to `versions.json` in the production bucket.
      - Tags the repository with `sf-core-installer@{version}` and pushes the tag.
  - **CloudFront Invalidation:**
    - Create invalidations for the production CloudFront distribution (ID: `E3OEL4OJF1G5FG`).
    - Specifically invalidate `/releases.json` and `/versions.json` to ensure the latest version information is available.

- **Outcome:**
  - The new version is fully built and deployed to the production S3 bucket.
  - Both S3 and MongoDB metadata are updated to reflect the new version.
  - CloudFront invalidations ensure the new release is immediately available to users.

### 5. npm Package Publish

- **Job:** `release-npm`
- **Dependency:** Only runs after the `release-stable` job completes successfully.
- **Steps:**
  - Check out the repository.
  - Set up Node.js 24.x with the npm registry URL.
  - **Preparation:**
    - Copy the repository root `README.md` to the installer package.
    - Install dependencies.
  - **Publishing:**
    - Publish the package to npm using the `npm publish` command.
    - Authentication uses npm trusted publishing (OIDC, via the workflow's `id-token: write` permission) — no npm token secret is involved.

- **Outcome:**
  - The npm package is published to the npm registry.
  - While publishing to npm is part of our process, it is not required for users to install the latest version since they can also use the curl-based installation method.

---

## Canary Releases

Canary releases are an important part of our deployment strategy, allowing us to test new versions with a limited audience before full deployment.

### How Canary Releases Work

- **Purpose:**
  - Canary releases provide a way to test new versions with a limited audience before rolling them out to all users.
  - This helps detect issues early in the release cycle and ensures stability for the majority of users.

- **Implementation:**
  - Canary releases are hosted on a separate domain (`https://install.serverless-dev.com`) from production releases (`https://install.serverless.com`).
  - Canary versions use Git SHA as version identifiers instead of semantic versioning.
  - The `release-canary` job in our CI/CD pipeline handles the canary release process.

- **Technical Implementation Details:**
  - **Release Workflow** (`.github/workflows/release-framework.yml`):
    - The workflow includes a dedicated job `release-canary` that runs after integration tests pass.
    - This job sets the `IS_CANARY` environment variable to `true` when preparing release tarballs.
    - Canary releases use a different AWS CloudFront distribution than production releases.

  - **Release Preparation** (`packages/sf-core/prepareReleaseTars.sh`):
    - When `IS_CANARY=true`, the script:
      - Uses `install.serverless-dev.com` as the S3 bucket instead of `install.serverless.com`.
      - Uses the Git SHA (short commit hash) as the version identifier.
      - Uploads two artifacts to S3: `canary-{git-sha}.tgz` and `canary.tgz` (the latter allows users to always get the latest canary).
      - Skips the MongoDB metadata update and Git tagging steps that are performed for production releases.

  - **Version Management** (`packages/sf-core/scripts/updateReleasesJson.cjs` and `prepareDistributionTarballs.js`):
    - Both scripts check for the `IS_CANARY` environment variable.
    - When in canary mode, they use the Git SHA instead of the version from `package.json`.
    - `updateReleasesJson.cjs` updates `releases.json` with the Git SHA as the version; `prepareDistributionTarballs.js` rewrites the version in `framework-dist/package.json`.

### How to Use Canary Releases

Users can opt into using canary releases in two ways:

1. **Use the latest canary release:**
   - Specify `canary` as the framework version in your `serverless.yml` file:

     ```yaml
     frameworkVersion: canary
     ```

   - This will automatically use the most recent canary version available by downloading `canary.tgz`.

2. **Use a specific canary release:**
   - Specify a specific canary version in your `serverless.yml` file:

     ```yaml
     frameworkVersion: canary-{git-sha}
     ```

   - Replace `{git-sha}` with the specific Git SHA of the canary version you want to use.

When a canary version is specified, the system will:

1. Display a yellow notification indicating that you're using the canary release channel.
2. Download the framework from the canary domain (`https://install.serverless-dev.com`).
3. Use the specified canary version for all operations.

### Canary Release Flow

The complete canary release process works as follows:

1. Changes are pushed to the `main` branch, triggering the integration workflow.
2. Integration tests run across multiple platforms (Linux, Windows, ARM).
3. If tests pass, the `release-canary` job executes with `IS_CANARY=true`.
4. The canary release preparation process:
   - Gets the current Git SHA using `git rev-parse --short HEAD`.
   - Downloads the current `releases.json` from the canary S3 bucket.
   - Updates `releases.json` with the Git SHA as the version.
   - Prepares distribution tarballs by copying necessary files to the `framework-dist` directory.
   - Updates the version in `framework-dist/package.json` to match the Git SHA.
   - Creates the tarball via `scripts/pack-framework-dist.sh` (a direct `tar` archive with a `package/` path prefix).
   - Uploads the tarball to S3 as both `canary-{git-sha}.tgz` and `canary.tgz`.
   - Uploads the updated `releases.json` to the canary S3 bucket.
   - Creates a CloudFront invalidation to ensure the new files are immediately available.

### Promotion to Production Release

- Once a canary release has been thoroughly tested and proven stable, it can be promoted to a production release.
- This happens when a PR with a version bump is merged to `main`.
- The integration workflow detects the version change and runs the `release-stable` job.
- The production release process:
  - Uses the version from `package.json` (not the Git SHA).
  - Uploads the tarball to the production S3 bucket (`install.serverless.com`).
  - Updates the MongoDB metadata using the `publish:release` and `publish:release-metadata` scripts.
  - Tags the repository with `sf-core-installer@{version}` and pushes the tag.
  - Creates a CloudFront invalidation for the production distribution.
  - Publishes the npm package.

This makes the release available to all users, not just those who explicitly opt into the canary channel.
