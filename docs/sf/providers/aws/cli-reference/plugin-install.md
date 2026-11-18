<!--
title: serverless plugin install
description: Install a Serverless Framework plugin from npm with serverless plugin install and add it to the plugins list in serverless.yml in one step.
short_title: plugin install
keywords:
  [
    'serverless plugin install',
    'Serverless Framework CLI',
    'install Serverless plugin',
    'serverless.yml plugins',
    'npm install --save-dev',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/plugin-install)

<!-- DOCS-SITE-LINK:END -->

# serverless plugin install

`serverless plugin install` installs a Serverless Framework plugin from npm as a development dependency of the service and adds it to the `plugins` list in `serverless.yml`. It changes only files in the service directory, nothing in AWS. To remove a plugin the same way, use [`serverless plugin uninstall`](./plugin-uninstall.md).

```bash
serverless plugin install --name serverless-offline
```

Run the command in the service directory, the one that holds `serverless.yml`. It needs npm, and no sign-in or AWS credentials.

## Options

`serverless plugin install` accepts these options:

| Option     | Alias | Value                   | Default                                    | Required | Description                                                                                                        |
| ---------- | ----- | ----------------------- | ------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `--name`   | `-n`  | `<package>[@<version>]` | None                                       | Yes      | npm package of the plugin, optionally with a version, range or tag; `@scope/package@version` for a scoped package. |
| `--config` | `-c`  | file path               | `serverless.yml` (any `serverless.*` file) | No       | Service configuration file to add the plugin to; npm runs in that file's directory.                                |

The command also accepts `--verbose`, `--debug` and `--help` (`-h`).

## What serverless plugin install changes

`serverless plugin install --name <package>@<version>` makes these changes in the directory of the service configuration file:

1. Runs `npm install --save-dev <package>@<version>`, with `latest` as the version when `--name` has none. npm updates `package.json`, `package-lock.json` and `node_modules`, and creates `package.json` when it's missing.
2. When `package.json` lists `serverless` in `dependencies` or `devDependencies`, adds an `overrides` entry so the plugin uses the same `serverless` package: `"overrides": { "<package>": { "serverless": "$serverless" } }`.
3. Adds the package name, without the version, to the `plugins` list in `serverless.yml`, `serverless.yaml` or `serverless.json`, unless it's already there. In a YAML file only the `plugins` block is rewritten; the rest of the file stays as it is.

For example, `serverless plugin install --name serverless-offline` leaves this in `serverless.yml`:

```yaml
# serverless.yml
service: my-service

plugins:
  - serverless-offline
```

For `serverless.js` and `serverless.ts`, and when `plugins` is set by a variable, the command installs the package but doesn't edit the file; it prints `Can't automatically add plugin into "serverless.ts" file. Please add it manually.` Add the plugin to the file yourself.

Plugins load in the order of the `plugins` list. A new plugin goes to the end; move it when it must run before another plugin ([plugins](../../../guides/plugins/README.md)).

## Run serverless plugin install again

Re-running the command is safe: npm installs the requested version again, and the plugin isn't added to `plugins` twice. To change a plugin's version, run the command with the new version.

The command never prompts, so it runs the same in a terminal, in CI and from an AI agent.

## Output of serverless plugin install

On success the command prints the plugin and the time it took:

```text
✔ Plugin "serverless-offline" installed  (4s)
```

When npm fails, the command prints npm's error output and exits with an error. Without a service configuration file it stops with `Configuration file not found`.

## Examples

### Install the latest version of a plugin

```bash
serverless plugin install --name serverless-offline
```

### Install a specific version

```bash
serverless plugin install --name serverless-offline@14.4.0
```

## Related commands

- [`serverless plugin uninstall`](./plugin-uninstall.md) removes a plugin and its `plugins` entry.
- [Plugins](../../../guides/plugins/README.md) explains how plugins load and how to write one.
