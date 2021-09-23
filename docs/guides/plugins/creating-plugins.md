<!--
title: Serverless Framework - Creating plugins
menuText: Plugins
menuOrder: 14
description: How to create custom plugins to customize the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/plugins/creating-plugins)

<!-- DOCS-SITE-LINK:END -->

# Creating custom plugins

A plugin is custom Javascript code that adds new features to the Serverless Framework. The Serverless Framework is merely a group of Plugins that are provided in the core. If you or your organization have a specific workflow, install a pre-written Plugin or write a plugin to customize the Framework to your needs. External Plugins are written exactly the same way as the core Plugins.

- [How to create serverless plugins - Part 1](https://serverless.com/blog/writing-serverless-plugins/)
- [How to create serverless plugins - Part 2](https://serverless.com/blog/writing-serverless-plugins-2/)

Plugins can:

- Define new CLI commands
- Hook into core and custom _lifecycle events_
- Define new variable sources
- Extend the `serverless.yml` syntax
- Write extra information to the CLI output
- Add support for new cloud providers

**Note:** To ensure that your plugin works correctly with Serverless Framework `v2.x` and `v3.x`, keep the following things in mind:

- Do not depend on `Bluebird` API for Promises returned by Framework internals - we are actively migrating away from `Bluebird` at this point
- If your plugin adds new properties, ensure to define corresponding schema definitions, please refer to: [Extending validation schema](#extending-validation-schema)
- Avoid using `subcommands` as the support for them might become deprecated or removed in next major version of the Framework
- Add `serverless` to `peerDependencies` in order to ensure officially supported Framework version(s)

## Concepts

### Plugin

Code which defines _Commands_, any _Lifecycle Events_ within a _Command_, and any _Hooks_ assigned to a _Lifecycle Event_.

- Command // CLI configuration, commands, options
  - LifecycleEvent(s) // Events that happen sequentially when the command is run
    - Hook(s) // Code that runs when a Lifecycle Event happens during a Command

### Command

A CLI _Command_ that can be called by a user, e.g. `serverless foo`. A Command has no logic, but simply defines the CLI configuration (e.g. command, parameters) and the _Lifecycle Events_ for the command. Every command defines its own lifecycle events.

```javascript
'use strict';

class MyPlugin {
  constructor() {
    this.commands = {
      foo: {
        lifecycleEvents: ['resources', 'functions'],
      },
    };
  }
}

module.exports = MyPlugin;
```

### Lifecycle Events

Lifecycle Events are events that fire sequentially during a Command. The above example lists two Events. However, for each Event, an additional `before` and `after` event is created. Therefore, six Events exist in the above example:

- `before:foo:resources`
- `foo:resources`
- `after:foo:resources`
- `before:foo:functions`
- `foo:functions`
- `after:foo:functions`

The name of the command in front of lifecycle events when they are used for Hooks.

### Hooks

A Hook binds code to any lifecycle event from any command.

```javascript
'use strict';

class MyPlugin {
  constructor() {
    this.commands = {
      foo: {
        lifecycleEvents: ['resources', 'functions'],
      },
    };

    this.hooks = {
      'before:foo:resources': this.beforeFooResources,
      'foo:resources': this.fooResources,
      'after:foo:functions': this.afterFooFunctions,
    };
  }

  beforeFooResources() {
    console.log('Before Foo Resources');
  }

  fooResources() {
    console.log('Foo Resources');
  }

  afterFooFunctions() {
    console.log('After Foo Functions');
  }
}

module.exports = MyPlugin;
```

## Custom variables

Plugins can register custom configuration variables sources, for example `${my-variable-source:some-variable}`.

Custom sources can be registered via `configurationVariablesSources` as a plain object that exposes a `resolve` function:

```javascript
'use strict';

class SomePlugin {
  constructor() {

    this.configurationVariablesSources = {
      foo: {
        async resolve({address, params, resolveConfigurationProperty, options}) {
          // `address` and `params` reflect values configured with a variable:
          // ${foo(param1, param2):address}
          // Note: they're passed if they're configured into variable

          // `options` is CLI options
          // `resolveConfigurationProperty` allows to access other configuration properties,
          // and guarantees to return a fully resolved form (even if property is configured with variables)
          const stage = options.stage || await resolveConfigurationProperty(["provider", "stage"]) || "dev";

          // Resolver is expected to return plain object, with resolved value set on `value` property.
          // Resolve value can be any JSON value
          return {
            //
            value: `Resolution of "foo" source for "${stage}" stage at "${address || ""}" address with "${(params || []).join(", ")}" params`
          }
        }
      }
    }
  }
}
```

The variable source defined above (registered via a plugin) can be used as follows:

```yaml
service: test
provider: aws
custom:
  value1: ${foo(one, two):whatever}
plugins:
  - ./my-plugin
```

The configuration will be resolved into the following:

```yaml
service: test
provider: aws
custom:
  value1: Resolution of "foo" source for "dev" stage at "whatever" address with "one, two" params
plugins:
  - ./my-plugin
```

### Defining Options

Each command can have multiple Options.

Options are passed in with a double dash (`--`) like this: `serverless foo --function functionName`.

Option Shortcuts are passed in with a single dash (`-`) like this: `serverless foo -f functionName`.

The `options` object will be passed in as the second parameter to the constructor of your plugin.

In it, you can optionally add a `shortcut` property, as well as a `required` property. The Framework will return an error if a `required` Option is not included. You can also set a `default` property if your option is not required.

Additionally `type` for each option should be set. Supported types are `string`, `boolean` and `multiple` (multiple strings).

**Note:** At this time, the Serverless Framework does not use parameters.

```javascript
'use strict';

class MyPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      foo: {
        lifecycleEvents: ['functions'],
        options: {
          function: {
            usage: 'Specify the function you want to handle (e.g. "--function myFunction")',
            shortcut: 'f',
            required: true,
            type: 'string', // Possible options: "string", "boolean", "multiple"
          },
        },
      },
    };

    this.hooks = {
      'foo:functions': this.fooFunction.bind(this),
    };
  }

  fooFunction() {
    console.log('Foo function: ', this.options.function);
  }
}

module.exports = MyPlugin;
```

### Provider Specific Plugins

Plugins can be provider specific which means that they are bound to a provider.

**Note:** Binding a plugin to a provider is optional. Serverless will always consider your plugin if you don't specify a `provider`.

The provider definition should be added inside the plugins constructor:

```javascript
'use strict';

class ProviderX {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    // set the providers name here
    this.provider = this.serverless.getProvider('providerX');

    this.commands = {
      foo: {
        lifecycleEvents: ['functions'],
        options: {
          function: {
            usage: 'Specify the function you want to handle (e.g. "--function myFunction")',
            required: true,
            type: 'string', // Possible options: "string", "boolean", "multiple"
          },
        },
      },
    };

    this.hooks = {
      'foo:functions': this.fooFunction.bind(this),
    };
  }

  fooFunction() {
    console.log('Foo function: ', this.options.function);
  }
}

module.exports = ProviderX;
```

The Plugin's functionality will now only be executed when the Serverless Service's provider matches the provider name which is defined inside the plugins constructor.

### Serverless Instance

The `serverless` instance which enables access to global service config during runtime is passed in as the first parameter to the plugin constructor.

```javascript
'use strict';

class MyPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      log: {
        lifecycleEvents: ['serverless'],
      },
    };

    this.hooks = {
      'log:serverless': this.logServerless.bind(this),
    };
  }

  logServerless() {
    console.log('Serverless instance: ', this.serverless);
  }
}

module.exports = MyPlugin;
```

**Note:** [Variable references](./variables.md#reference-properties-in-serverlessyml) in the `serverless` instance are not resolved before a Plugin's constructor is called, so if you need these, make sure to wait to access those from your [hooks](#hooks).

### Command Naming

Command names need to be unique. If we load two commands and both want to specify the same command (e.g. we have an integrated command `deploy` and an external command also wants to use `deploy`) the Serverless CLI will print an error and exit. If you want to have your own `deploy` command you need to name it something different like `myCompanyDeploy` so they don't clash with existing plugins.

### Extending validation schema

If your plugin adds support for additional params in `serverless.yml` file, you should also add validation rules to the Framework's schema. Otherwise, the Framework may place validation errors to command output about your params.

The Framework uses JSON-schema validation backed by [AJV](https://github.com/ajv-validator/ajv). You can extend [initial schema](/lib/configSchema/index.js) inside your plugin constuctor by using `defineTopLevelProperty`, `defineCustomProperties`, `defineFunctionEvent`, `defineFunctionEventProperties`, `defineFunctionProperties` or `defineProvider` helpers.

Use the following map to know which helper suits best your needs.

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

#### `defineTopLevelProperty` helper

If your plugin requires additional top-level properties (like `provider`, `custom`, `service`...), you can use the `defineTopLevelProperty` helper to add their definition.

Considering the following example

```yml
// serverless.yml

service: my-service

yourPlugin:
  someProperty: foobar
```

you'll need to add validation rules as described below:

```javascript
class NewTopLevelPropertyPlugin {
  constructor(serverless) {
    this.serverless = serverless;

    // Create schema for your properties. For reference use https://github.com/ajv-validator/ajv
    const newCustomPropSchema = {
      type: 'object',
      properties: {
        someProperty: { type: 'string' },
      },
      required: ['someProperty'],
    };

    // Attach your piece of schema to main schema at top level
    serverless.configSchemaHandler.defineTopLevelProperty('yourPlugin', newCustomPropSchema);
  }
}
```

This way, if user sets `someProperty` by mistake to `false`, the Framework would display an error:

```
Serverless: Configuration error: yourPlugin.someProperty should be string
```

#### `defineCustomProperties` helper

Let's say your plugin depends on some properties defined in `custom` section of `serverless.yml` file.

```yml
// serverless.yml

custom:
  yourPlugin:
    someProperty: foobar
```

To add validation rules to these properties, your plugin would look like this:

```javascript
class NewEventPlugin {
  constructor(serverless) {
    this.serverless = serverless;

    // Create schema for your properties. For reference use https://github.com/ajv-validator/ajv
    const newCustomPropSchema = {
      type: 'object',
      properties: {
        someProperty: { type: 'string' },
      },
      required: ['someProperty'],
    };

    // Attach your piece of schema to main schema
    serverless.configSchemaHandler.defineCustomProperties(newCustomPropSchema);
  }
}
```

This way, if user sets `someProperty` by mistake to `false`, the Framework would display an error:

```
Serverless: Configuration error: custom.yourPlugin.someProperty should be string
```

#### `defineFunctionEvent` helper

Let's say your plugin adds support to a new `yourPluginEvent` function event. To use this event, a user would need to have `serverless.yml` file like this:

```yml
// serverless.yml

functions:
  someFunc:
    handler: handler.main
    events:
      - yourPluginEvent:
          someProp: hello
          anotherProp: 1
```

In this case your plugin should add validation rules inside your plugin constructor. Otherwise, the Framework would display an error message saying that your event is not supported:

```
Serverless: Configuration error: Unsupported function event 'yourPluginEvent'
```

To fix this error and more importantly to provide validation rules for your event, modify your plugin constructor with code like this:

```javascript
class NewEventPlugin {
  constructor(serverless) {
    this.serverless = serverless;

    // Create schema for your properties. For reference use https://github.com/ajv-validator/ajv
    serverless.configSchemaHandler.defineFunctionEvent('providerName', 'yourPluginEvent', {
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

This way, if user sets `anotherProp` by mistake to `some-string`, the Framework would display an error:

```
Serverless: Configuration error: functions.someFunc.events[0].yourPluginEvent.anotherProp should be number
```

#### `defineFunctionEventProperties` helper

When your plugin extend other plugin events definition for a specific provider, you can use the `defineFunctionEventProperties` to extend event definition with your custom properties.

For example, if your plugin adds support to a new `documentation` property on `http` event from `aws` provider, you should add validations rules inside your plugin constructor for this new property.

```javascript
class NewEventPlugin {
  constructor(serverless) {
    this.serverless = serverless;

    // Create schema for your properties. For reference use https://github.com/ajv-validator/ajv
    serverless.configSchemaHandler.defineFunctionEventProperties('aws', 'http', {
      properties: {
        documentation: { type: 'object' },
      },
      required: ['documentation'],
    });
  }
}
```

This way, if user sets `documentation` by mistake to `anyString`, the Framework would display an error:

```
Serverless: Configuration error: functions.someFunc.events[0].http.documentation should be object
```

#### `defineFunctionProperties` helper

Let's say your plugin adds support to a new `someProperty` function property. To use this property, a user would need to have `serverless.yml` file like this:

```yml
// serverless.yml

functions:
  someFunc:
    handler: handler.main
    someProperty: my-property-value
```

In this case your plugin should add validation rules inside your plugin constructor. Otherwise, the Framework would display an error message saying that your property is not supported:

```
ServerlessError: Configuration error:
at 'functions.someFunc': unrecognized property 'someProperty'
```

To fix this error and more importantly to provide validation rules for your property, modify your plugin constructor with code like this:

```javascript
class NewFunctionPropertiesPlugin {
  constructor(serverless) {
    this.serverless = serverless;

    // Create schema for your properties. For reference use https://github.com/ajv-validator/ajv
    serverless.configSchemaHandler.defineFunctionProperties('providerName', {
      properties: {
        someProperty: { type: 'string' },
        anotherProperty: { type: 'number' },
      },
      required: ['someProperty'],
    });
  }
}
```

This way, if user sets `anotherProperty` by mistake to `hello`, the Framework would display an error:

```
ServerlessError: Configuration error at 'functions.someFunc.anotherProperty': should be number
```

#### `defineProvider` helper

In case your plugin provides support for new provider, you would want to adjust validation schema. Here is example:

```javascript
class NewProviderPlugin {
  constructor(serverless) {
    this.serverless = serverless;

    // Create schema for your provider. For reference use https://github.com/ajv-validator/ajv
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

### Extending the `info` command

The `info` command which is used to display information about the deployment has detailed `lifecycleEvents` you can hook into to add and display custom information.

Here's an example overview of the info lifecycle events the AWS implementation exposes:

```
-> info:info
  -> aws:info:validate
  -> aws:info:gatherData
  -> aws:info:displayServiceInfo
  -> aws:info:displayApiKeys
  -> aws:info:displayEndpoints
  -> aws:info:displayFunctions
  -> aws:info:displayStackOutputs
```

Here you could e.g. hook into `after:aws:info:gatherData` and implement your own data collection and display it to the user.

**Note:** Every provider implements its own `info` plugin so you might want to take a look into the `lifecycleEvents` the provider `info` plugin exposes.
