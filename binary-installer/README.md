# Binary Installer & Install.sh Script

This project is responible for creating the built binaries that auto-update framework builds, as well as `install.sh` script that is used in the curl command we provide for installation.

## Installing With Curl

To use the install script that is currently deployed, you would run the following curl command from your command prompt,

```bash
curl -o- -L https://install.serverless.com | bash
```

This installs the most recent launcher binary. The framework itself is downloaded the first time you run `serverless`, so expect that initial invocation to fetch the latest release.
By default the `serverless` command will check for a new update every 24 hours.
If however you want to force a download of a new version you can set the environment variable `SERVERLESS_FRAMEWORK_FORCE_UPDATE=true` and then anytime you run `serverless` it will check if a new version is available and download it.

## Custom CA Certificates

For environments that use private CAs or TLS-intercepting proxies, the installer and framework downloads can trust additional certificate authorities via the following environment variables:

- `NODE_EXTRA_CA_CERTS`: Path to a PEM file containing one or more root CAs.
- `SSL_CERT_FILE`: Path to a PEM file containing one or more root CAs.
- `SSL_CERT_DIR`: Path list (separated by your OS path list separator, e.g. `:` on Unix or `;` on Windows) of directories containing PEM-encoded CA files.

These certificates are added to the system trust store used by the installer’s HTTP client.

## Code Signing

The Windows binary (`serverless-windows-amd64`) is Authenticode-signed with a `Serverless Inc` certificate issued through Azure Artifact Signing, with an RFC 3161 timestamp. In managed environments, the signature allows allow-listing by publisher rule (WDAC/AppLocker) instead of by file hash.

To verify a downloaded binary, in PowerShell:

```powershell
Get-AuthenticodeSignature .\serverless-windows-amd64 | Format-List Status, SignerCertificate
# Expected: Status: Valid, Signer: CN=Serverless Inc, ...
```

or with the Windows SDK:

```text
signtool verify /pa serverless-windows-amd64
```

Note that the binaries at `installer-builds/` are overwritten in place on each launcher release, so pinned file hashes stop matching after each release. If your antivirus software flags a binary, check its Authenticode signature and report the false positive to your vendor (for Microsoft Defender: https://www.microsoft.com/en-us/wdsi/filesubmission).

The release workflow (`.github/workflows/release-binary-installer.yml`) signs via GitHub OIDC (no stored credentials): the workflow's `id-token: write` permission lets it obtain an OIDC token, which Azure exchanges for signing access via a federated identity credential configured for this repository. The Azure identity holds only the `Artifact Signing Certificate Profile Signer` role. The workflow requires the repository secrets `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, and `AZURE_SUBSCRIPTION_ID`, and the repository variables `AZURE_TRUSTED_SIGNING_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT`, and `AZURE_TRUSTED_SIGNING_CERT_PROFILE`.

## How the Binary Installer Works

### High-level flow

1. Startup and environment prep (`main.go`):
   - Optionally configures extra CA certificates when `SLS_DISABLE_EXTRA_CA_CERTS` is set to a non-"false" value (see Custom CA Certificates section).
   - Ensures `~/.serverless/binaries` exists.
   - If invoked as `serverless update`, downloads and swaps the installer binary in place.
   - If a local v3 `node_modules/serverless` is present, defers execution to it for backwards compatibility.
2. Config resolution:
   - Determines the service config path from `--config/-c` flags or scans the CWD for supported filenames (`serverless.*`, `serverless-compose.*`, `serverless.containers.*`, `serverless.ai.*`).
3. Version resolution and download (`src/version.go`):
   - Reads `frameworkVersion` from the service config (supports YAML, JSON, and generic JS/TS via regex).
   - Resolves the framework release to use:
     - Canary channel (`frameworkVersion: canary` or `canary-<commit-short-sha>`): fetches the latest/specified canary release metadata from the install host.
     - Stable channel: fetches the versions index and picks the best matching supported version (exact or semver range). When nothing matches, it exits 1 with a message built from the pin and the index: for a pin older than every supported release, how to keep it (a project-local `devDependencies` install, which step 1 runs) or upgrade; otherwise, the available range and the newest release.
   - Installs the selected framework release under `~/.serverless/releases/<version>`: downloads the archive, extracts it into a temporary directory inside `releases/`, runs `npm install` in its `package/` folder when the archive declares dependencies, and then moves the finished release into place with a single rename.
   - Concurrent launchers (for example parallel CI jobs on a fresh machine) take turns through a per-version lock file: one installs, the others print a waiting message after a couple of seconds and then use its release, so the archive is downloaded once. If the filesystem does not support locking, or a wait exceeds 10 minutes, a launcher installs without the lock; the rename still ensures no launcher runs, overwrites, or deletes a release another one is building, and the first release published is kept. An existing release directory is never moved, replaced, or deleted.
4. Node checks and execution:
   - Verifies `node` and `npm` exist and Node.js is >= 18.
   - Launches `node <releasePath>/package/dist/sf-core.js` with the original CLI arguments.

### Files saved locally

- `~/.serverless/binaries/metadata.json`
  - Fields: `{ "version": string, "updateLastChecked": ISO8601 }`
  - Purpose: `updateLastChecked` throttles how often the versions index is re-fetched. `version` is informational (printed on install) and not used for logic.
- `~/.serverless/binaries/versions.json`
  - Cached copy of the versions index (`supportedVersions`, `blockedVersions`).
  - Used to resolve the latest supported version or a best match for ranges when fresh (see throttling below). Falls back when network errors occur.
- `~/.serverless/releases/<version>/`
  - Extracted framework release contents with `package/` and installed dependencies.
  - The CLI entry executed is `package/dist/sf-core.js`.
- `~/.serverless/releases/.<version>.lock`
  - Empty lock file that serializes installs of `<version>`. Never deleted.
- `~/.serverless/releases/.<version>.tmp-*/`
  - A release being built, removed when the install finishes or fails. A directory left behind by a launcher that was killed outright is removed once it is 24 hours old, by a later install or by the daily versions-index refresh. Building inside `releases/` keeps the final rename on one filesystem, including when `releases/` is a mount point or a symlink to another volume. The local-release fallback ignores these dot-prefixed entries.

### HTTP calls and throttling

- Versions index (stable channel):
  - URL: `https://install.serverless.com/versions.json`
  - Throttling: at most once per 24 hours, keyed by `metadata.json.updateLastChecked`.
  - Cache: on successful fetch, response is written to `~/.serverless/binaries/versions.json`. On errors, a present cache is used as a fallback.
- Canary release metadata (canary channel):
  - URL: `https://install.serverless-dev.com/releases.json` (for latest canary). For pinned canary, the version is taken from config directly.
  - Throttling: not throttled; only requested when using the canary channel.
- Release archives:
  - Stable: `https://install.serverless.com/archives/serverless-<version>.tgz`
  - Canary: `https://install.serverless-dev.com/archives/<canary-version>.tgz` (or `canary-<x>.tgz` for latest)
  - Downloaded when the target release directory is missing (see below). On success, `metadata.json` is updated.
- Installer self-update:
  - URL: `<install host>/installer-builds/serverless-<os>-<arch>`
  - Only when running `serverless update`.

### Update policy (when downloads happen)

- A framework release is downloaded when the resolved `~/.serverless/releases/<version>` directory is missing. An existing directory counts as installed: this launcher only creates it by renaming a complete build into place.
- An existing release is never downloaded again, including on `serverless update` or with `SERVERLESS_FRAMEWORK_FORCE_UPDATE=true`: releases do not change once published, and another command may be running from it. A forced update refreshes the versions index, so it installs a newer matching release when there is one.
- To reinstall a release, for example one an older launcher left incomplete (commands then fail with `Cannot find module …/sf-core.js` or `Cannot find package …`), delete its directory and run any command.
- The 24h throttle only applies to refreshing the versions index, not installing releases.

### Environment variables

- `SERVERLESS_FRAMEWORK_FORCE_UPDATE`
  - When set, forces a fresh version resolution (see the update policy for which releases are then downloaded).
- `SLS_DISABLE_EXTRA_CA_CERTS`
  - When set to any value other than "false", augments the HTTP client trust store with additional CAs from the variables below.
- `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, `SSL_CERT_DIR`
  - Standard Node/OpenSSL variables used to provide additional root CAs (see Custom CA Certificates).
- `CI`
  - When present, sets a flag that influences whether an auto-update suggestion is printed when no `frameworkVersion` is specified.

### Requirements

- Node.js >= 18 and `npm` must be available on PATH.
- Network access to the installer hosts:
  - `https://install.serverless.com` (stable releases and versions index)
  - `https://install.serverless-dev.com` (canary channel)

### Error handling and fallbacks

- If fetching the versions index fails, the installer will attempt to use the cached `versions.json` if present.
- If parsing the versions index fails, a cached copy is used if available.
- If a requested canary metadata fetch fails or returns malformed JSON, the command fails with a clear error message.
- If `npm install` fails during release installation, combined output and exit code are surfaced to stderr and the process exits non-zero.

### Supported configs and resolution rules

- `frameworkVersion` can be specified in YAML (`serverless.yml`), JSON (`serverless.json`), or inferred from JS/TS (`serverless.js`, `serverless.ts`, `serverless.cjs`). For JS/TS, a simple regex extracts `frameworkVersion: 'x.y.z'`.
- Constraints (e.g., `^4.0.0`) are matched against the supported list from `versions.json`. Exact blocked versions are warned about but still honored if requested.
- `frameworkVersion: canary` opts into the canary channel; `canary-<commit-short-sha>` pins a canary build directly.
