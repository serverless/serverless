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
     - Stable channel: fetches the versions index and picks the best matching supported version (exact or semver range).
   - Installs the selected framework release under `~/.serverless/releases/<version>` by downloading an archive and running `npm install` in the extracted `package/` folder.
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
  - Downloaded when the target release directory does not exist or when explicitly forced (see below). On success, `metadata.json` is updated.
- Installer self-update:
  - URL: `<install host>/installer-builds/serverless-<os>-<arch>`
  - Only when running `serverless update`.

### Update policy (when downloads happen)

- Framework releases are downloaded when:
  - The resolved `~/.serverless/releases/<version>` directory is missing, or
  - The user explicitly forces an update via `serverless update` or `SERVERLESS_FRAMEWORK_FORCE_UPDATE=true`.
- The 24h throttle only applies to refreshing the versions index, not installing releases.

### Environment variables

- `SERVERLESS_FRAMEWORK_FORCE_UPDATE`
  - When set, forces a fresh version resolution and release download even if a matching release directory exists.
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
