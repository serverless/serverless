<!--
title: Serverless Framework - Creating plugins
menuText: Creating plugins
menuOrder: 1
description: How to create custom plugins to customize the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/plugins/creating-plugins)

<!-- DOCS-SITE-LINK:END -->

# Creating custom plugins

Creating a custom plugin lets you:

- [Hook into _lifecycle events_ to add new logic](#lifecycle-events)
- [Define new CLI commands](custom-commands.md)
- [Define new variable sources](custom-variables.md)
- [Extend the `serverless.yml` syntax](custom-configuration.md)
- [Write extra information to the CLI output](cli-output.md)
- Add support for new cloud providers

## Creating a plugin

The simplest way to create a Serverless Framework plugin is to write a JavaScript file:

```javascript
'use strict';

class MyPlugin {
  constructor() {
    // The plugin is loaded
  }
}

module.exports = MyPlugin;
```

The plugin can then be loaded in `serverless.yml` via a local path:

```yaml
# serverless.yml
service: app

functions:
  # ...

plugins:
  - ./my-plugin.js
```

### Distributing a plugin via NPM

Plugins can also be published to NPM and later installed in separate projects.

To correctly configure the plugin's NPM package, set the `main` property to point to your plugin file in `package.json`:

```json
{
  "main": "my-plugin.js"
}
```

It is also a good practice to add `serverless` to the `peerDependencies` section. That ensures that your plugin runs only with the Serverless Framework versions it supports.

```json
{
  ...
  "peerDependencies": {
    "serverless": "^2.60 || 3"
  }
}
```

Once the plugin is published on NPM, follow the documentation on [Installing plugins](README.md) to use the custom plugin.

## Lifecycle events

Lifecycle events are events that fire sequentially during a CLI command.

Additionally, for each event an additional `before` and `after` event is created. For example:

- `before:package:package`
- `package:package`
- `after:package:package`
- `before:deploy:deploy`
- `deploy:deploy`
- `after:deploy:deploy`

The `initialize` event is shared across all CLI commands and runs when the CLI starts.

Plugins can "hook" into existing lifecycle events to add behavior to commands like `deploy`, `package`, etc. via the `hooks` helper:

```javascript
'use strict';

class MyPlugin {
  constructor() {
    this.hooks = {
      'initialize': () => this.init(),
      'before:deploy:deploy': () => this.beforeDeploy(),
      'after:deploy:deploy': () => this.afterDeploy(),
    };
  }

  init() {
    // Initialization
  }

  beforeDeploy() {
    // Before deploy
  }

  afterDeploy() {
    // After deploy
  }
}

module.exports = MyPlugin;
```

Plugins can also create their own commands (with their own lifecycle events): read the [Custom commands documentation](custom-commands.md).

## Serverless instance

The `serverless` parameter provides access to the service configuration at runtime:

```javascript
'use strict';

class MyPlugin {
  constructor(serverless) {
    this.serverless = serverless;
    this.hooks = {
      initialize: () => this.init(),
    };
  }

  init() {
    console.log('Serverless instance: ', this.serverless);

    // `serverless.service` contains the (resolved) serverless.yml config
    const service = this.serverless.service;
    console.log('Provider name: ', service.provider.name);
    console.log('Functions: ', service.functions);
  }
}

module.exports = MyPlugin;
```

**Note:** configuration values are only resolved _after_ plugins are initialized. Do not try to read configuration in the plugin constructor, as variables aren't resolved yet. Read configuration in lifecycle events only.

## CLI options

The `options` parameter provides access to the CLI options provided to the command:

```javascript
class MyPlugin {
  constructor(serverless, options) {
    // Log if a --verbose option was passed:
    console.log(options.verbose);
  }
}
```

## Provider-specific plugins

Plugins can be provider specific, which means that run only with a specific provider.

**Note:** Binding a plugin to a provider is optional. Serverless will always consider your plugin if you don't specify a `provider`.

To bind to a specific provider, retrieve it and set the `this.provider` property in the plugin constructor:

```javascript
class MyPlugin {
  constructor(serverless, options) {
    // bind to a specific provider
    this.provider = serverless.getProvider('providerX');

    // ...
  }
}
```

The plugin will now only be executed when the service's provider matches the given provider.
