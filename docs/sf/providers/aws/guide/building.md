<!--
title: Function Build Configuration
description: Configuration guide for building AWS Lambda functions with Serverless Framework using esbuild.
short_title: Build Config
keywords:
  [
    'Serverless Framework',
    'AWS Lambda',
    'Build Configuration',
    'esbuild',
    'Typescript',
  ]
-->

# AWS Lambda Build Configuration

## ESBuild

In Serverless Framework V.4, [esbuild](https://github.com/evanw/esbuild) is included within the Framework for bundling Javascript and Typescript AWS Lambda functions.

By default, if your AWS Lambda handler is using Typescript files directly, the Framework will build your code automagically upon deploy, without a plugin. No configuration is necessary by default.

### Configuration

V.4 introduces a new `build` configuration block, which you can use to customize [esbuild](https://github.com/evanw/esbuild) settings. We highlight some of the most common options below:

```yaml
build:
  esbuild:
    # Enable or Disable bundling the function code and dependencies into a single file. (Default: true)
    #
    # When disabled, the service is packaged like classic packaging, with
    # TypeScript compiled in place. See "Building Without Bundling" below.
    bundle: true

    # Path to a tsconfig file, relative to the `serverless.yml` file.
    # Its compilerOptions are passed to esbuild, and with `bundle: false` its
    # files/include/exclude select which TypeScript sources are compiled.
    # See "Building Without Bundling" below.
    tsconfig: ./tsconfig.build.json

    # NPM packages to not be bundled, and instead be available in node_modules, and the zip file uploaded to Lambda.
    #
    # With bundling enabled, these packages are left out of the bundle. With
    # `bundle: false` nothing is inlined, so this list (or `packages: external`)
    # decides which dependencies are installed into the artifact at all — see
    # "Building Without Bundling" below.
    #
    # If no excludes (see below) are specified, and the runtime is set to nodejs16.x or lower,
    # we automatically add "aws-sdk" to the list of externals.
    #
    # If no excludes (see below) are specified, and the runtime is set to nodejs18.x or higher,
    # we automatically add "aws-sdk/*" to the list of externals.
    #
    # Glob patterns are supported here.
    external:
      - '@aws-sdk/client-s3'

    # The packages config, this can be set to override the behavior of external
    # If this is set then all dependencies will be treated as external and not bundled.
    packages: external

    # NPM packages to not be included in node_modules, and the zip file uploaded to Lambda.
    #
    # This option only makes most sense if bundling is disabled. But if bundling is enabled and externals are specified
    # this property can be useful to further control which external packages to be included/excluded from the zip file.
    #
    # Everything specified here is also added to the list of externals (see above).
    #
    # Glob patterns are supported here.
    exclude:
      # Exclude all aws-sdk packages. This is done for you by default.
      - '@aws-sdk/*'
      # However, if you want to INCLUDE specific aws-sdk packages, you can use the negation operator (!)
      # This is useful if the Lambda built-in aws-sdk is outdated and you need to use a newer version.
      # Just make sure you specify the exact version of the aws-sdk in package.json.
      - '!@aws-sdk/client-bedrock-runtime'

    # By default Framework will attempt to build and package all functions concurrently.
    # Each unique handler file is built only once, so functions that share a handler
    # file (a module exporting several handlers) do not trigger duplicate builds.
    # This property can be set to a different number if you wish to limit the
    # concurrency of those operations.
    buildConcurrency: 3

    # Enable or Disable minifying the built code. (Default: false)
    minify: false

    # The file extension of the bundled handler files. (Default: '.js')
    #
    # Map '.js' to '.mjs' to emit ES module bundles that Lambda loads with the
    # ESM loader without a "type": "module" package.json in the artifact, or
    # to '.cjs' to make CommonJS loading explicit. Emitting '.mjs' requires
    # `format: esm`; the bundled handler, its sourcemap, and the packaged file
    # names all use the configured extension. Lambda resolves the handler file
    # by extension automatically, so function `handler` values stay unchanged.
    outExtension:
      '.js': '.mjs'

    # The output format of the bundled code. Defaults to 'cjs', or to 'esm' if
    # the service's package.json declares "type": "module".
    format: esm

    # Enable or configure sourcemaps, can be set to true or to an object with further configuration.
    sourcemap:
      # The sourcemap type to use, options are (inline, linked, or external)
      type: linked

      # Whether to set the NODE_OPTIONS on functions to enable sourcemaps on Lambda
      setNodeOptions: true

    # This option tells esbuild to produce some metadata about the build in
    # the <service-root>/.serverless/build directory: a meta.json file for
    # bundled builds, or one meta.<class><format>.json file per compile group
    # (for example meta.jscjs.json) when `bundle: false` is set.
    metafile: true
```

Dependencies that stay out of the bundle — packages listed in `external`, or all packages when `packages: external` is set — are installed into the `node_modules` directory of the deployment archive. Their versions are resolved from the service's `package.json`. In a [Serverless Compose](../../../guides/compose) project, the `package.json` next to `serverless-compose.yml` acts as a fallback, so services can share dependencies declared once at the project root: `external` packages not found in the service's `package.json` are resolved from it, and with `packages: external` it is used when the service declares no dependencies of its own.

You may also configure esbuild with a JavaScript file, which is useful if you want to use esbuild plugins. Here's an example:

```yml
build:
  esbuild:
    # Path to the esbuild config file relative to the `serverless.yml` file
    configFile: ./esbuild.config.js
```

The JavaScript file must export a function that returns an esbuild configuration object. For your convenience, the **serverless** instance is passed to that function.

Options returned by the config file are merged with the `build.esbuild` options in `serverless.yml`, with `serverless.yml` taking precedence when both set the same option. For boolean `sourcemap` values, or when `sourcemap` is omitted from `serverless.yml`, the effective merged setting controls whether the `NODE_OPTIONS=--enable-source-maps` environment variable is added to your functions — for example, returning `sourcemap: false` from the config file disables both sourcemap generation and the environment variable. A `sourcemap` object in `serverless.yml` uses its `setNodeOptions` property instead.

Here's an example of the `esbuild.config.js` file that uses the `esbuild-plugin-env` plugin:

**ESM:**

```js
/**
 * don't forget to set the `"type": "module"` property in `package.json`
 * and install the `esbuild-plugin-env` package
 */
import env from 'esbuild-plugin-env'

export default (serverless) => {
  return {
    external: ['@aws-sdk/client-s3'],
    plugins: [env()],
  }
}
```

**CommonJS:**

```js
const env = require('esbuild-plugin-env')

module.exports = (serverless) => {
  return {
    external: ['@aws-sdk/client-s3'],
    plugins: [env()],
  }
}
```

### Packaging Patterns

[`package.patterns`](./packaging.md) decides what the deployment artifact contains: the patterns filter the artifact's `node_modules` and select additional files from the service directory to ship alongside the build output. Function-level patterns apply when `package.individually` is enabled and are merged after the service-level ones, so a function can narrow — or re-include — what the service level decided. See [Packaging](./packaging.md) for pattern syntax and merging rules.

When bundling (the default), the artifact holds what the build produced: the compiled handler bundle, its sourcemap when one is emitted, and the generated `package.json` with the lockfile beside it. Patterns add to that and filter `node_modules`; the handler bundle is always packaged, and packaging fails rather than shipping an artifact that lost it. Under `package.individually`, a function-level negation can additionally drop build outputs — sourcemaps, plugin-emitted files — from that one function's archive; the generated `package.json` and its lockfile always ship.

A positive pattern naming `node_modules/...` ships those files from your service directory — a vendored or patched dependency the generated `package.json` does not declare, and which the artifact's install therefore never produces. Where such a file and an installed one claim the same path, the pattern's copy is what ships. The installed tree in the build directory is never overwritten by this.

A pattern may reach above the service directory, for example `../shared/**` in a monorepo. Such files are packaged at the path that remains once the leading `../` is removed — `../shared/config.json` ships as `shared/config.json` — the same placement classic packaging gives them. Code that reads the file must use that path.

Excluding every file under `node_modules` while the artifact still needs its dependencies at runtime — `packages: external`, or a non-bundled build whose generated `package.json` declares dependencies — deploys a function that fails on its first invocation. The build warns when it detects that combination.

With `bundle: false` the artifact is the whole project tree and the patterns also decide which project files are compiled and copied in the first place; see [Building Without Bundling](#building-without-bundling).

### Building Without Bundling

`bundle: false` packages your service following classic packaging's rules, with TypeScript compiled in place. The build selects the files classic packaging would ship, compiles the TypeScript among them, copies everything else as-is, and preserves your project's directory layout in the deployment archive. Type declaration files (`.d.ts`, `.d.mts`, `.d.cts`), nested `node_modules` directories, and package-manager internals (the Yarn PnP files `.yarn/**`, `.pnp.cjs`, `.pnp.loader.mjs`, and `pnpm-workspace.yaml`) are additionally excluded. Like every default exclusion they can be re-included through `package.patterns`: a nested `node_modules` a handler requires ships when a positive pattern names it (`patterns: ['lib/node_modules/**']`). As with classic packaging, everything else in the service directory ships — including the output directories of other tools — so exclude those with `package.patterns` negations. Three things are never packaged, whatever the patterns say: `.serverless/`, `.git/`, and the directory that `serverless package --package <dir>` (or `package.path`) writes to.

```yaml
build:
  esbuild:
    bundle: false
```

Nothing is inlined without a bundler, so every runtime dependency has to be installed into the artifact. Set `packages: external` to install all of them, or list the ones you need in `external`; without either, the generated `package.json` declares no dependencies and the artifact ships no `node_modules`.

#### What Is Compiled and What Is Copied

| Files                                 | Behavior     |
| ------------------------------------- | ------------ |
| `.ts`, `.tsx`, `.mts`, `.cts`, `.jsx` | Compiled     |
| `.js`, `.mjs`, `.cjs`                 | Copied as-is |
| Everything else (JSON, assets, ...)   | Copied as-is |

Handler files are always compiled, whatever their extension. With sourcemaps enabled (the default), every compiled file gets a `.map` file beside it in the artifact, and `--enable-source-maps` is set on the functions as it is for bundled builds.

#### Output Formats

Each compiled file is emitted in the module format Node.js will load it with:

- Compiled `.ts`, `.tsx`, and `.jsx` files follow the `type` of the nearest `package.json` at or above the file, so a nested `package.json` with its own `type` governs its subtree.
- `.mts` always compiles to `.mjs` (ES module) and `.cts` always compiles to `.cjs` (CommonJS), regardless of any `package.json`.
- An explicit `format` or `outExtension` in the esbuild configuration applies to the `.js` output class only; `.mjs` and `.cjs` outputs keep their fixed formats. A `format` matching the one the build itself derives — `esm` on a service whose root `package.json` declares `"type": "module"` — is treated as derived, so nested `package.json` subtrees still decide their own files; any other configured `format` overrides the per-file rule.
- With an `outExtension` remap such as `{ '.js': '.mjs' }`, compiled files are emitted with the remapped extension and relative imports must name it (`./util.mjs`, not `./util.js`). The import scan does not detect a `.js` specifier whose file was emitted under another extension.

#### ES Module Imports Need Explicit Extensions

Without a bundler, emitted files keep the import specifiers you wrote, and Node.js's ES module resolver does not add extensions or resolve `index.js`. In ES module code, relative imports must name the emitted file, extension included:

```typescript
// In ESM ("type": "module"), write the extension the emitted file will have:
import { helper } from './util.js' // resolves the compiled util.ts
```

This is the same convention TypeScript's `NodeNext` module resolution requires, so a project that type-checks under `NodeNext` deploys unchanged.

The build scans the compiled output and warns about relative specifiers Node.js will not resolve, including extensionless imports in ES module output, imports that name a source file the artifact does not contain (`./util.ts` — the artifact holds the compiled `util.js`), and dynamic `import()` specifiers in CommonJS output (Node.js routes `import()` through the ES module resolver even from CommonJS). Dynamic `require(variable)` calls cannot be detected. Files read at runtime and dynamically required modules belong in `package.patterns`, which ships them without the build having to understand them.

#### Selecting Which TypeScript Compiles

A service often carries TypeScript that is not part of the deployed program — test suites, infrastructure stacks, codegen scripts. The `tsconfig` option decides which TypeScript sources compile, using the config's `files`, `include`, and `exclude`; the config is also passed to esbuild, so its `compilerOptions` apply to compilation.

```yaml
build:
  esbuild:
    bundle: false
    tsconfig: ./tsconfig.build.json
```

When `tsconfig` is not set, the build reads `tsconfig.json` from the service directory, if present. Auto-discovery looks only there — it never walks up into parent directories, so a monorepo root config cannot take over a service's build. If an auto-discovered config cannot be resolved (for example, an `extends` target that is not installed), the build warns and compiles every TypeScript file in the package instead. A config named explicitly in `tsconfig` must resolve: the build fails if it cannot be read.

A dedicated `tsconfig.build.json` keeps tests out of the artifact while your editor keeps type-checking them through the regular `tsconfig.json`:

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["**/*.test.ts", "test/**"]
}
```

The tsconfig only narrows what compiles: it cannot add files the package excludes, and handler files always compile even when the config omits them. Unlike `tsc`, the build does not follow imports: a TypeScript file outside `files` and `include` is not compiled even when a compiled file imports it, and the artifact will lack it. Make sure `include` covers every source the deployed code reaches — or keep the editor's `tsconfig.json` as it is and point `tsconfig` at a build config that only excludes what should not ship.

#### Excluding Files with `package.patterns`

[`package.patterns`](./packaging.md) works exactly as in classic packaging: patterns apply in order and the last match wins, so negations narrow what ships:

```yaml
package:
  patterns:
    - '!tests/**'
    - '!**/*.md'
```

The classic default exclusions apply — the service configuration file, layer source directories, local plugin directories (`plugins.localPath` and `.serverless_plugins/`), and the development artifacts `.gitignore`, `.DS_Store`, `npm-debug.log`, and `yarn-*.log` — and because the last match wins, patterns can re-include them: `patterns: ['serverless.yml']` ships the config file. The legacy `package.include` and `package.exclude` keys are not applied by the esbuild build, in either bundle mode; a warning names them when they are present. Move includes to `package.patterns` as they are, and excludes with a leading `!`. Patterns can also filter the contents of `node_modules`, per function when set under a function's `package.patterns`.

Files whose name starts with `.env` (`.env`, `.env.production`, but also `.envrc`) are excluded by default at any depth, whatever `useDotenv` is set to — stricter than classic packaging, which drops them only at the service root and only when `useDotenv` is enabled. The Framework reads these files at deploy time, so the values your function needs are already environment variables by the time it runs, and shipping the file itself puts secrets in the artifact. Like every default exclusion, a positive pattern that matches an env file re-includes it: `patterns: ['.env']` ships that file deliberately, but a broad glob such as `config/**` or `**` also matches any env file beneath it. Review globs with that in mind, or follow them with a negation such as `!**/.env*`.

The `package.json` in the artifact is generated, pruned to the dependencies the deployed code needs. A pattern that re-includes `package.json` — directly, or through a broad positive pattern such as `'**'` — replaces that generated manifest with the service's own file, devDependencies included.

Positive patterns ship the files they match as they are. A pattern such as `src/**` therefore packages the TypeScript sources next to their compiled output; the sources are inert at runtime, but they add to the artifact and travel with it.

#### One Output per File

Every source file is emitted, so two source files cannot produce the same output. A `util.ts` next to a hand-written `util.js` would both produce `util.js`, and the build stops with an error naming both files instead of shipping whichever was written last. To resolve a collision:

- Exclude one side with a `package.patterns` negation, e.g. `'!src/util.ts'`. For a handler file, negate the TypeScript side: handlers always compile whatever the patterns say, so negating the `.js` leaves the collision in place.
- Point `build.esbuild.tsconfig` at a config that excludes the TypeScript you don't want compiled.
- Remove `build.esbuild` from the service if your project compiles itself before deploying.

A function-level `build: false` exempts that function from being built and from the build's handler checks, but its source files stay in the project sweep, so it does not resolve collisions. Unless the service uses `package.individually`, an opted-out function still receives the shared service artifact.

For projects that precompile with `tsc`:

- In-place output (no `outDir`) leaves each `.js` next to its `.ts` source, which is exactly this collision. Exclude the TypeScript side, e.g. `patterns: ['!**/*.ts']` — handler paths resolve to the `.js` file first.
- `outDir`-style output ships both the sources and the compiled tree unless the sources are excluded, e.g. `patterns: ['!src/**']`.

#### Individual Packaging

With `package.individually: true`, every function's archive contains the whole project tree, matching classic packaging. Per-function pattern negations narrow individual archives:

```yaml
package:
  individually: true

functions:
  api:
    handler: src/api.handler
    package:
      patterns:
        - '!src/workers/**'
```

#### Dev Mode

In dev mode, non-bundled rebuilds recompile the project on every change. Outputs of source files deleted during a session persist until the next deploy.

#### Limitations

- esbuild compiles TypeScript but does not type-check it. Keep `tsc --noEmit` in your CI pipeline.
- esbuild does not support `emitDecoratorMetadata`. Services that depend on it should precompile with `tsc` and remove `build.esbuild`.
- The import diagnostics scan compiled output only; copied JavaScript files are not scanned. Extensionless ES module imports are warned about, not rewritten.

## Plugin Conflicts

Please note, plugins that build your code will not work unless you opt out of the default build experience. Some of the plugins affected are:

- `serverless-esbuild`
- `serverless-webpack`
- `serverless-plugin-typescript`

The new `build` configuration is customizable by plugins. We will be introducing more features around this soon.
