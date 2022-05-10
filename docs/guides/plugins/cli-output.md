<!--
title: Serverless Framework - Plugins - CLI output
menuText: CLI output
menuOrder: 2
description: How to write to the CLI output in Serverless Framework plugins.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/plugins/cli-output)

<!-- DOCS-SITE-LINK:END -->

# CLI output in plugins

Plugins can integrate and extend the CLI output of the Serverless Framework in different ways.

## Writing to the output

In Serverless Framework v2, plugins could write to the CLI output via `serverless.cli.log()`:

```js
// This approach is deprecated:
serverless.cli.log('Message');
```

The method above is deprecated. It should no longer be used in Serverless Framework v3.

Instead, plugins can log messages to the CLI output via a standard `log` interface:

```js
class MyPlugin {
  constructor(serverless, cliOptions, { log }) {
    log.error('Error');
    log.warning('Warning');
    log.notice('Message');
    log.info('Verbose message'); // --verbose log
    log.debug('Debug message'); // --debug log
  }
}
```

Some aliases exist to make log levels more explicit:

```js
log('Here is a message');
// is an alias to:
log.notice('Here is a message');

log.verbose('Here is a verbose message'); // displayed with --verbose
// is an alias to:
log.info('Here is a verbose message'); // displayed with --verbose
```

To write a formatted "success" message, use the following helper:

```js
log.success('The task executed with success');
```

Success messages render with the checkmark, like the "Service deployed" success message:

![](https://uploads-ssl.webflow.com/60acbb950c4d6606963e1fed/618259092410635f822c71af_framework-plugin-api-success-message.png)

Log methods also support the printf format:

```js
log.warning('Here is a %s log', 'formatted');
```

**Best practices:**

- **Keep the default CLI output minimal.**
- Log most information to the `--verbose` output.
- Warnings should be used exceptionally. Consider whether the plugin should instead throw an exception, log a `--verbose` message or trigger a deprecation (see below).
- Before using `log.error()`, consider [throwing an exception](#errors): exceptions are automatically caught by the Serverless Framework and formatted with details.
- Debugging logs should be logged to the `--debug` level. Debug logs can be namespaced following the [`debug` convention](https://github.com/visionmedia/debug#usage) via `log.get('my-namespace').debug('Debug message')`. Such logs can then be filtered in the CLI output via `--debug=plugin-name:my-namespace`.

**By default, logs are written to `stderr`**, which displays in terminals (humans cannot tell the difference). This is intentional: plugins can safely log extra messages to any command, even commands meant to be piped or parsed by another program. Read the next section to learn more.

### Writing command output to `stdout`

By default, plugins should write messages to `stderr` via the `log` object. To write command output to `stdout` instead, use `writeText()`:

```js
class MyPlugin {
  constructor(serverless, cliOptions, { writeText }) {
    writeText('Command output');
    writeText(['Here is a', 'multi-line output']);
  }
}
```

**Best practices:**

- `stdout` output is usually meant to be piped to/parsed by another program.
- Plugins should only write to `stdout` in commands they define (to avoid breaking the output of other commands).
- The only content written to `stdout` should be the main output of the command.

Take, for example, the `serverless invoke` command:

- Its output is the result of the Lambda invocation: by writing that result (and only that) to `stdout`, it allows any script to parse the result of the Lambda invocation.
- All other messages should be written to `stderr`: such logs are useful to humans, for example configuration warnings, upgrade notifications, Lambda logs… Since they are written to `stderr`, they do not break the parsable output of `stdout`.

**If unsure, write to `stderr`** (with the `log` object) instead of `stdout`. Why: human users will not see any difference, but the door will stay open to write a parsable output later in the future.

### Colors and formatting

To format and color text output, use the [chalk](https://github.com/chalk/chalk) package. For example:

```js
log.notice(chalk.gray('Here is a message'));
```

**Best practices:**

- Write primary information in **white**, secondary information in **gray**.
  - Primary information is the direct outcome of a command (e.g. deployment result of the `deploy` command, or result of the `invoke` command). Secondary information is everything else.
- Plugins should generally not use any other color, nor introduce any other custom formatting. Output formatting is meant to be minimalistic.
- Plugins should use built-in formats documented in this page: success messages (`log.success()`), interactive progress…

The "Serverless red" color (`#fd5750`) is used to grab the user's attention:

- It should be used minimally, and maximum once per command.
- It should be used only to grab attention to the command's most important information.

## Errors

The Serverless Framework differentiates between 2 errors:

- user errors (wrong input, invalid configuration, etc.)
- programmer errors (aka bugs)

To throw a **user error** and have it properly formatted, use Serverless' error class:

```js
throw new serverless.classes.Error('Invalid configuration in X');
```

All other errors are considered programmer errors by default (and are properly formatted in the CLI output as well).

**Best practices:**

- If an error should stop the execution of the command, use `throw`.
- If an error should _not_ stop the execution of the command (which should be exceptional), log it via `log.error()`.
  - For example any execution error in `serverless-offline` should not stop the local server.

## Interactive progress

Plugins can create an interactive progress:

```js
class MyPlugin {
  constructor(serverless, cliOptions, { progress }) {
    const myProgress = progress.create({
      message: 'Doing extra work in my-plugin',
    });
    // ...
    myProgress.update('Almost finished');
    // ...
    myProgress.remove();
  }
}
```

In case of parallel processing (for example compiling multiple files in parallel), it is possible to create multiple progress items if that is useful to users.

**Best practices:**

- Create a progress for tasks that usually take **more than 2 seconds**. Below that threshold, plugins can operate silently and log to `--verbose` only.
- Users should know which plugin is working from the progress message:
  - Bad: "Compiling"
  - Bad: "[Webpack] Compiling" (avoid prefixes)
  - Good: "Compiling with webpack"
- Displaying multiple progresses should be exceptional, and limited to 3-4 progresses at a time. It is better to keep the output minimal than too noisy.

Note that it is possible to give a unique name to a progress. That name can be used to retrieve the progress without having to pass the instance around:

```js
// Progress without any name:
const myProgress = progress.create({
  message: 'Doing extra work in my-plugin',
});

// Progress with a unique name
progress.create({
  message: 'Doing extra work in my-plugin',
  name: 'my-plugin-progress', // Try to make the name unique across all plugins
});
// elsewhere...
progress.get('my-plugin-progress').update('Almost finished');
// elsewhere...
progress.get('my-plugin-progress').remove();
```

## Service information

Plugins can add their own sections to the "Service information", i.e. the information displayed after `serverless deploy` or in `serverless info`.

To add a single item:

```js
serverless.addServiceOutputSection('my section', 'content');
```

The example above will be displayed as:

```
$ serverless info
functions:
  ...
my section: content
```

To add a multi-line section:

```js
serverless.addServiceOutputSection('my section', ['line 1', 'line 2']);
```

The example above will be displayed as:

```
$ serverless info
functions:
  ...
my section:
  line 1
  line 2
```

## Deprecations

Plugins can signal deprecated features to users via `logDeprecation()`:

```js
serverless.logDeprecation(
  'DEPRECATION_CODE',
  'Feature X of my-plugin is deprecated. Please use Y instead.'
);
```

These deprecations will integrate with the deprecation system of the Serverless Framework.

**Best practices:**

- Prefix the deprecation code with the plugin name, for example: `OFFLINE_XXX`.
- Make the message actionable for users: if a feature is deprecated, what should users use instead? Feel free to add links if necessary.

## Retrieving the I/O API

As shown in the examples above, the I/O API is injected in the constructor of plugins:

```js
class MyPlugin {
  constructor(serverless, cliOptions, { writeText, log, progress }) {
    // ...
  }
}
```

However, it is also possible to retrieve it from any JavaScript file by requiring the `@serverless/utils` package:

```js
const { writeText, log, progress } = require('@serverless/utils/log');
```
