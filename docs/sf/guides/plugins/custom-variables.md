<!--
title: Custom Variable Sources in Plugins
description: Add your own variable source to serverless.yml from a Serverless Framework plugin with configurationVariablesSources and a resolve function.
short_title: Custom Variables
keywords: ['Serverless Framework plugin', 'configurationVariablesSources', 'custom variable source', 'variable resolver', 'serverless.yml variables']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/plugins/custom-variables)

<!-- DOCS-SITE-LINK:END -->

# Custom variable sources in plugins

A Serverless Framework plugin can add its own variable source to `serverless.yml`, such as `${greeting:world}`, next to built-in sources like `${env:...}` and `${ssm:...}`. Use a custom source to read values from a system the Framework has no source for. The plugin sets `configurationVariablesSources` in its constructor, with a `resolve` function for each source name.

This plugin adds the `greeting` source:

```javascript
// my-plugin.mjs
export default class MyPlugin {
  constructor() {
    this.configurationVariablesSources = {
      greeting: {
        async resolve({ address }) {
          // In ${greeting:world}, address is 'world'
          return { value: `Hello, ${address}` }
        },
      },
    }
  }
}
```

A service lists the plugin and uses the source:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

custom:
  message: ${greeting:world}

functions:
  hello:
    handler: handler.hello

plugins:
  - ./my-plugin.mjs
```

`serverless print` shows the resolved value:

```text
custom:
  message: Hello, world
```

## The `resolve` function

To resolve a variable of the source, the Framework calls `resolve` with one object argument:

| Property                             | Value                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `address`                            | The text after the source name and colon: `world` in `${greeting:world}`.                                                       |
| `params`                             | The parameters in parentheses as an array of strings: `['one', 'two']` in `${greeting(one, two):world}`; otherwise `undefined`. |
| `options`                            | The command's CLI options. `options.stage` is set only when `--stage` is passed.                                                |
| `resolveVariable(variable)`          | Resolves another variable, written without `${}`, for example `resolveVariable('sls:stage')`.                                   |
| `resolveConfigurationProperty(keys)` | Returns the resolved value at a path of `serverless.yml`, given as an array of keys, for example `['provider', 'region']`.      |

`resolve` returns an object whose `value` property is the variable's value: a string, number, boolean, object or array. A return value without a `value` property, such as a plain string, and `{ value: null }` or `{ value: undefined }` count as no value. Then the variable's fallback applies, as in `${greeting:world, 'Hi'}`; without a fallback, the command stops with:

```text
Cannot resolve '${greeting:world}' variable at 'custom.message'. No value is available for this variable, and no default value was provided. Please check your variable definitions or provide a default value.
```

When `resolve` throws, the fallback doesn't apply: the command stops with an error that starts with `Failed to resolve variable 'world' with resolver 'greeting'` and ends with the thrown error.

## Variable parameters

A variable of a custom source can take parameters in parentheses after the source name. The Framework passes them to `resolve` in `params`, trims the spaces around each parameter, and removes the quotes around a quoted one:

```yaml
# serverless.yml
custom:
  joined: ${greeting(one, "two"):world}
```

```javascript
// my-plugin.mjs
export default class MyPlugin {
  constructor() {
    this.configurationVariablesSources = {
      greeting: {
        async resolve({ params = [] }) {
          // ${greeting(one, "two"):world} resolves to 'one,two'
          return { value: params.join(',') }
        },
      },
    }
  }
}
```

## Read other variables and configuration values in a resolver

To build a value from the stage, the Region or another variable, call `resolveVariable` and `resolveConfigurationProperty` in `resolve`:

```javascript
// my-plugin.mjs
export default class MyPlugin {
  constructor() {
    this.configurationVariablesSources = {
      greeting: {
        async resolve({
          address,
          resolveVariable,
          resolveConfigurationProperty,
        }) {
          const stage = await resolveVariable('sls:stage')
          const region = await resolveConfigurationProperty([
            'provider',
            'region',
          ])
          return { value: `${address} in ${stage} (${region})` }
        },
      },
    }
  }
}
```

Use `resolveVariable('sls:stage')` rather than `options.stage`, which is `undefined` when the stage comes from `provider.stage` or the default `dev`.

## When the Framework resolves custom variable sources

The Framework resolves the built-in variable sources first, then loads the plugins listed in `plugins`, and then resolves the variables of custom sources:

- Only plugins listed in the service's `plugins` can add a variable source.
- In the plugin constructor and in `asyncInit()`, a variable of a custom source still holds its `${...}` text in `serverless.service` and `serverless.configurationInput`. In hooks, it holds the resolved value.
- Variables in values that plugins add with [`serverless.extendConfiguration()`](./extending-configuration.md) are resolved too, with built-in and custom sources.

## Addresses with a colon

The address of a custom source can't contain a colon. The Framework reads `${greeting:a:b}` as the resolver `a` of the source `greeting`, and stops with:

```text
a resolver of provider greeting not found
```

Encode the colon in another character, or pass the value as a parameter: `${greeting("a:b"):value}`.

## Related pages

- [Variables](../variables/README.md): the built-in variable sources and the `${source:address}` syntax
- [Create a plugin](./creating-plugins.md)
- [Extending and overriding configuration](./extending-configuration.md)
- [Custom configuration](./custom-configuration.md): validate the keys your plugin adds
