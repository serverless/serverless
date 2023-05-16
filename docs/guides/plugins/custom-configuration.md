<!--
title: Serverless Framework - Plugins - Extending the configuration
menuText: Extending the configuration schema
menuOrder: 5
description: How to extend the serverless.yml schema with custom configuration via a plugin
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/plugins/custom-configuration)

<!-- DOCS-SITE-LINK:END -->

# Extending the configuration schema

Plugin can extend the `serverless.yml` syntax with custom configuration:

```yaml
service: app
provider:
  name: aws

# ...

my-plugin:
  my-plugin-config: foo
```

To do so, plugins must define schema validation (see below), and can retrieve configuration values via `serverless.service`:

```js
class MyPlugin {
  constructor(serverless) {
    this.serverless = serverless;
    this.hooks = {
      'before:deploy': () => this.beforeDeploy(),
    };
  }

  beforeDeploy() {
    // `service` contains the (resolved) serverless.yml config
    const service = this.serverless.service;
    console.log('Provider name: ', service.provider.name);
    console.log('Functions: ', service.functions);
    console.log('Custom plugin config: ', service['my-plugin']['my-plugin-config']);
  }
}

module.exports = MyPlugin;
```

**Note:** configuration values are only resolved _after_ plugins are initialized. Do not try to read configuration in the plugin constructor, as variables aren't resolved yet. Read configuration in lifecycle events only.

## Validating the configuration

Any additional configuration defined by plugins in `serverless.yml` must come with validation rules.

Serverless Framework uses JSON schema validation backed by [the AJV library](https://github.com/ajv-validator/ajv). You can extend [the base schema](/lib/configSchema/index.js) in plugins via:

- `defineTopLevelProperty`
- `defineCustomProperties`
- `defineFunctionEvent`
- `defineFunctionEventProperties`
- `defineFunctionProperties`
- `defineProvider`

Use the following map to know which helper suits your needs:

```yml
custom:
  my-plugin:
    customProperty: foobar # <-- use defineCustomProperties

my-plugin: # <-- use defineTopLevelProperty
  customProperty: foobar

provider:
  name: new-provider # <-- use defineProvider
  my-plugin:
    customProperty: foobar

functions:
  someFunc:
    handler: handler.main
    customProperty: foobar # <-- use defineFunctionProperties
    events:
      - yourPluginEvent: # <-- use defineFunctionEvent
          customProperty: foobar
      - http:
          customProperty: foobar # <-- use defineFunctionEventProperties
```

We'll walk though those helpers. You may also want to check out examples from [helpers tests](tests/fixtures/configSchemaExtensions/test-plugin.js)

### Top-level properties via `defineTopLevelProperty`

If your plugin requires additional top-level properties (like `provider`, `custom`, `service`...), you can use the `defineTopLevelProperty` helper to add their definition. For example:

```yml
# serverless.yml
service: my-service

myPlugin:
  someProperty: foobar
```

Add validation for the `myPlugin:` section:

```javascript
class MyPlugin {
  constructor(serverless) {
    // For reference on JSON schema, see https://github.com/ajv-validator/ajv
    serverless.configSchemaHandler.defineTopLevelProperty('myPlugin', {
      type: 'object',
      properties: {
        someProperty: { type: 'string' },
      },
      required: ['someProperty'],
    });
  }
}
```

This way, if the user sets `someProperty` by mistake to `false`, the Framework would display an error:

```
Configuration error: yourPlugin.someProperty should be string
```

### Properties in `custom` via `defineCustomProperties`

If your plugin depends on properties defined in the `custom:` section, you can use the `defineCustomProperties` helper. For example:

```yml
# serverless.yml

custom:
  myCustomProperty: foobar
```

Add validation for the `myCustomProperty` property:

```javascript
class MyPlugin {
  constructor(serverless) {
    // For reference on JSON schema, see https://github.com/ajv-validator/ajv
    serverless.configSchemaHandler.defineCustomProperties({
      type: 'object',
      properties: {
        myCustomProperty: { type: 'string' },
      },
      required: ['myCustomProperty'],
    });
  }
}
```

This way, if the user sets `myCustomProperty` by mistake to `false`, the Framework would display an error:

```
Configuration error: custom.myCustomProperty should be string
```

### Function properties via `defineFunctionProperties`

If your plugin adds new properties to functions, you can use the `defineFunctionProperties` helper. For example:

```yml
# serverless.yml

functions:
  foo:
    handler: handler.main
    someCustomProperty: my-property-value
```

Add validation for the `someCustomProperty` property:

```javascript
class MyPlugin {
  constructor(serverless) {
    // For reference on JSON schema, see https://github.com/ajv-validator/ajv
    serverless.configSchemaHandler.defineFunctionProperties('providerName', {
      properties: {
        someCustomProperty: { type: 'string' },
        anotherProperty: { type: 'number' },
      },
      required: ['someCustomProperty'],
    });
  }
}
```

This way, if the user sets `anotherProperty` by mistake to `hello`, the Framework would display an error:

```
Configuration error at 'functions.foo.anotherProperty': should be number
```

### Function events via `defineFunctionEvent`

If your plugin adds support to a new function event, you can use the `defineFunctionEvent` helper. For example:

```yml
# serverless.yml

functions:
  someFunc:
    handler: handler.main
    events:
      - myPluginEvent:
          someProp: hello
          anotherProp: 1
```

Add validation for the `myPluginEvent` event:

```javascript
class MyPlugin {
  constructor(serverless) {
    // For reference on JSON schema, see https://github.com/ajv-validator/ajv
    serverless.configSchemaHandler.defineFunctionEvent('providerName', 'myPluginEvent', {
      type: 'object',
      properties: {
        someProp: { type: 'string' },
        anotherProp: { type: 'number' },
      },
      required: ['someProp'],
      additionalProperties: false,
    });
  }
}
```

This way, if the user sets `anotherProp` by mistake to `some-string`, the Framework would display an error:

```
Configuration error: functions.someFunc.events[0].myPluginEvent.anotherProp should be number
```

### Function event properties via `defineFunctionEventProperties`

If your plugin adds new properties to a function event, you can use the `defineFunctionEventProperties` helper. For example:

```yml
# serverless.yml

functions:
  foo:
    handler: handler.main
    events:
      - http:
          path: '/quote'
          method: GET
          documentation: Get a quote
```

In the example above, the plugin adds a new `documentation` property on `http` events for `aws`. To validate that properties:

```javascript
class MyPlugin {
  constructor(serverless) {
    // For reference on JSON schema, see https://github.com/ajv-validator/ajv
    serverless.configSchemaHandler.defineFunctionEventProperties('aws', 'http', {
      properties: {
        documentation: { type: 'string' },
      },
      required: ['documentation'],
    });
  }
}
```

This way, if the user sets `documentation` by mistake to `false`, the Framework would display an error:

```
Configuration error: functions.foo.events[0].http.documentation should be a string
```

### New provider via `defineProvider`

If your plugin provides support for a new provider, register it via `defineProvider`:

```javascript
class MyPlugin {
  constructor(serverless) {
    // For reference on JSON schema, see https://github.com/ajv-validator/ajv
    serverless.configSchemaHandler.defineProvider('newProvider', {
      // Eventual reusable schema definitions (will be put to top level "definitions" object)
      definitions: {
        // ...
      },

      // Top level "provider" properties
      provider: {
        properties: {
          stage: { type: 'string' },
          remoteFunctionData: { type: 'null' },
        },
      },

      // Function level properties
      function: {
        properties: { handler: { type: 'string' } },
      },

      // Function events definitions (can be defined here or via `defineFunctionEvent` helper)
      functionEvents: {
        someEvent: {
          name: 'someEvent',
          schema: {
            type: 'object',
            properties: {
              someRequiredStringProp: { type: 'string' },
              someNumberProp: { type: 'number' },
            },
            required: ['someRequiredStringProp'],
            additionalProperties: false,
          },
        },
      },

      // Definition for eventual top level "resources" section
      resources: {
        type: 'object',
        properties: {
          // ...
        },
      },

      // Definition for eventual top level "layers" section
      layers: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          properties: {
            // ...
          },
        },
      },
    });
  }
}
```
