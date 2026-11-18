<!--
title: Packaging Lambda Functions
description: 'Control what goes into AWS Lambda deployment packages: serverless package, include and exclude patterns, prebuilt artifacts, per-function packages.'
short_title: Packaging
keywords:
  [
    'Serverless Framework',
    'serverless package',
    'Lambda deployment package',
    'package patterns',
    'package individually',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/packaging)

<!-- DOCS-SITE-LINK:END -->

# Packaging Lambda Functions

Packaging turns your service directory into the zip files Lambda runs. `serverless deploy` packages the service before it deploys; `serverless package` stops after packaging, which lets you inspect the artifacts or build them once in CI and deploy them later. The `package` block in `serverless.yml` decides which files each zip contains, whether functions share one zip or get their own, and whether you bring a prebuilt artifact instead.

To leave tests and docs out of every function's zip:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

package:
  patterns:
    - '!tests/**'
    - '!docs/**'

functions:
  hello:
    handler: handler.hello
```

Functions built by the built-in esbuild build (TypeScript handlers of functions with a `nodejs` runtime set on the function or `provider`, or any Node.js function when `build.esbuild` is set) are packaged from the build output instead; see [Building](./building.md) for how patterns apply there.

## Package the service without deploying

`serverless package` writes the artifacts to `.serverless/` in the service directory: the zip files, the CloudFormation templates and the service state file. Without the esbuild build, the zip shared by functions is `<service>.zip` and a function packaged separately gets `<function>.zip`, named after the `service` key and the function's key in `functions`.

```bash
serverless package
```

To write them elsewhere, pass `--package` or set `package.path` in `serverless.yml`. A relative path, from either, is resolved from the directory you run the command in. Packaging deletes an existing directory at that path before it writes the new artifacts there, and stops with `PACKAGE_PATH_CONTAINS_SERVICE` when the path is the service directory or one of its parent directories:

```bash
serverless package --package my-artifacts
```

To deploy those artifacts without packaging again, run `serverless deploy --package my-artifacts` from the service directory, with the same stage and Region (see [Deploying a package](./deploying.md#deploying-a-package)). When `package.path` is set in `serverless.yml`, a plain `serverless deploy` also skips packaging and deploys the artifacts already in that directory, so run `serverless package` before it.

### AWS credentials requirement for packaging

`serverless package` needs valid AWS credentials even though it deploys nothing, because the artifact paths in the template depend on the deployment bucket. Unless `provider.deploymentBucket` is set or the legacy stack-managed bucket is on (`provider.enableLegacyDeploymentBucket` or the `ENABLE_LEGACY_DEPLOYMENT_BUCKET` environment variable), packaging:

1. looks up a deployment bucket in the service's CloudFormation stack and uses it, except inside Serverless Compose, and otherwise
2. reads the shared deployment bucket's name from the SSM parameter `/serverless-framework/deployment/s3-bucket` in the deployment Region, creating the bucket and the parameter on first use in that Region.

The credentials therefore need CloudFormation read access, and SSM and S3 access to read (and on first use create) the parameter and bucket. Inside [Serverless Compose](../../../guides/compose.md), Compose also uses its [state](../../../guides/state.md) bucket and parameter. See [Deployment bucket](../../../guides/deployment-bucket.md) for the bucket itself.

Like `serverless deploy`, `serverless package` also needs a Serverless Framework sign-in or license key. Without a terminal, as in CI, set `SERVERLESS_ACCESS_KEY` or `SERVERLESS_LICENSE_KEY`; see [Deploy in your own CI/CD](../../../guides/dashboard/cicd/running-in-your-own-cicd.md#sign-in-to-serverless-without-a-browser).

## Patterns

`package.patterns` is a list of globs that select the files in the zip, matched against paths relative to the service directory (for a layer, relative to the layer's `path`). A pattern starting with `!` excludes; any other pattern includes. Patterns apply in order and the last match wins, so a later pattern can re-include a file an earlier one excluded, including the default exclusions:

```yaml
package:
  patterns:
    - '!node_modules/**'
    - 'node_modules/node-fetch/**' # keep one module
    - '!src/**'
    - src/function/handler.js # keep one file under src
```

To exclude a directory, match its contents: `'!tmp/**'`, not `'!tmp'`. When no file is left, packaging stops with `No file matches include / exclude patterns`.

The legacy `package.include` and `package.exclude` keys still work and are deprecated: move includes into `patterns` as they are, and excludes with a leading `!`.

### Default exclusions

These files are excluded before your patterns apply, so a positive pattern can re-include any of them except development dependencies:

- `.git/**`, `.gitignore`, `.DS_Store`, `npm-debug.log`, `yarn-*.log`
- `.serverless/**` and `.serverless_plugins/**`
- `.claude/skills/serverless-*/**` and `.agents/skills/serverless-*/**`: the Agent Skills that [`serverless agent setup`](../cli-reference/agent-setup.md) installs (other skills in those directories are packaged)
- the service configuration file (`serverless.yml` or its `.yaml`, `.json`, `.js`, `.ts` variant)
- the `path` directories of the service's [layers](./layers.md), in function and service zips
- with `useDotenv` set to `true` or to a path, files matching `.env*` at the service root
- Node.js development dependencies (see [Development dependencies](#development-dependencies))

A directory set in `plugins.localPath` isn't in this list: to keep its plugin sources out of the zip, exclude its contents with a pattern, for example `'!plugins/**'` for `localPath: ./plugins`.

Without `useDotenv`, `.env` files are packaged, even though the Framework loads `.env` and `.env.<stage>` from the service directory unless `useDotenv` is `false`. A function receives only the variables under `environment`, so to keep secrets out of the zip, add `'!**/.env*'` to `patterns`. Functions built by the built-in esbuild build leave out `.env*` files at any depth unless a pattern re-includes them.

[Sandboxes](./sandboxes.md#choosing-the-files) with a local `artifact` directory select their files with the same defaults and patterns, and also leave out `node_modules`, `.venv`, `venv`, `__pycache__`, `.pytest_cache` and `.mypy_cache`.

## Artifact

To skip packaging and deploy a zip you built yourself, set `package.artifact`. The Framework then neither zips the files nor applies `patterns` for the functions that use it, and the built-in esbuild build skips them. Use it when another tool produces the deployable file, such as Maven for Java or a Go build.

```yaml
package:
  artifact: path/to/my-artifact.zip
```

A function-level `package.artifact` applies to that function, with or without `package.individually`. A service-level `artifact` is the zip of every function that has no artifact of its own, except functions that set `package.individually: true` themselves, which get their own zip; the service-level `individually` doesn't change that. This example gives one Java function its own prebuilt artifact:

```yaml
package:
  individually: true

functions:
  hello:
    handler: com.serverless.Handler
    package:
      artifact: target/hello.jar
    events:
      - httpApi: 'GET /hello'
```

A local `artifact` path is relative to the service directory; packaging stops with `INVALID_PACKAGE_ARTIFACT_PATH` when a local service-level or function-level artifact can't be read.

### Artifacts hosted on S3

`artifact` can also point at an object in S3, as an S3 URI (`s3://bucket/key`) or an S3 object URL in virtual-hosted or path-style form, at service or function level. The Framework downloads the object before deploying. Any other value is read as a local path.

```yaml
package:
  individually: true

functions:
  hello:
    handler: com.serverless.Handler
    package:
      artifact: s3://my-artifacts-bucket/hello/hello.zip
```

## Packaging functions separately

By default, all functions share one zip of the service. To give every function its own zip, set `package.individually: true`; to do it for some functions only, set `individually: true` in those functions' `package`:

```yaml
package:
  individually: true
  patterns:
    - '!excluded-by-default.json'

functions:
  hello:
    handler: handler.hello
    package:
      patterns:
        - excluded-by-default.json # only in hello's zip
  world:
    handler: handler.world
    package:
      patterns:
        - '!some-file.js'
```

A function's `patterns` are applied after the service-level `patterns`, so they can narrow or re-include what the service level decided. They apply only to functions packaged individually: for other functions they are ignored and the CLI prints a warning.

```yaml
functions:
  hello:
    handler: handler.hello # in the service zip
  world:
    handler: handler.world
    package:
      individually: true # its own zip
```

## Development dependencies

For Node.js services, the Framework leaves development dependencies out of the zip: it runs `npm ls` in each directory of the service that contains a `package.json` (outside `node_modules`), and excludes the `node_modules` packages that only `devDependencies` require.

- The exclusion is applied after `patterns`, so a pattern can't re-include a development dependency.
- If `npm ls` lists development dependencies but can't list the production ones, packaging stops with `DEV_DEPENDENCY_EXCLUSION_LISTING_FAILED` rather than risk excluding them.
- If `npm ls` can't list the development dependencies, nothing is excluded and the CLI prints a warning.
- A layer is packaged from its `path` as it is on disk, without this exclusion, unless that `path` is the service directory itself (see [AWS Lambda layers](./layers.md#configuration)).
- Functions built by the built-in esbuild build don't use this setting: their artifact gets a generated `package.json` without `devDependencies` (see [Building](./building.md)).

To turn the exclusion off, set `package.excludeDevDependencies: false` (default `true`):

```yaml
package:
  excludeDevDependencies: false
```

## Package settings

| Key                                  | Type          | Default       | Scope                    | Description                                                       |
| ------------------------------------ | ------------- | ------------- | ------------------------ | ----------------------------------------------------------------- |
| `package.patterns`                   | list of globs | None          | Service, function, layer | Files to include or exclude.                                      |
| `package.artifact`                   | string        | None          | Service, function, layer | A prebuilt zip: local path, S3 URI or S3 URL.                     |
| `package.individually`               | boolean       | `false`       | Service, function        | Give functions their own zip.                                     |
| `package.excludeDevDependencies`     | boolean       | `true`        | Service                  | Leave Node.js development dependencies out.                       |
| `package.path`                       | string        | `.serverless` | Service                  | Where `serverless package` writes, and `deploy` reads, artifacts. |
| `package.include`, `package.exclude` | list of globs | None          | Service, function, layer | Deprecated; use `patterns`.                                       |

## Related pages

- [Building](./building.md): the built-in esbuild build for TypeScript and JavaScript.
- [AWS Lambda layers](./layers.md): packaging layers.
- [Deploying](./deploying.md): what happens to the artifacts on deploy.
- [`serverless package`](../cli-reference/package.md): the command's options.
