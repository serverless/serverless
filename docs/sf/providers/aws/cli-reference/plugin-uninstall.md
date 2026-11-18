<!--
title: serverless plugin uninstall
description: Uninstall a Serverless Framework plugin with serverless plugin uninstall and remove it from the plugins list in serverless.yml in one step.
short_title: plugin uninstall
keywords:
  [
    'serverless plugin uninstall',
    'Serverless Framework CLI',
    'remove Serverless plugin',
    'serverless.yml plugins',
    'npm uninstall',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/plugin-uninstall)

<!-- DOCS-SITE-LINK:END -->

# serverless plugin uninstall

`serverless plugin uninstall` removes a Serverless Framework plugin from the service's npm development dependencies and from the `plugins` list in `serverless.yml`. It changes only files in the service directory, nothing in AWS; the next `serverless deploy` runs without the plugin. It reverses [`serverless plugin install`](./plugin-install.md).

```bash
serverless plugin uninstall --name serverless-offline
```

Run the command in the service directory, the one that holds `serverless.yml`. It needs npm, and no sign-in or AWS credentials.

## Options

`serverless plugin uninstall` accepts these options:

| Option     | Alias | Value       | Default                                    | Required | Description                                                                              |
| ---------- | ----- | ----------- | ------------------------------------------ | -------- | ---------------------------------------------------------------------------------------- |
| `--name`   | `-n`  | `<package>` | None                                       | Yes      | npm package of the plugin. A version after the name (`@1.2.0`) is ignored.               |
| `--config` | `-c`  | file path   | `serverless.yml` (any `serverless.*` file) | No       | Service configuration file to remove the plugin from; npm runs in that file's directory. |

The command also accepts `--verbose`, `--debug` and `--help` (`-h`).

## What serverless plugin uninstall changes

`serverless plugin uninstall --name <package>` makes these changes in the directory of the service configuration file:

1. Runs `npm uninstall --save-dev <package>`, which updates `package.json`, `package-lock.json` and `node_modules`.
2. Removes the package from `plugins` (or `plugins.modules`) in `serverless.yml`, `serverless.yaml` or `serverless.json`. When the list ends up empty, the key is removed too. In a YAML file only the `plugins` block is rewritten; the rest of the file stays as it is.

For `serverless.js` and `serverless.ts`, and when `plugins` is set by a variable, the command uninstalls the package but doesn't edit the file; it prints `Can't automatically remove plugin from "serverless.ts" file. Please make it manually.` Remove the plugin from the file yourself.

An `overrides` entry that `serverless plugin install` added to `package.json` stays; delete it by hand if you no longer want it.

## Run serverless plugin uninstall again

Re-running the command is safe: npm reports nothing to remove, and the `plugins` list stays as it is. The command never prompts, so it runs the same in a terminal, in CI and from an AI agent.

## Output of serverless plugin uninstall

On success the command prints the plugin and the time it took:

```text
✔ Plugin "serverless-offline" uninstalled (2s)
```

When npm fails, the command prints npm's error output and exits with an error. Without a service configuration file it stops with `Configuration file not found`.

## Examples

### Remove a plugin

```bash
serverless plugin uninstall --name serverless-offline
```

### Remove a plugin from another configuration file

```bash
serverless plugin uninstall --name serverless-offline --config serverless.dev.yml
```

## Related commands

- [`serverless plugin install`](./plugin-install.md) installs a plugin and adds it to `plugins`.
- [Plugins](../../../guides/plugins/README.md) explains how plugins load and how to write one.
