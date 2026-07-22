# Serverless Framework Core

## Architecture and Workflow

`bin/sf-core.js` boots the CLI and hands every invocation to the central Router, which selects and executes a Runner. This directory is the CLI shell: the deployment business logic lives in the packages it dispatches to (primarily `packages/serverless`).

### Router (`router.js`)

The Router is the central command dispatcher. It reads the service configuration (if any), validates the command against each Runner's CLI schema, and selects the Runner whose `configFileNames`/`shouldRun` match the invocation. It also owns the cross-cutting concerns wrapped around every command run: usage and analytics event publishing, deployment records (`platform/deployments.js`), deferred notifications, Agent Skills auto-update, and the tombstone error for removed frameworks (`removed-frameworks.js`).

### Runners (`runners/`)

Runners handle all CLI interaction for a family of commands — parsing input, prompts and progress, help output — and call into the code that does the actual work. Each extends the abstract `Runner` class (`runners/index.js`); the contract is documented in [runners/README.md](runners/README.md).

- **`CoreRunner`** (`runners/core/`) — global, service-independent commands: `login aws` / `login aws sso`, the MCP server, plugin install/uninstall/management, onboarding, support, and Agent Skills install, among others.
- **`TraditionalRunner`** (`runners/framework.js`) — the traditional Serverless Framework experience for `serverless.yml` services. It instantiates `Serverless` from `@serverless/framework` (`packages/serverless`) and bridges the CLI's resolver and build systems into it. Most user-facing deployment behavior lives in that package, not here.
- **`ComposeRunner`** (`runners/compose/`) — multi-service orchestration for `serverless-compose.yml`.
- **`CfnRunner`** (`runners/cfn/`) — deploy/remove/info/print for plain CloudFormation template projects.

Keep all CLI logic in the Runners. The packages they call (`@serverless/framework`, `@serverless/engine`) are client-agnostic and must stay free of CLI concerns.

### Supporting modules

- **`resolvers/`** — the variable-resolution engine for `${...}` placeholders: resolver providers, registry, dependency graph, and validation.
- **`auth/`** — AWS and AWS SSO login flows, credential and config writing.
- **`agent-skills/`** — install, manifest, and auto-update engine for the Agent Skills shipped in the repo-root `skills/` directory.
- **`observability/`** — observability integrations (dashboard, axiom).
- **`platform/`** — deployment records sent to the Serverless Platform.
- **`meta/`** — persisted CLI metadata.
- **`removed-frameworks.js`** — raises a clear `FRAMEWORK_SUPPORT_REMOVED` error when the working directory contains config for a framework the CLI no longer ships (`serverless.containers.*`, `serverless.ai.*`).

## Extending the Codebase

- **New CLI command on an existing experience:**
  Add it to the appropriate Runner's CLI schema and implementation under `runners/`, following the patterns in [runners/README.md](runners/README.md).

- **New deployment behavior for `serverless.yml` services:**
  Implement it in `packages/serverless` (provider, plugins, config schema) — this layer only routes to it and should not gain deployment logic.

- **New top-level experience (new config file type):**
  Add a Runner class implementing the required contract (`configFileNames`, `shouldRun`, `getCliSchema`, `run`, `getServiceUniqueId`) and register it in the runner list in `router.js`.
