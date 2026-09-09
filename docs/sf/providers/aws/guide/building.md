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
    # The runtime's built-in AWS SDK is added to the externals automatically:
    # "aws-sdk" for nodejs16.x and lower, "@aws-sdk/*" for nodejs18.x and higher.
    #
    # Glob patterns are supported here.
    external:
      - '@aws-sdk/client-s3'

    # The packages config, this can be set to override the behavior of external
    # If this is set then all dependencies will be treated as external and not bundled.
    packages: external

    # NPM packages to not be included in node_modules, and the zip file uploaded to Lambda.
    #
    # Packages listed here are removed from the generated package.json, so they
    # are never installed into the artifact. They are not added to `external`:
    # with bundling enabled, list a package in both `external` and `exclude`
    # when it must be neither bundled nor installed (for example, one a Lambda
    # layer provides). With `bundle: false` this decides what is left out of
    # the artifact's node_modules.
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
    # bundled builds, or one file per output format (for example
    # meta.jscjs.json) when `bundle: false` is set.
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

[`package.patterns`](./packaging.md) decides what the deployment artifact contains beyond what the build produced: patterns select additional files from the service directory and filter the artifact's `node_modules`. Function-level patterns apply when `package.individually` is enabled and are merged after the service-level ones, so a function can narrow — or re-include — what the service level decided. See [Packaging](./packaging.md) for pattern syntax and merging rules.

The build reads `package.patterns` only. The legacy `package.include` and `package.exclude` keys, which classic packaging still honors, are ignored in both bundle modes, and a warning names them when they are present. Move includes into `patterns` as they are, and excludes with a leading `!`.

With bundling (the default), the artifact holds what the build produced — the compiled handler bundle, its sourcemap, and the generated `package.json` with the lockfile beside it — plus the files patterns add and the parts of `node_modules` the patterns leave in place. The handler bundle always ships: packaging fails rather than producing an artifact without it. Service-level negations act on the files patterns add and on `node_modules`; they do not remove build outputs. To leave sourcemaps out of the whole service, set `sourcemap: false`.

Under `package.individually`, a function-level negation also filters build outputs in that function's archive: `'!**/*.map'` drops its sourcemaps, `'!vendor/**'` drops files a plugin emitted there. The generated `package.json` and lockfile always ship. A negation that matches the function's own handler file — `'!src/**'` on a function whose handler lives under `src/` — fails packaging with an error naming the function and the file it could not find, `The handler files for "api" (src/api.js) are missing from the deployment artifact …`; `--debug` reports the same failure under the code `ESBUILD_HANDLER_MISSING_FROM_ARTIFACT`. If the intent was to keep source files out of the artifact, no pattern is needed: a bundled artifact contains no sources.

A positive pattern naming `node_modules/...` ships those files from your service directory: a vendored or patched dependency the generated `package.json` does not declare, and which the install into the artifact therefore never produces. Where such a file and an installed one share a path, the pattern's copy is what ships. A broad positive pattern such as `'**'` therefore also selects your local `node_modules`, devDependencies included, and ships it in place of the installed tree — follow it with `'!node_modules/**'`, or name the directories you mean.

A pattern may reach above the service directory, for example `../shared/**` in a monorepo. Such files are packaged at the path that remains once the leading `../` is removed — `../shared/config.json` ships as `shared/config.json`, as in classic packaging — and code must read them at that path.

Excluding everything under `node_modules` while the artifact still needs its dependencies at runtime — `packages: external`, or any build whose generated `package.json` declares dependencies (`bundle: false` with `external` entries, or a bundled build with `external` entries) — deploys a function that fails on its first invocation. The build warns when it detects that combination.

With `bundle: false` the patterns also decide which project files enter the build in the first place; see [Building Without Bundling](#building-without-bundling).

### Building Without Bundling

```yaml
build:
  esbuild:
    bundle: false
```

`bundle: false` packages your service the way classic packaging does (the Framework's packaging for services that are not built; see [Packaging](./packaging.md)), with TypeScript compiled in place: the project tree is the artifact, each TypeScript file is replaced by its compiled output, and everything else is copied as it is. Take this project:

```text
serverless.yml
package.json          "dependencies": { "uuid": "^11.1.0" }, plus devDependencies
package-lock.json
tsconfig.json
.env
src/handler.ts        imports ./util and uuid, reads ../assets/banner.txt at runtime
src/util.ts
src/types.d.ts
assets/banner.txt
README.md
```

with this `serverless.yml`:

```yaml
service: banner-api

provider:
  name: aws
  runtime: nodejs22.x

build:
  esbuild:
    bundle: false
    packages: external

functions:
  hello:
    handler: src/handler.hello
```

The handler path is the source file's path without its extension, followed by the name of the exported function, and it resolves to the emitted JavaScript: `src/handler.ts` exporting `hello` is `src/handler.hello`, which Lambda loads from `src/handler.js` in the artifact.

With `bundle: false` and `packages: external` the deployment archive contains:

```text
package.json          generated from yours: devDependencies removed, dependencies pruned to what the artifact installs
package-lock.json     your lockfile (or yarn.lock / pnpm-lock.yaml), refreshed by the install into the artifact
node_modules/uuid/    installed from the generated package.json
src/handler.js
src/handler.js.map
src/util.js
src/util.js.map
assets/banner.txt
tsconfig.json
README.md
```

`serverless.yml`, `.env` and `src/types.d.ts` are not in it, and neither is your local `node_modules`. Three kinds of exclusion produce that result.

**Never packaged, whatever the patterns say:** `.serverless/`, `.git/`, and the directory that `serverless package --package <dir>` (or `package.path`) writes to.

**Excluded by default, re-included by any positive pattern that matches:**

- Files whose name starts with `.env`, at any depth (details below).
- `node_modules` directories at any depth. The artifact's dependencies come from the install described below; a nested `node_modules` a handler requires ships when a pattern names it, for example `patterns: ['lib/node_modules/**']`; such files are copied as they are, not compiled.
- Type declarations: `.d.ts`, `.d.mts`, `.d.cts`.
- The service configuration file, layer source directories, and local plugin directories (`plugins.localPath` and `.serverless_plugins/`).
- `.gitignore`, `.DS_Store`, `npm-debug.log` and `yarn-*.log`.
- Package-manager internals: `.yarn/**`, `.pnp.cjs`, `.pnp.loader.mjs`, `pnpm-workspace.yaml` and `pnpm-workspace.yml`.
- Package-manager configuration, at any depth: `.npmrc`, `.yarnrc` and `.yarnrc.yml`. These files can hold registry credentials, and nothing reads them at runtime.

**Everything else ships**, including other dotfiles (`.nvmrc`, `.prettierrc`) and the output directories of other tools. Exclude those with `package.patterns` negations.

#### Dependencies

Nothing is inlined without a bundler, so every runtime dependency has to be installed into the artifact. `packages: external` installs everything under `dependencies` in your `package.json`; `external` installs only the packages it lists. Without either, the generated `package.json` declares no dependencies, the artifact ships no `node_modules`, and the function fails on its first invocation with a `Cannot find module` (CommonJS) or `Cannot find package` (ES module) error.

```yaml
build:
  esbuild:
    bundle: false
    packages: external
```

The AWS SDK v3 packages (`@aws-sdk/*`) are left out by default because the Node.js runtime provides them; `exclude` controls that list (see the configuration reference above). The `package.json` in the artifact is generated from yours: devDependencies are removed and `dependencies` is pruned to what the artifact installs. A pattern that re-includes `package.json` — directly, or through a broad positive pattern such as `'**'` — replaces the generated manifest with your own file, devDependencies included, and the build warns when the copy differs from the generated file. Drop `package.json` from the patterns, or follow the broad pattern with `'!package.json'`; the last match wins.

#### What Is Compiled and What Is Copied

| Files                                 | Behavior     |
| ------------------------------------- | ------------ |
| `.ts`, `.tsx`, `.mts`, `.cts`, `.jsx` | Compiled     |
| `.js`, `.mjs`, `.cjs`                 | Copied as-is |
| Everything else (JSON, assets, ...)   | Copied as-is |

Handler files are always compiled, whatever their extension: a `.js` handler is passed through esbuild too, so it gets a sourcemap and its module syntax is normalized. With sourcemaps enabled (the default), every compiled file gets a `.map` file beside it in the artifact and `--enable-source-maps` is set on the functions, as for bundled builds; `sourcemap: false` turns both off.

#### Output Formats

Each compiled file is emitted in the module format Node.js will load it with:

- Files that compile to `.js` — from `.ts`, `.tsx`, `.jsx`, or a compiled `.js` handler — follow the `type` of the nearest `package.json` at or above the file, within the service directory. A nested `package.json` with its own `type` governs its subtree, and it ships with the artifact so Node.js applies the same rule at runtime.
- `.mts` always compiles to `.mjs` (ES module) and `.cts` always compiles to `.cjs` (CommonJS), regardless of any `package.json`.
- A configured `format` applies to the files that compile to `.js`. When it names the format the root `package.json` already implies — `format: esm` on a `"type": "module"` service — the per-file rule above stays in charge, so nested `package.json` subtrees keep deciding their own files. Any other configured `format` overrides the per-file rule for all of those files.
- `outExtension` also applies to the files that compile to `.js`. With `{ '.js': '.mjs' }` they are emitted with the remapped extension and relative imports must name it (`./util.mjs`, not `./util.js`); the import scan does not detect a `.js` specifier whose file was emitted under another extension. Emitting `.mjs` requires the ES module format for every one of those files: a CommonJS subtree fails the build with an error naming the file.

#### ES Module Imports Need Explicit Extensions

Without a bundler, emitted files keep the import specifiers you wrote, and Node.js's ES module resolver does not add extensions or resolve `index.js`. In ES module code, relative imports must name the emitted file, extension included:

```typescript
// In ESM ("type": "module"), write the extension the emitted file will have:
import { helper } from './util.js' // resolves the compiled util.ts
```

This is the same convention TypeScript's `NodeNext` module resolution requires, so a project that type-checks under `NodeNext` deploys unchanged.

The build scans the compiled output and warns about two kinds of relative specifier Node.js will not resolve: extensionless imports in ES module output, and imports that name a source file the artifact does not contain (`./util.ts` — the artifact holds the compiled `util.js`). The same two checks apply to dynamic `import()` in CommonJS output, because Node.js routes `import()` through the ES module resolver even from CommonJS. Dynamic `require(variable)` calls cannot be detected. Files read at runtime ship with the rest of the project tree and need no pattern; `package.patterns` is only needed for files the defaults exclude, such as a nested `node_modules` a handler requires. A dependency loaded dynamically still has to be declared through `external` or `packages: external`.

#### Selecting Which TypeScript Compiles

A service often carries TypeScript that is not part of the deployed program — test suites, infrastructure stacks, codegen scripts. The `tsconfig` option decides which TypeScript sources compile, using the config's `files`, `include` and `exclude`; the config is also passed to esbuild, so its `compilerOptions` apply to compilation.

```yaml
build:
  esbuild:
    bundle: false
    tsconfig: ./tsconfig.build.json
```

When `tsconfig` is not set, the build reads `tsconfig.json` from the service directory, if present. Auto-discovery looks only there — it never walks up into parent directories, so a monorepo root config cannot take over a service's build. A config named explicitly in `tsconfig` must exist and resolve: the build fails if the file is missing or its `extends` chain cannot be read. A config that is empty or cannot be parsed — named or auto-discovered — produces a warning and every TypeScript file in the package compiles; so does an auto-discovered config whose `extends` target is not installed. A config that selects no TypeScript at all — typically a solution-style root with `files: []` and `references` — also warns, and only handler files compile.

A dedicated `tsconfig.build.json` keeps tests out of the artifact while your editor keeps type-checking them through the regular `tsconfig.json`:

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["**/*.test.ts", "test/**"]
}
```

The tsconfig only narrows what compiles: it cannot add files the package excludes, it selects TypeScript only (`.jsx` files always compile), and handler files always compile even when the config omits them. Unlike `tsc`, the build does not follow imports: a TypeScript file outside `files` and `include` is not compiled even when a compiled file imports it, and the artifact will lack it. Make sure `include` covers every source the deployed code reaches — or keep the editor's `tsconfig.json` as it is and point `tsconfig` at a build config that only excludes what should not ship.

A config that leaves out a helper the handler imports is not reported at build time: the artifact packages cleanly without the helper, and the function fails on its first invocation with `Cannot find module`. List what an artifact actually holds with `unzip -Z1 .serverless/<service>.zip`.

#### Excluding Files with `package.patterns`

Under `bundle: false`, [`package.patterns`](./packaging.md) also decides which project files enter the build, with classic semantics: patterns apply in order and the last match wins, so negations narrow what ships and a later positive pattern re-includes a default exclusion (`patterns: ['serverless.yml']` ships the configuration file). Negations select project files; they do not remove build outputs such as sourcemaps — set `sourcemap: false`, or use a function-level negation under `package.individually`.

```yaml
package:
  patterns:
    - '!tests/**'
    - '!**/*.md'
```

Env files deserve a closer look. Every file whose name starts with `.env` (`.env`, `.env.production`, but also `.envrc`) is excluded by default at any depth, whatever `useDotenv` is set to — stricter than classic packaging, which drops them only at the service root and only when `useDotenv` is set. The Framework loads `.env` and `.env.<stage>` from the service directory automatically (see [Dotenv files](./serverless.yml.md#dotenv-files)) so that `${env:VAR}` references in `serverless.yml` resolve on your machine at deploy time; a function receives only the variables declared under `environment` (its own or `provider.environment`). Shipping the file itself does not make its values available to the function — it only puts secrets in the artifact. Like every default exclusion, a positive pattern that matches an env file re-includes it: `patterns: ['.env']` ships that file deliberately, but a broad glob such as `config/**` or `**` also matches any env file beneath it. Review globs with that in mind, or follow them with a negation such as `'!**/.env*'`. Package-manager configuration files (`.npmrc`, `.yarnrc`, `.yarnrc.yml`) are excluded on the same terms, since they are where registry tokens live; every other dotfile ships like any other project file.

Positive patterns ship the files they match as they are. A pattern such as `src/**` therefore packages the TypeScript sources next to their compiled output; the sources are inert at runtime, but they add to the artifact and travel with it.

#### One Output per File

Every source file is emitted, so two source files cannot produce the same output. A `util.ts` next to a hand-written `util.js` would both produce `util.js`, and the build stops with an error naming both files instead of shipping whichever was written last. To resolve a collision:

- Exclude one side with a `package.patterns` negation, e.g. `'!src/util.ts'`. For a handler file, negate the TypeScript side: when `handler.js` and `handler.ts` both exist, the handler path resolves to the `.js` file (extensions are probed in the order `.js`, `.ts`, `.cjs`, `.mjs`, `.cts`, `.mts`, `.jsx`, `.tsx`), and handlers always compile whatever the patterns say, so negating the `.js` leaves the collision in place.
- Point `build.esbuild.tsconfig` at a config that excludes the TypeScript you don't want compiled.
- Remove `build.esbuild` from the service if your project compiles itself before deploying.

For projects that precompile with `tsc`:

- In-place output (no `outDir`) leaves each `.js` next to its `.ts` source, which is exactly this collision. Exclude the TypeScript side with `patterns: ['!**/*.ts']`; the precompiled tree ships, and the handler file itself is still passed through esbuild (see [What Is Compiled and What Is Copied](#what-is-compiled-and-what-is-copied)), so it gains a sourcemap.
- `outDir`-style output ships both the sources and the compiled tree unless the sources are excluded, e.g. `patterns: ['!src/**']` with handlers pointing into `dist/`.

A function-level `build: false`:

- exempts that function from the build and from the build's handler checks;
- does not resolve collisions — its source files stay in the project sweep;
- leaves the function with the shared service artifact, or, under `package.individually`, with an archive of the raw project tree as classic packaging produces it.

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

A function's negations apply to build outputs as well as project files, so `'!**/*.map'` drops that function's sourcemaps; the generated `package.json` and lockfile always ship, and a negation that removes the function's own handler file fails packaging (see [Packaging Patterns](#packaging-patterns)).

#### Dev Mode

`serverless invoke local` runs the same build and executes the function from the build directory. In dev mode, non-bundled rebuilds recompile the project on every change. Outputs of source files deleted during a session persist until the next `serverless package` or `deploy`, which start from a clean build directory; if a deleted file's output is still being served in dev mode, run one of those and restart the session.

#### Limitations

- esbuild compiles TypeScript but does not type-check it. Keep `tsc --noEmit` in your CI pipeline.
- esbuild does not support `emitDecoratorMetadata`: decorators compile, but the metadata is silently omitted. Services that depend on it should precompile with `tsc` and remove `build.esbuild`.
- The import diagnostics scan compiled output only; copied JavaScript files are not scanned. Extensionless ES module imports are warned about, not rewritten.
- Top-level `await` requires ES module output. In a file that compiles to CommonJS — one whose nearest `package.json` carries no `"type": "module"` — the build stops with esbuild's error, naming the file and the expression: `Top-level await is currently not supported with the "cjs" output format`. Add `"type": "module"` to that `package.json`, or write the file as `.mts`.

## Plugin Conflicts

Please note, plugins that build your code will not work unless you opt out of the default build experience. Some of the plugins affected are:

- `serverless-esbuild`
- `serverless-webpack`
- `serverless-plugin-typescript`

The new `build` configuration is customizable by plugins.
