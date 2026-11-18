<!--
title: Custom Configuration in Plugins
description: Validate the serverless.yml keys a Serverless Framework plugin adds, with configSchemaHandler helpers such as defineCustomProperties and defineFunctionEvent.
short_title: Custom Configuration
keywords: ['Serverless Framework plugin', 'configSchemaHandler', 'defineCustomProperties', 'defineTopLevelProperty', 'defineFunctionEvent', 'configuration validation']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/plugins/custom-configuration)

<!-- DOCS-SITE-LINK:END -->

# Custom configuration in plugins

A Serverless Framework plugin can add its own keys to `serverless.yml`: under `custom`, at the top level, on functions, as a new function event, or on an existing event. The plugin registers a JSON schema for each key with the helpers of `serverless.configSchemaHandler`, so the Framework validates the keys with the rest of the configuration and reports mistakes.

This plugin validates `custom.myPlugin` and reads it after the configuration is resolved:

```javascript
// my-plugin.mjs
export default class MyPlugin {
  constructor(serverless, options, { log }) {
    this.serverless = serverless
    this.log = log

    serverless.configSchemaHandler.defineCustomProperties({
      properties: {
        myPlugin: {
          type: 'object',
          properties: {
            bucket: { type: 'string' },
            minify: { type: 'boolean' },
          },
          required: ['bucket'],
          additionalProperties: false,
        },
      },
    })

    this.hooks = {
      'before:package:initialize': () => this.checkConfig(),
    }
  }

  checkConfig() {
    const { bucket, minify = false } = this.serverless.service.custom.myPlugin
    this.log.notice(`Uploading to ${bucket} (minify: ${minify})`)
  }
}
```

A service configures the plugin like this:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

custom:
  myPlugin:
    bucket: my-assets-bucket
    minify: true

functions:
  hello:
    handler: handler.hello

plugins:
  - ./my-plugin.mjs
```

If `custom.myPlugin.bucket` is missing, the command prints `at 'custom.myPlugin': must have required property 'bucket'` under an `Invalid configuration encountered` warning, or stops when the service sets `configValidationMode: error` (see [How the Framework reports schema violations](#how-the-framework-reports-schema-violations)).

## Extending the validation schema

The Framework validates `serverless.yml` against a JSON schema, with the [AJV library](https://ajv.js.org/). The `configSchemaHandler` helpers add your plugin's keys to that schema. Pick the helper by where the key goes:

```yaml
# serverless.yml
myPlugin: # defineTopLevelProperty
  someProperty: foobar

build:
  myBundler: # defineBuildProperty
    minify: true

custom:
  myPlugin: # defineCustomProperties
    someProperty: foobar

provider:
  name: aws

functions:
  someFunc:
    handler: handler.main
    someCustomProperty: foobar # defineFunctionProperties
    events:
      - myPluginEvent: # defineFunctionEvent
          someProperty: foobar
      - http:
          path: /quote
          method: get
          documentation: foobar # defineFunctionEventProperties
```

Call the helpers in the plugin constructor or in `asyncInit()`. The Framework validates the configuration after it has initialized all plugins, before the command's lifecycle events run.

These rules apply to every helper:

- `defineCustomProperties`, `defineFunctionProperties` and `defineFunctionEventProperties` merge only the `properties` and `required` keys of the schema you pass. Other keywords, such as `type` or `additionalProperties` at that level, are ignored. Put them in the schema of each property instead.
- The helpers that take a provider name (`defineFunctionProperties`, `defineFunctionEvent` and `defineFunctionEventProperties`) do nothing unless the name is `aws`, the only provider the Framework runs.
- Defining a property, event or top-level key that the Framework or another plugin already defines throws an error with the code `SCHEMA_COLLISION`, for example `Top-level property 'custom' already have a definition - this property might have already been defined by the Serverless framework or one other plugin`.
- Validation converts values to the schema's type where it can, and changes them in the configuration: with `type: 'string'`, `5` becomes `'5'` and `false` becomes `'false'`; with `type: 'boolean'`, `'true'` becomes `true`; a one-item list becomes its item. Only values that can't be converted, such as a map for a string, are reported. See [AJV type coercion](https://ajv.js.org/coercion.html).

## How the Framework reports schema violations

The service's `configValidationMode` decides what happens when the configuration doesn't match the schema:

- `warn` (the default): the Framework prints the violations and continues:

  ```text
  Invalid configuration encountered
    at 'functions.someFunc.someCustomProperty': must be string
  ```

- `error`: the command stops with `Configuration error at 'functions.someFunc.someCustomProperty': must be string`, or with a list when there are several violations.
- `off`: the Framework doesn't report violations.

Each violation names the path of the value in `serverless.yml`, with list items as numbers (`functions.someFunc.events.0.myPluginEvent`).

## Validate properties under `custom` with `defineCustomProperties`

To validate keys under `custom`, pass their schemas in `properties`, and the names of the keys that must be set in `required`:

```javascript
serverless.configSchemaHandler.defineCustomProperties({
  properties: {
    myCustomProperty: { type: 'string' },
  },
  required: ['myCustomProperty'],
})
```

```yaml
# serverless.yml
custom:
  myCustomProperty: foobar
```

A map in `myCustomProperty` prints `at 'custom.myCustomProperty': must be string`. Keys under `custom` that no plugin defines aren't validated.

## Validate top-level properties with `defineTopLevelProperty`

To add a top-level key to `serverless.yml`, pass its name and its full schema:

```javascript
serverless.configSchemaHandler.defineTopLevelProperty('myPlugin', {
  type: 'object',
  properties: {
    someProperty: { type: 'string' },
  },
  required: ['someProperty'],
})
```

```yaml
# serverless.yml
myPlugin:
  someProperty: foobar
```

A map in `someProperty` prints `at 'myPlugin.someProperty': must be string`. Without this definition, the Framework reports any unknown top-level key. Read a top-level key in hooks from `serverless.configurationInput.myPlugin`; `serverless.service` holds only the keys the Framework itself defines.

## Validate function properties with `defineFunctionProperties`

To add keys to every function, pass the provider name and the schemas of the keys:

```javascript
serverless.configSchemaHandler.defineFunctionProperties('aws', {
  properties: {
    someCustomProperty: { type: 'string' },
    anotherProperty: { type: 'number' },
  },
  required: ['someCustomProperty'],
})
```

```yaml
# serverless.yml
functions:
  foo:
    handler: handler.main
    someCustomProperty: my-property-value
    anotherProperty: 3
```

`anotherProperty: hello` prints `at 'functions.foo.anotherProperty': must be number`. Read the keys in hooks with `serverless.service.getFunction('foo').anotherProperty`.

## Add a function event with `defineFunctionEvent`

To add a new event type to `functions.<name>.events`, pass the provider name, the event name and the full schema of the event's value:

```javascript
serverless.configSchemaHandler.defineFunctionEvent('aws', 'myPluginEvent', {
  type: 'object',
  properties: {
    someProp: { type: 'string' },
    anotherProp: { type: 'number' },
  },
  required: ['someProp'],
  additionalProperties: false,
})
```

```yaml
# serverless.yml
functions:
  someFunc:
    handler: handler.main
    events:
      - myPluginEvent:
          someProp: hello
          anotherProp: 1
```

`anotherProp: some-string` prints `at 'functions.someFunc.events.0.myPluginEvent.anotherProp': must be number`. An event name the Framework or another plugin already defines throws `Function event '<name>' already have a definition ...`.

## Add properties to an existing event with `defineFunctionEventProperties`

To add keys to an event the Framework or another plugin defines, pass the provider name, the event name and the schemas of the keys:

```javascript
serverless.configSchemaHandler.defineFunctionEventProperties('aws', 'http', {
  properties: {
    documentation: { type: 'string' },
  },
  required: ['documentation'],
})
```

```yaml
# serverless.yml
functions:
  foo:
    handler: handler.main
    events:
      - http:
          path: /quote
          method: get
          documentation: Get a quote
```

A map in `documentation` prints `at 'functions.foo.events.0.http.documentation': must be string`. The keys apply to the object form of the event only. An event that isn't defined throws `Event '<name>' is not an existing function event`, and an event without an object form throws `Event '<name>' has no object definition. Its schema cannot be modified`.

## Add a build property with `defineBuildProperty`

To add a key under `build`, pass its name and its full schema:

```javascript
serverless.configSchemaHandler.defineBuildProperty('myBundler', {
  type: 'object',
  properties: {
    minify: { type: 'boolean' },
  },
})
```

```yaml
# serverless.yml
build:
  myBundler:
    minify: true
```

`minify: 7` prints `at 'build.myBundler.minify': must be boolean`.

## Provider schemas and `defineProvider`

`configSchemaHandler.defineProvider(name, schema)` registers the schema of a whole provider. Serverless Framework v4 runs only services whose `provider.name` is `aws`, and the Framework's AWS provider defines that schema, so plugins don't call `defineProvider`. Any other `provider.name` stops the command with:

```text
Serverless Framework V.4 only supports "aws" as a Provider. Please look into Extensions for a better multi-Provider experience.
```

Pass `'aws'` as the provider name to `defineFunctionProperties`, `defineFunctionEvent` and `defineFunctionEventProperties`.

## Read your plugin's configuration

Read configuration in hooks. The Framework resolves the variables in `serverless.yml` before it constructs plugins, except variables whose source a plugin defines: those still hold their `${...}` text in the constructor, and are resolved before the first hook runs.

- `serverless.service.custom`, `serverless.service.provider` and `serverless.service.getFunction(name)` hold the resolved `custom`, `provider` and function configuration.
- `serverless.configurationInput` holds the whole resolved configuration, including top-level keys your plugin defines.

## Related pages

- [Create a plugin](./creating-plugins.md): the plugin class, constructor arguments and lifecycle hooks
- [Extending and overriding configuration](./extending-configuration.md): change the configuration from a plugin
- [Custom variables](./custom-variables.md): add `${source:...}` variable sources
- [Plugins](./README.md)
