<!--
title: Extend the Service Configuration from a Plugin
description: Add or override serverless.yml values from a Serverless Framework plugin with serverless.extendConfiguration() in the constructor or asyncInit().
short_title: Extend Configuration
keywords: ['Serverless Framework plugin', 'extendConfiguration', 'override serverless.yml', 'plugin configuration']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/plugins/extending-configuration)

<!-- DOCS-SITE-LINK:END -->

# Extend the service configuration from a plugin

A Serverless Framework plugin can add values to the service configuration, or replace values from `serverless.yml`, with `serverless.extendConfiguration()`. Use it when a plugin generates configuration, such as functions, resources or `custom` settings, that the rest of the Framework and other plugins should see as if it were in `serverless.yml`.

This plugin sets `custom.myPlugin` in its constructor:

```javascript
// my-plugin.mjs
export default class MyPlugin {
  constructor(serverless) {
    serverless.extendConfiguration(['custom', 'myPlugin'], {
      bucket: 'my-assets-${sls:stage}',
    })
  }
}
```

With the plugin listed in `plugins`, `serverless print --stage prod` shows the value, with its variable resolved:

```text
custom:
  myPlugin:
    bucket: my-assets-prod
```

## `serverless.extendConfiguration()` arguments

`serverless.extendConfiguration(configurationPathKeys, value)` sets `value` at the path `configurationPathKeys` of the configuration:

| Argument                | Type             | Description                                                                                         |
| ----------------------- | ---------------- | --------------------------------------------------------------------------------------------------- |
| `configurationPathKeys` | array of strings | The path of the property to set, for example `['functions', 'hello', 'timeout']`. At least one key. |
| `value`                 | any JSON value   | The new value of the property.                                                                      |

- If the property exists, the value replaces it; the Framework doesn't merge objects or arrays.
- If the property or its parents don't exist, the Framework creates them.
- The Framework stores a JSON copy of `value`: functions and properties set to `undefined` are left out, and `Date` objects become strings.

## When a plugin can extend the configuration

Call `serverless.extendConfiguration()` in the plugin constructor or in `asyncInit()`. Use `asyncInit()` when the value comes from an asynchronous call:

```javascript
// my-plugin.mjs
import { readFile } from 'node:fs/promises'

export default class MyPlugin {
  constructor(serverless) {
    this.serverless = serverless
  }

  async asyncInit() {
    const path = `${this.serverless.serviceDir}/my-plugin.json`
    const settings = JSON.parse(await readFile(path, 'utf8'))
    this.serverless.extendConfiguration(['custom', 'myPlugin'], settings)
  }
}
```

After all plugins are initialized, the Framework:

1. Resolves the variables in the values that plugins added, with built-in and plugin-defined sources.
2. Validates the whole configuration against the schema, including the added values. See [Custom configuration](./custom-configuration.md).
3. Runs the command's lifecycle events. In hooks, `serverless.service` and `serverless.configurationInput` contain the added values.

A call from a hook throws `Cannot extend configuration: It can only be extended during initialization phase.`

## Merge a value with the existing configuration

To add keys to an object from `serverless.yml` instead of replacing it, read the current value from `serverless.configurationInput` and pass the merged object:

```javascript
// my-plugin.mjs
export default class MyPlugin {
  constructor(serverless) {
    const current = serverless.configurationInput.custom?.myPlugin ?? {}
    serverless.extendConfiguration(['custom', 'myPlugin'], {
      ...current,
      region: 'us-east-1',
    })
  }
}
```

In the constructor, values from built-in variable sources are already resolved, and variables of plugin-defined sources still hold their `${...}` text. The Framework resolves that text after the call, as part of the added value.

## Errors from `serverless.extendConfiguration()`

`serverless.extendConfiguration()` throws these errors:

- `Cannot extend configuration: ConfigurationPathKeys needs to contain at least one element.` for an empty array.
- `<value> is not an array` when `configurationPathKeys` isn't an array, for example a string.
- `Cannot extend configuration: Received non JSON value: <value>` when `value` can't be converted to JSON, for example `undefined` or an object that refers to itself.
- `Cannot extend configuration: It can only be extended during initialization phase.` when it's called after the constructors and `asyncInit()` of all plugins have run.

## Related pages

- [Create a plugin](./creating-plugins.md): the plugin class, `asyncInit()` and lifecycle hooks
- [Custom configuration](./custom-configuration.md): validate the keys your plugin adds
- [Custom variables](./custom-variables.md): add `${source:...}` variable sources
