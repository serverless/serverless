<!--
title: Custom Commands in Plugins
description: Add a serverless <command> CLI command from a plugin, with options, shortcuts, defaults, subcommands and lifecycle event hooks.
short_title: Custom Commands
keywords:
  [
    'Serverless Framework custom command',
    'plugin commands',
    'lifecycleEvents',
    'command options',
    'plugin CLI',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/plugins/custom-commands)

<!-- DOCS-SITE-LINK:END -->

# Custom commands

A Serverless Framework plugin can add its own CLI commands, such as `serverless greet`. The plugin defines the command, its options and its lifecycle events in the `commands` object, and runs code for those events in `hooks`. Use a custom command for a task that isn't part of `package` or `deploy`; to add steps to those commands, hook into their events instead ([Create a plugin](./creating-plugins.md#lifecycle-events-and-hooks)).

This plugin adds `serverless greet` with a `--name` option:

```javascript
// greet-plugin.mjs
export default class GreetPlugin {
  constructor(serverless, options, { log }) {
    this.options = options
    this.log = log

    this.commands = {
      greet: {
        usage: 'Print a greeting',
        lifecycleEvents: ['run'],
        options: {
          name: {
            usage: 'Name to greet (for example "--name Ada")',
            shortcut: 'n',
            type: 'string',
            default: 'world',
          },
        },
      },
    }

    this.hooks = {
      'greet:run': () => this.run(),
    }
  }

  run() {
    this.log.notice(`Hello, ${this.options.name}!`)
  }
}
```

List the plugin in `serverless.yml`:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

plugins:
  - ./greet-plugin.mjs
```

Run the command in the service directory:

```bash
serverless greet -n Ada
```

```text
Hello, Ada!
```

Plugin commands exist only in a service directory whose `serverless.yml` lists the plugin. Elsewhere, the CLI stops with `No configuration file found`.

## Command definition

Each key of `commands` is a command name, and its value defines the command:

| Property          | Type     | Description                                                                                                     |
| ----------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `usage`           | string   | Help text shown by `serverless --help` and `serverless <command> --help`                                        |
| `lifecycleEvents` | string[] | Events the command runs, in order. A command without lifecycle events does nothing                              |
| `options`         | object   | The command's CLI options ([Command options](#command-options))                                                 |
| `commands`        | object   | Subcommands, defined the same way ([Subcommands](#subcommands))                                                 |
| `type`            | string   | `entrypoint` for a command only other plugins can start; `container` for a command that only groups subcommands |

## Lifecycle events of a custom command

A command has no logic of its own: the plugin adds it with hooks on the command's lifecycle events. The event name is `<command>:<event>`, and the Framework adds a `before:` and an `after:` event for each:

```javascript
// greet-plugin.mjs, inside the constructor
this.commands = {
  greet: {
    usage: 'Print a greeting',
    lifecycleEvents: ['prepare', 'run'],
  },
}

this.hooks = {
  'before:greet:prepare': () => this.log.verbose('Before prepare'),
  'greet:prepare': () => this.prepare(),
  'greet:run': () => this.run(),
  'after:greet:run': () => this.log.verbose('Done'),
}
```

`serverless greet` runs `before:greet:prepare`, `greet:prepare`, `after:greet:prepare`, `before:greet:run`, `greet:run` and `after:greet:run`, awaiting each hook. Other plugins can hook into the same events.

## Command options

Options are passed with two dashes (`--name Ada`) or, with a `shortcut`, with one dash (`-n Ada`). The plugin reads them from the `options` constructor parameter, under the option's full name.

| Property   | Type    | Description                                                                                                                 |
| ---------- | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| `usage`    | string  | Help text for the option                                                                                                    |
| `type`     | string  | Required. `string`, `boolean` or `multiple`. A `multiple` option collects repeated values into an array (`--tag a --tag b`) |
| `shortcut` | string  | One-letter alias used with a single dash                                                                                    |
| `required` | boolean | When `true`, the command stops if the option is missing                                                                     |
| `default`  | any     | Value used when the option is missing. A `boolean` option passed without a value also gets it                               |

The Framework applies `default` values when the command runs, after plugin constructors, so read options in hooks.

The Framework checks options before it runs the command. These are the errors it stops with:

```text
Option "name" is required for the "greet" command. Run "serverless greet --help" for more info.
Option "name" is of type "string" but expected type "undefined".
Unrecognized option "nmae". Run "serverless greet --help" for a list of all available options.
```

The second error appears when an option without `type` is passed, so give every option a `type`.

Every command also accepts the Framework's common options: `--stage` (`-s`), `--region` (`-r`), `--aws-profile`, `--config` (`-c`), `--param`, `--org`, `--app`, `--verbose`, `--debug`, `--help` (`-h`) and `--version` (`-v`). The common option replaces a command option with the same name.

## Subcommands

A command can group subcommands under `commands`. The subcommand's events join the command names with colons:

```javascript
// tools-plugin.mjs
export default class ToolsPlugin {
  constructor(serverless, options, { log }) {
    this.commands = {
      tools: {
        type: 'container',
        commands: {
          report: {
            usage: 'Print a report',
            lifecycleEvents: ['run'],
          },
        },
      },
    }

    this.hooks = {
      'tools:report:run': () => log.notice('Report'),
    }
  }
}
```

`serverless tools report` runs `tools:report:run`. A `container` command such as `tools` has no lifecycle events of its own.

## Commands that only plugins start

A command with `type: 'entrypoint'` is hidden from the CLI. A plugin starts it from a hook with `serverless.pluginManager.spawn()`, which runs the command's whole lifecycle and waits for it:

```javascript
// tools-plugin.mjs
export default class ToolsPlugin {
  constructor(serverless, options, { log }) {
    this.serverless = serverless

    this.commands = {
      tools: {
        usage: 'Run tools',
        lifecycleEvents: ['run'],
        commands: {
          cleanup: {
            type: 'entrypoint',
            lifecycleEvents: ['run'],
          },
        },
      },
    }

    this.hooks = {
      'tools:run': () => this.serverless.pluginManager.spawn('tools:cleanup'),
      'tools:cleanup:run': () => log.notice('Cleaned up'),
    }
  }
}
```

`spawn()` also starts core commands, such as `spawn('package')`.

## Command names shared by several plugins

When two plugins, or a plugin and the Framework, define the same command, the Framework merges the definitions: options from both are available, the lifecycle events of the plugin loaded last replace earlier ones when it defines any, and the hooks of both plugins run. A plugin can use this to add an option to a core command:

```javascript
// my-plugin.mjs, inside the constructor
this.commands = {
  deploy: {
    options: {
      notify: { usage: 'Send a notification after deploying', type: 'boolean' },
    },
  },
}
```

To add a separate command, give it a distinct name, such as `my-company-deploy` instead of `deploy`.

## Related pages

- [Create a plugin](./creating-plugins.md): the plugin class, lifecycle hooks and configuration
- [Plugins](./README.md): install, load and order plugins
- [CLI output](./cli-output.md): logs, progress and text output
