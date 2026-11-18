<!--
title: Plugins
description: Install, configure and load Serverless Framework plugins in a service, from npm or local files, and control the order they load in.
short_title: Plugins
keywords:
  [
    'Serverless Framework plugins',
    'serverless plugin install',
    'serverless.yml plugins',
    'local plugin',
    'plugin load order',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/plugins)

<!-- DOCS-SITE-LINK:END -->

# Plugins

A plugin is a JavaScript or TypeScript module that extends the Serverless Framework: it adds CLI commands, runs code at steps of commands such as `deploy`, defines variable sources, or adds keys to `serverless.yml`. Plugins apply per service: a service loads the plugins its `serverless.yml` lists under `plugins`.

To add a plugin from npm to the service in the current directory, run:

```bash
serverless plugin install -n custom-serverless-plugin
```

The command installs the package and lists it in `serverless.yml`:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

plugins:
  - custom-serverless-plugin
```

Browse community plugins in the [Serverless Framework plugins directory](https://www.serverless.com/plugins).

## Install a plugin from npm

`serverless plugin install -n <name>` works in a service directory, the directory with `serverless.yml`. It does two things:

1. Runs `npm install --save-dev <name>@latest` in the service directory, which adds the package to `devDependencies` in `package.json` and installs it in `node_modules`.
2. Adds `<name>` to the `plugins` list in `serverless.yml`.

To install a specific version, pass it after the name: `serverless plugin install -n custom-serverless-plugin@1.2.3`. When `package.json` lists `serverless` as a dependency, the command also adds an `overrides` entry so the plugin uses that `serverless` version.

To install a plugin without the command, install the package and add its name to `plugins` yourself:

```bash
npm install --save-dev custom-serverless-plugin
```

To remove a plugin, run `serverless plugin uninstall -n custom-serverless-plugin`. It runs `npm uninstall --save-dev` and removes the name from `plugins`.

## Configure a plugin

Plugins read their settings from the `custom` section of `serverless.yml`, under a key the plugin's documentation names:

```yaml
# serverless.yml
plugins:
  - custom-serverless-plugin

custom:
  customServerlessPlugin:
    enabled: true
```

## Load a plugin from a local file

To use a plugin that lives in the service, for one project or while you develop it, list its path. The path starts with `./` and is relative to the service directory:

```yaml
# serverless.yml
plugins:
  - ./plugins/my-plugin.mjs
```

The Framework resolves the path like Node.js `require.resolve`:

- A `.js` file loads with or without the extension (`./plugins/my-plugin`).
- A `.mjs` or `.cjs` file needs the extension in the path (`./plugins/my-plugin.mjs`).
- A directory loads its `package.json` `main` file or its `index.js`.
- A TypeScript file (`.ts`) loads without the extension (`./plugins/my-plugin`).

When the Framework can't find a listed plugin, the command stops with:

```text
Serverless plugin "./plugins/my-plugin" not found. Make sure it's installed and listed in the "plugins" section of your serverless config file. Use the --debug flag to learn more.
```

The Framework looks for an npm plugin the way Node.js does from the service directory (its `node_modules`, then the `node_modules` of parent directories), then in the Framework's own installation. Run `npm install` in the service directory after cloning it.

## Plugin load order

The Framework loads its own plugins first, then the plugins in `plugins`: those tagged as build plugins first, then the rest in the order you list them. With this list, `plugin-one` loads before `plugin-two`:

```yaml
# serverless.yml
plugins:
  - plugin-one
  - plugin-two
```

Hooks registered for the same lifecycle event run in load order, so a listed plugin's `before:deploy:deploy` hook runs after the Framework's own hook for that event. A plugin listed twice stops the command with `Encountered duplicate plugin definition. Please remove duplicate plugins from your configuration.`

## Plugins included in the Framework

The Framework includes the features of some community plugins. Listing one of them in `plugins` prints a notice that you can remove the entry:

| Plugin                                | What the Framework does when it's listed                         |
| ------------------------------------- | ---------------------------------------------------------------- |
| `serverless-python-requirements`      | Loads the installed community plugin instead of the included one |
| `serverless-appsync-plugin`           | Loads the installed community plugin instead of the included one |
| `serverless-prune-plugin`             | Loads the installed community plugin instead of the included one |
| `serverless-plugin-aws-alerts`        | Uses the included version and ignores the entry                  |
| `serverless-apigateway-service-proxy` | Uses the included version and ignores the entry                  |

The Framework also builds TypeScript and JavaScript with its own esbuild integration. Listing `serverless-esbuild`, `serverless-webpack`, `serverless-plugin-typescript` or `serverless-bundle` stops the command with a `PLUGIN_TYPESCRIPT_CONFLICT` error unless `build.esbuild: false` is set.

## Write your own plugin

- [Create a plugin](./creating-plugins.md): the plugin class, lifecycle hooks, configuration and options
- [Custom commands](./custom-commands.md): add `serverless <command>` commands with options
- [Custom variables](./custom-variables.md): add `${source:...}` variable sources
- [Custom configuration](./custom-configuration.md): validate the keys your plugin adds to `serverless.yml`
- [Extending and overriding configuration](./extending-configuration.md): change the service configuration from a plugin
- [CLI output](./cli-output.md): write logs, progress and text from a plugin
