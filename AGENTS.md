# Serverless Framework

Monorepo for the **Serverless Framework** - a command-line tool for deploying serverless applications to AWS Lambda and other managed cloud services, driven by YAML configuration (`serverless.yml`). Development uses Node.js 24 + npm 12 (ES Modules); the shipped CLI supports Node.js >= 18.

## Repository Structure

```text
├── packages/
│   ├── sf-core/                # CLI shell: entry point, command router, runners
│   ├── serverless/             # Traditional framework: AWS provider, plugins, config schema
│   ├── engine/                 # Shared AWS client wrappers used across the CLI
│   ├── mcp/                    # MCP server for AI IDEs
│   ├── util/                   # Shared utilities
│   ├── standards/              # ESLint and Prettier configs
│   ├── framework-dist/         # Bundled distribution package (excluded from npm workspaces)
│   └── sf-core-installer/      # Published to npm as "serverless" (excluded from npm workspaces)
├── binary-installer/           # Go-based binary installer
├── docs/sf/                    # User-facing documentation (published to serverless.com)
├── skills/                     # Agent Skills shipped inside the CLI (CI-linted)
└── release-scripts/            # Release automation
```

### Architecture

- **`packages/sf-core`**: the CLI shell. `bin/sf-core.js` boots `src/lib/router.js`, which dispatches commands to runners in `src/lib/runners/`. Also hosts auth, variable resolvers, observability, and agent-skills logic.
- **`packages/serverless`**: where most changes land — the AWS provider implementation, all plugins (`lib/plugins/aws/`, `lib/plugins/esbuild/`, ...), and the `serverless.yml` config schema (`lib/config-schema.js`, extended per plugin).
- **`packages/framework-dist`** and **`packages/sf-core-installer`** are excluded from npm workspaces. `sf-core-installer` is what npm users install as `serverless`; it carries its own `overrides`, its own **published** `npm-shrinkwrap.json`, and its own `.npmrc` — root-level dependency fixes never reach it.

## Development Setup

```bash
# Install dependencies (npm ci never rewrites the lockfile; prefer it over npm install)
npm ci

# Run the framework locally on a test project
cd /path/to/your/test-project
node /path/to/serverless/packages/sf-core/bin/sf-core.js deploy
```

## Code Style

### Formatting Rules

- **No semicolons** - Prettier removes them
- **Single quotes** for strings
- **2-space indentation**
- **LF line endings**
- **ES Modules** - use `import`/`export`, not `require()`
- Prefer native JavaScript over lodash; use async/await for asynchronous code
- New examples, fixtures, and snippets use current vendor-recommended idioms (ESM `.mjs` handlers, latest runtimes, AWS SDK v3) — consistency with older repo content is not a reason for legacy style

### Linting Commands

```bash
npm run prettier        # check formatting
npm run prettier:fix    # fix formatting
npm run lint            # run ESLint
npm run lint:fix        # fix lint issues
```

Gotchas:

- ESLint only lints the explicit path globs listed in `eslint.config.js` — a new package or top-level source directory is silently unlinted until added there.
- The shared ESLint config (`packages/standards/src/eslint.js`) disables `no-unused-vars` and several other rules — lint will NOT catch unused variables or imports.
- A husky pre-commit hook runs lint-staged (Prettier on staged JS/TS files), so formatting is partly automated at commit time; still run lint before pushing.
- Exception to the ES Modules rule: `packages/sf-core-installer` is CommonJS.
- `.env` files are deliberately NOT gitignored (test fixtures depend on them) — never write real credentials into one.

## Dependencies

- The shipped CLI supports Node.js 18 (`packages/serverless` declares `engines.node: ">=18.0"`). Runtime dependencies must keep Node 18 support even though development uses Node 24. Majors that drop Node 18 are blocked via the ignore list in `.github/dependabot.yml` — check it before bumping; dev-only dependencies may require any Node version.
- Write `package-lock.json` only with npm 12. npm <= 11 silently drops root `overrides` in workspaces repos (npm/cli#4834). Use `npm ci` for plain installs.
- `.npmrc` sets `min-release-age=3`: npm versions published less than 3 days ago won't resolve unless you pass `--min-release-age=0` explicitly.

## Testing

### Unit Tests (Run Locally)

```bash
npm run test:unit -w @serverlessinc/sf-core     # jest over packages/sf-core/tests/unit/
npm run test:unit -w @serverless/framework      # jest over packages/serverless/test/unit/
npm test                                        # both unit suites
```

Note the inconsistent directory naming: `tests/` in sf-core, `test/` in serverless — easy to misplace new tests.

Always invoke Jest via the npm scripts, not bare `jest` — the scripts set `--experimental-vm-modules`, required for ESM.

### Integration Tests (Live AWS)

Integration tests deploy real AWS stacks. They run in CI on non-draft PRs and can be run locally given AWS credentials plus the prerequisite resources described in [TESTING.md](TESTING.md).

```bash
npm test -w @serverlessinc/sf-core              # integration suite (excludes domains)
npm run test:<suite> -w @serverlessinc/sf-core  # targeted suite
```

Targeted suites include: `simple:nodejs`, `simple:python`, `simple:compose`, `simple:dashboard`, `simple:resolvers`, `resolvers`, `esbuild`, `sam`, `sandboxes`, `state`, `deployment-bucket`, `license-key`, `domains`, `compose:dev`, `compose:subset`. Prefer the targeted suite covering the touched area. The `domains` suite is excluded from `npm test` and not run by any CI workflow — it only runs when invoked explicitly.

Conventions: each suite pairs `<name>.test.js` with a sibling `fixture/` directory holding the service under test; reuse the shared helpers in `packages/sf-core/tests/utils/` (`runSfCore.js`, `testUtils.js` — e.g. `fetchWithRetry` for eventually-consistent endpoints) rather than hand-rolling CLI invocation. Fixtures must not list legacy bundler plugins (`serverless-esbuild`, `serverless-webpack`, `serverless-plugin-typescript`, `serverless-bundle`) — those throw `PLUGIN_TYPESCRIPT_CONFLICT` unless `build.esbuild: false` is set.

Dev-mode tests need the gitignored shim built first: `npm run build:devmode:shim -w @serverless/framework` (CI does this as a separate step).

New integration tests must be self-cleaning (deploy → exercise → teardown, even on failure), use unique stack names so parallel runs are safe, and contain no secrets or account IDs in fixtures or assertions.

### Other Suites

```bash
npm test -w @serverless/mcp                          # mcp tests (NOT run by any CI workflow)
npm test -w @serverless/engine                       # engine unit tests
npm run test:python -w @serverlessinc/sf-core        # python plugin tests (tape-based, not Jest)
npm run test:build -w @serverlessinc/sf-core         # packaging smoke + skills-packaging check (not in CI)
cd binary-installer && go test ./... && make build-prod   # Go installer
```

The CI python job is path-filtered (runs only when python plugin paths change) — failures can sit unnoticed on main until a PR touches those paths. `packages/util` has no tests at all: util changes are exercised only through its consumers' suites.

### Testing CLI Behavior Headlessly

Never drive the CLI through a pty (`script`, `pty.spawn`): a pty is indistinguishable from a real terminal, so spinners animate and interactive prompts open. Use plain pipes — the interactivity gate is typically `stdin.isTTY && stdout.isTTY && !CI`.

## Distribution & Bundling

The released CLI is bundled with esbuild into a single file. Standard `import`/`export` modules are bundled automatically, but **non-JS assets and anything loaded via a `__dirname`-relative path** (JSON, `.py` files, templates, spawned scripts) must be explicitly registered in `packages/sf-core/scripts/prepareDistributionTarballs.js` — otherwise the code works from source and breaks in the release.

Keep `esbuild` listed in `external` in `packages/sf-core/esbuild.js` — bundling esbuild's own code breaks the worker it spawns (see the comment there).

`packages/framework-dist` is an empty shell in git: its contents are generated at build time. The npm `serverless` package (`sf-core-installer`) only downloads the Go launcher binary, which resolves `frameworkVersion` per project, downloads the release tarball built from `framework-dist` into `~/.serverless/releases/<version>`, and runs `npm install` there — the published tarball contents directly become end-user installs. Launcher behavior (version resolution, caching, 24h update throttle) is documented in `binary-installer/README.md`.

## Agent Skills (`skills/`)

Any content change to a skill requires bumping its `metadata.version` and regenerating the manifest, or CI fails:

```bash
node packages/sf-core/scripts/lint-skills.js --update
```

Commit `skills/manifest.json` alongside. Aux files are never deleted from user installs — add or rename files instead of repurposing an existing filename. See `skills/README.md` for the full contract.

## CI Pipeline

CI runs on pull requests targeting `main`, on Node.js 24.x:

- **CI: Framework CLI** — Lint, Test: Engine, Test: Framework (unit + integration). Skipped entirely for docs-only changes (`paths-ignore: docs/**`) and for draft PRs.
- **CI: Binary Installer** — Go build and tests; runs only when `binary-installer/**` changes
- **CI: Python Requirements** — path-filtered (see Testing above)

The `release-*.yml` workflows run only on push to main or manual dispatch — they are never exercised by PR CI, so review changes to them with extra care. `release-framework.yml` is additionally path-filtered to `packages/{sf-core,serverless,engine,mcp}/**`: changes elsewhere (e.g. `packages/util`) never trigger a release build on their own.

## Pull Requests & Releases

- PRs are **squash-merged**; the PR title becomes the commit message. Use conventional format: `type(scope): description` — imperative mood, no trailing period, ~72 chars max. Types: feat, fix, perf, docs, refactor, test, ci, chore.
- Any `feat:` triggers a minor release; only `fix:`/`chore:` means a patch. See [VERSIONING.md](VERSIONING.md) for the full semver interpretation — notably, changes to CLI output structure and to generated CloudFormation count as **breaking**.
- Non-trivial features and fixes should have an open issue first — see [CONTRIBUTING.md](CONTRIBUTING.md).
- User-facing changes (behavior, config surface, CLI output) should update the docs in `docs/sf/` in the same PR.
- The root `README.md` is copied into the published npm package at release time — edits to it are user-facing.
- Every push to `main` touching the release-relevant packages automatically publishes a **canary** build, versioned by git short SHA (users opt in with `frameworkVersion: canary`) — code merged to main is live on the canary channel within minutes, so main must always be releasable.
- A stable release bumps the version in BOTH `packages/sf-core-installer/package.json` and `packages/sf-core/package.json`, in a PR titled exactly `chore: release x.x.x`; on merge, CI tags `sf-core@x.y.z` (use these tags to diff what shipped since the last release). npm is a secondary distribution channel; the curl installer (`install.serverless.com`) is primary. Full pipeline: [RELEASE_PROCESS.md](RELEASE_PROCESS.md).

## Important Files

- `packages/sf-core/bin/sf-core.js` - CLI entry point
- `packages/sf-core/src/lib/router.js` - command dispatcher
- `packages/serverless/lib/config-schema.js` - base `serverless.yml` schema (plugins extend it)
- `packages/serverless/lib/classes/plugin-manager.js` - authoritative registry of native/bundled plugins (`lib/plugins/index.js` is not the full list)
- `packages/sf-core/scripts/prepareDistributionTarballs.js` - non-bundled asset registry for releases
- `packages/standards/src/eslint.js` / `prettier.js` - lint and format configuration
