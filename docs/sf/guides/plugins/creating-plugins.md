<!--
title: Create a Plugin
description: Write a Serverless Framework plugin as an ESM class that hooks into lifecycle events such as package and deploy, reads serverless.yml and CLI options.
short_title: Create a Plugin
keywords:
  [
    'Serverless Framework plugin',
    'create a serverless plugin',
    'lifecycle events',
    'plugin hooks',
    'ESM plugin',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/plugins/creating-plugins)

<!-- DOCS-SITE-LINK:END -->

# Create a plugin

A Serverless Framework plugin is a class that the Framework constructs when a command runs in a service that lists it. Through hooks, the class runs code before, during or after the lifecycle events of commands such as `package` and `deploy`. A plugin can also add [custom commands](./custom-commands.md), [variable sources](./custom-variables.md) and [`serverless.yml` keys](./custom-configuration.md).

This plugin logs a line after every deploy. Save it as `my-plugin.mjs` in the service directory:

```javascript
// my-plugin.mjs
export default class MyPlugin {
  constructor(serverless, options, { log }) {
    this.serverless = serverless
    this.log = log
    this.hooks = {
      'after:deploy:deploy': () => this.afterDeploy(),
    }
  }

  afterDeploy() {
    const { service } = this.serverless.service
    this.log.notice(`Deployed ${service}`)
  }
}
```

List it in `serverless.yml` with its path:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

functions:
  hello:
    handler: handler.hello

plugins:
  - ./my-plugin.mjs
```

`serverless deploy` now ends with the `Deployed my-service` line. [Plugins](./README.md#load-a-plugin-from-a-local-file) explains how the Framework resolves local paths and npm package names.

## Plugin file formats

The Framework loads each plugin with a dynamic `import()` and uses the module's default export, so these formats work:

- **ESM in a `.mjs` file**: `export default class MyPlugin {}`. List the file with its extension (`./my-plugin.mjs`).
- **ESM in a `.js` file**: the same code, with `"type": "module"` in the `package.json` that contains the file.
- **CommonJS in a `.js` or `.cjs` file**: `module.exports = MyPlugin`. List a `.cjs` file with its extension.
- **TypeScript in a `.ts` file**: `export default class MyPlugin {}`, listed without the extension (`./my-plugin`). The Framework compiles it when it loads.

## Constructor parameters

The Framework calls `new MyPlugin(serverless, options, utils)` for every command run in the service, before the command's first lifecycle event:

- `serverless`: the Framework instance. `serverless.service` holds the service configuration from `serverless.yml`, `serverless.serviceDir` the service directory, `serverless.getProvider('aws')` the AWS provider (with `getRegion()` and `getStage()`), and `serverless.configSchemaHandler` the schema helpers.
- `options`: the CLI options of the command, such as `{ stage: 'prod', region: 'eu-west-1' }`. Short forms are stored under their long names.
- `utils`: output helpers: `log` (a function with the methods `error`, `warning`, `notice`, `info`, `success`, `verbose` and `debug`), `progress` (the CLI's main progress spinner), `writeText` (writes to standard output) and `style`. [CLI output](./cli-output.md) shows how to use them.

Use `utils.log` instead of `console.log`, so your output doesn't break the progress spinner and respects `--verbose` and `--debug`.

## Lifecycle events and hooks

Each command runs a sequence of lifecycle events. For every event, the Framework also runs a `before:` and an `after:` event, so `package:compileEvents` has `before:package:compileEvents` and `after:package:compileEvents`. A hook is an entry in the plugin's `hooks` object: the key is the event name and the value is a function. The Framework awaits each hook, so a hook can be `async`.

The core commands run these lifecycle events, in order:

| Command                      | Lifecycle events                                                                                                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serverless package`         | `package:cleanup`, `package:initialize`, `package:setupProviderConfiguration`, `package:createDeploymentArtifacts`, `package:compileLayers`, `package:compileFunctions`, `package:compileEvents`, `package:finalize` |
| `serverless deploy`          | `deploy:deploy`, `deploy:finalize`                                                                                                                                                                                   |
| `serverless deploy function` | `deploy:function:initialize`, `deploy:function:packageFunction`, `deploy:function:deploy`                                                                                                                            |
| `serverless info`            | `info:info`                                                                                                                                                                                                          |
| `serverless invoke`          | `invoke:invoke`                                                                                                                                                                                                      |
| `serverless invoke local`    | `invoke:local:loadEnvVars`, `invoke:local:invoke`                                                                                                                                                                    |
| `serverless logs`            | `logs:logs`                                                                                                                                                                                                          |
| `serverless remove`          | `remove:remove`                                                                                                                                                                                                      |
| `serverless rollback`        | `rollback:initialize`, `rollback:rollback`                                                                                                                                                                           |
| `serverless print`           | `print:print`                                                                                                                                                                                                        |

`serverless deploy` runs the whole `package` lifecycle inside `before:deploy:deploy`, unless `--package` or `package.path` in `serverless.yml` points to an existing package. Because the Framework's own hooks load first, a plugin's `before:deploy:deploy` hook runs after packaging and before the CloudFormation update.

Three events apply to every command:

- `initialize`: runs before the command's first lifecycle event.
- `error`: runs when a lifecycle hook throws; the hook receives the error. The command still fails with that error.
- `finalize`: runs after the command's lifecycle completes without an error.

This plugin hooks into packaging and the shared events:

```javascript
// my-plugin.mjs
export default class MyPlugin {
  constructor(serverless, options, { log }) {
    this.serverless = serverless
    this.log = log
    this.hooks = {
      initialize: () => this.log.verbose('MyPlugin initialized'),
      'before:package:createDeploymentArtifacts': () => this.beforePackage(),
      'after:deploy:deploy': async () => this.afterDeploy(),
      error: (error) => this.log.warning(`Command failed: ${error.message}`),
    }
  }

  beforePackage() {
    const functionNames = this.serverless.service.getAllFunctions()
    this.log.notice(`Packaging ${functionNames.length} function(s)`)
  }

  async afterDeploy() {
    this.log.success('Deploy complete')
  }
}
```

Your plugin can define its own commands and lifecycle events too: see [Custom commands](./custom-commands.md).

## Read the service configuration

`serverless.service` holds the service configuration: `service.service` is the service name, `service.provider` the `provider` block, `service.custom` the `custom` block, and `service.getAllFunctions()` and `service.getFunction(name)` return the functions.

The Framework resolves the variables in `serverless.yml` before it constructs plugins, except variables whose source a plugin defines: those are resolved after all plugin constructors run. Read configuration in hooks, where every value is resolved:

```javascript
// my-plugin.mjs
export default class MyPlugin {
  constructor(serverless, options, { log }) {
    this.serverless = serverless
    this.log = log
    this.hooks = {
      'before:package:initialize': () => this.checkConfig(),
    }
  }

  checkConfig() {
    const config = this.serverless.service.custom?.myPlugin ?? {}
    const region = this.serverless.getProvider('aws').getRegion()
    this.log.notice(`myPlugin.enabled=${config.enabled ?? false} in ${region}`)
  }
}
```

To validate the keys your plugin reads from `custom` or elsewhere in `serverless.yml`, define a schema: see [Custom configuration](./custom-configuration.md).

## Read CLI options

The `options` parameter holds the command's CLI options. Read options in hooks: the Framework sets defaults for a command's options when the command runs, after the constructor.

```javascript
// my-plugin.mjs
export default class MyPlugin {
  constructor(serverless, options, { log }) {
    this.options = options
    this.log = log
    this.hooks = {
      'before:deploy:deploy': () => {
        if (this.options.verbose)
          this.log.notice(`Stage: ${this.options.stage}`)
      },
    }
  }
}
```

## Limit a plugin to one provider

To run a plugin only for services on one provider, set `this.provider` in the constructor to the provider name, or to the provider object. The Framework skips the plugin, including its commands and hooks, when `provider.name` in `serverless.yml` is a different provider:

```javascript
// my-plugin.mjs
export default class MyPlugin {
  constructor(serverless) {
    this.provider = serverless.getProvider('aws')
  }
}
```

A plugin without `this.provider` runs for every provider.

## Run asynchronous setup

To run asynchronous setup before the command, define an `asyncInit()` method. The Framework calls it on every plugin after constructing all plugins, and waits for all of them before the command's lifecycle starts:

```javascript
// my-plugin.mjs
import { readFile } from 'node:fs/promises'

export default class MyPlugin {
  constructor(serverless) {
    this.serverless = serverless
  }

  async asyncInit() {
    const path = `${this.serverless.serviceDir}/my-plugin.json`
    this.settings = JSON.parse(await readFile(path, 'utf8'))
  }
}
```

## Mark a plugin as a build plugin

A plugin that builds code other plugins depend on can set the static `tags` property to `['build']`. The Framework loads build plugins before the other plugins in `plugins`, so their hooks for an event run first:

```javascript
// my-plugin.mjs
export default class MyBuildPlugin {
  static tags = ['build']

  constructor(serverless, options, { log }) {
    this.hooks = {
      'before:package:createDeploymentArtifacts': () => log.notice('Building'),
    }
  }
}
```

`build` is the only tag the Framework reads. Leave it off a plugin that doesn't build code, so that it keeps its position in the `plugins` list.

## Publish a plugin to npm

To share a plugin across services, publish it as an npm package whose main module default-exports the plugin class:

```json
{
  "name": "serverless-my-plugin",
  "version": "1.0.0",
  "type": "module",
  "exports": "./my-plugin.js",
  "peerDependencies": {
    "serverless": ">=4"
  }
}
```

- The Framework resolves the package like Node.js `require.resolve` from the service directory, so the package must have a `main` field or an `exports` entry with a `require` or `default` condition.
- The `serverless` peer dependency documents which Framework major versions the plugin supports.

Users install it with `serverless plugin install -n serverless-my-plugin`: see [Install a plugin from npm](./README.md#install-a-plugin-from-npm).

## Related pages

- [Plugins](./README.md): install, load and order plugins
- [Custom commands](./custom-commands.md): add commands with options and lifecycle events
- [Custom variables](./custom-variables.md): add variable sources
- [CLI output](./cli-output.md): logs, progress and text output
