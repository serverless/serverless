<!--
title: CLI Output in Plugins
description: Write logs, progress, command output, errors and deprecations from a Serverless Framework plugin with the log, progress, writeText and style helpers.
short_title: CLI Output
keywords: ['Serverless Framework plugin', 'plugin logging', 'plugin progress', 'writeText', 'CLI output']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/plugins/cli-output)

<!-- DOCS-SITE-LINK:END -->

# CLI output in plugins

A Serverless Framework plugin writes to the terminal through the output helpers the Framework passes to its constructor: `log` for messages, `progress` for the spinner, `writeText` for command output and `style` for formatting. Use them instead of `console.log`, so your output respects `--verbose` and `--debug`, doesn't break the spinner, and stays readable in CI and for AI agents.

This plugin logs a message, shows a progress message while it works, and prints a success line after `serverless deploy`:

```javascript
// my-plugin.mjs
export default class MyPlugin {
  constructor(serverless, options, { log, progress }) {
    this.log = log
    this.progress = progress
    this.hooks = {
      'after:deploy:deploy': () => this.afterDeploy(),
    }
  }

  async afterDeploy() {
    const myProgress = this.progress.get('my-plugin')
    myProgress.notice('Uploading assets with my-plugin')
    // ... do the work
    myProgress.remove()
    this.log.success('Assets uploaded')
  }
}
```

## The output helpers argument

The Framework calls `new MyPlugin(serverless, options, utils)`. The third argument, `utils`, has these properties:

| Property    | What it does                                                                          |
| ----------- | ------------------------------------------------------------------------------------- |
| `log`       | Writes messages to standard error at a log level; also callable as `log(message)`.    |
| `progress`  | The CLI's main progress spinner, and `progress.get(name)` for a progress of your own. |
| `writeText` | Writes command output to standard output.                                             |
| `style`     | Formats text in the Framework's colors.                                               |

The helpers exist only as this argument. To use them in hooks or in other modules of your plugin, keep a reference in the constructor (`this.log = log`) and pass it on.

## Write log messages with `log`

The plugin's `log` writes to standard error, so messages never mix with output that a script reads from standard output. Each method writes at a log level, and the level decides when the message shows:

| Method                        | Shown                             | Line starts with |
| ----------------------------- | --------------------------------- | ---------------- |
| `log.error()`                 | Always                            | `✖`              |
| `log.warning()`               | Always                            | `[!]`            |
| `log.notice()`, `log()`       | By default                        | nothing          |
| `log.success()`               | By default                        | `✔`              |
| `log.info()`, `log.verbose()` | With `--verbose` or `SLS_VERBOSE` | nothing          |
| `log.debug()`                 | With `--debug` or `SLS_DEBUG`     | its namespace    |

```javascript
log.error('Could not upload assets')
log.warning('custom.myPlugin.bucket is not set, using the default bucket')
log.notice('Uploading 3 files')
log.success('Assets uploaded')
log.verbose('Uploaded index.html (12 KB)')
log.debug('S3 response: %s', response)
```

When Serverless Compose runs a command for more than one service, it shows its own progress and hides the services' and plugins' log lines at every level, unless `--debug` is set. With `--service <name>` for a single service, the levels above apply.

Log methods accept several arguments and join them with spaces. A first argument that contains `%s` or `%d` is a format string: each placeholder takes the next argument. Objects print as `util.inspect` output, and an `Error` prints with its stack.

Keep the default output short: log details at the `--verbose` level, and use warnings only for something the user should change. When a problem should stop the command, throw an error instead of calling `log.error()` (see [Errors in plugins](#errors-in-plugins)).

## Namespaced debug logs

`log.get(name)` returns a logger for a child namespace, so debug lines show which part of the plugin wrote them:

```javascript
const uploadLog = log.get('upload')
uploadLog.debug('Starting upload of %d files', files.length)
```

Each debug line starts with its namespace, for example `s:sls:plugin:serverless-my-plugin:upload:`. The plugin's part of the namespace is the name listed in `plugins`, lowercased, with characters other than letters, digits and `-` replaced by `-`. `--debug` prints the debug lines of every namespace, whatever value you pass to it.

## Write command output with `writeText`

`writeText` writes to standard output. Use it for the result of a command your plugin defines, so that scripts and agents can pipe or parse it:

```javascript
writeText(JSON.stringify(result, null, 2))
writeText(['line 1', 'line 2'])
```

`writeText` joins its string arguments and array items with new lines, ignores non-string values, and ends the output with a new line. Write to standard output only in your own commands: other commands, such as `serverless invoke`, reserve standard output for their own result. If you're unsure, log with `log` instead.

## Format text with `style`

`style` holds the Framework's formatting functions. Each takes a string and returns it formatted:

- `style.aside()`: secondary information, in gray.
- `style.strong()`: the one piece of information that needs attention, in the Framework's red. Use it at most once per command.
- `style.bold()`, `style.title()` (underlined) and `style.linkStrong()` (underlined); `style.link()` returns the text unchanged.
- `style.success()`: a successful outcome, in green.
- `style.error()` and `style.warning()`: the colors of error and warning messages.

```javascript
log.notice(`Bucket: my-bucket ${style.aside('(created)')}`)
```

The Framework turns colors off when `FORCE_COLOR` is `0` or `false`, or, while `FORCE_COLOR` isn't set, when `NO_COLOR` is set or the CLI runs under an AI coding agent; `style` then returns plain text. Write primary information unstyled and secondary information with `style.aside()`.

## Show progress

`progress` is the CLI's main progress, which the Framework's own messages also use. To show a message of your own, get a progress by a unique name with `progress.get(name)`, set its message with `notice()` and clear it with `remove()` when the work is done:

```javascript
const myProgress = progress.get('my-plugin')
myProgress.notice('Compiling with my-plugin')
// ...
myProgress.notice('Uploading with my-plugin')
// ...
myProgress.remove()
```

`progress.get()` returns the same progress for the same name anywhere in the process, so you don't have to pass the instance around. When several progresses have a message, the spinner shows the first one followed by `(and 1 more task)` or `(and N more tasks)`. `create({ message })` and `update(message)` are aliases of `notice()` on the progress you call them on; `create()` ignores a `name`.

Show progress for work that usually takes more than about two seconds, and name your plugin's tool in the message ("Compiling with webpack", not "Compiling" or "[Webpack] Compiling").

## Output without an interactive terminal

Without an interactive terminal, for example in CI (`CI` set), with piped output, or under an AI coding agent, the Framework draws no spinner and prompts can't be answered:

- `progress.notice()` prints the message as a line only with `--verbose`; `remove()` does nothing.
- `log` and `writeText` behave the same as in a terminal.
- `log.isInteractive()` returns `false`. Check it before asking the user anything, and fall back to a CLI option or configuration value.

`SLS_INTERACTIVE_SETUP_ENABLE` forces interactive mode, except on a terminal that reports a width of zero.

## Errors in plugins

To stop the command with an error the user can fix, such as invalid input or configuration, throw the Framework's error class:

```javascript
throw new serverless.classes.Error(
  'custom.myPlugin.bucket must be a bucket name',
  'MY_PLUGIN_INVALID_BUCKET',
  { stack: false },
)
```

The arguments are the message, an optional error code, and options. With `{ stack: false }`, the CLI prints only `✖` and the message. Any other thrown error, including one without `stack: false`, prints with its stack trace and a hint to run the command again with `--debug`.

Log an error with `log.error()` instead of throwing it only when the command should continue, for example when one request fails in a local server that keeps running.

## Add sections to the service information

The service information is the summary printed after `serverless deploy` and by `serverless info`. To add a line to it, call `serverless.addServiceOutputSection()` with a section name and a string:

```javascript
serverless.addServiceOutputSection(
  'dashboard',
  'https://example.com/my-service',
)
```

```text
dashboard: https://example.com/my-service
```

To add a section of several lines, pass an array of strings:

```javascript
serverless.addServiceOutputSection('queues', ['orders', 'payments'])
```

```text
queues:
  orders
  payments
```

Add sections in a hook that runs before the summary prints, for example `after:deploy:deploy` or `before:info:info`. A section name can be added once per command, and the content can't be an empty string or an empty array; both throw an error. `serverless info --json` doesn't include plugin sections.

## Report deprecations

To tell users that a feature of your plugin is deprecated, call `serverless.logDeprecation()` with a code and a message:

```javascript
serverless.logDeprecation(
  'MY_PLUGIN_OLD_OPTION',
  'custom.myPlugin.oldOption is deprecated. Use custom.myPlugin.newOption instead.',
)
```

The Framework prefixes the code with `EXT_` (here `EXT_MY_PLUGIN_OLD_OPTION`) and reports each code once per command. What happens next depends on the service's settings:

- By default, the Framework records the deprecation without printing it.
- With `deprecationNotificationMode: warn` in `serverless.yml`, or `SLS_DEPRECATION_NOTIFICATION_MODE=warn`, it prints the message as a warning.
- With `deprecationNotificationMode: error`, or `SLS_DEPRECATION_NOTIFICATION_MODE=error`, the command stops with the message and a `More Info` link.
- With the code in `disabledDeprecations` (`disabledDeprecations: [EXT_MY_PLUGIN_OLD_OPTION]`) or in the comma-separated `SLS_DEPRECATION_DISABLE`, it does nothing. `*` in either disables every deprecation.

`SLS_DEPRECATION_NOTIFICATION_MODE` takes precedence over `deprecationNotificationMode`.

Prefix the code with your plugin's name, and use only uppercase letters, digits and underscores, so users can list it in `disabledDeprecations`. Say in the message what to use instead.

## Related pages

- [Create a plugin](./creating-plugins.md): the plugin class, its constructor arguments and lifecycle hooks
- [Custom commands](./custom-commands.md): commands whose output you write with `writeText`
- [Plugins](./README.md)
