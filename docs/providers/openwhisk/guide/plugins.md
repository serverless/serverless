<!--
title: Serverless Framework - Apache OpenWhisk Guide - Plugins
menuText: Plugins
menuOrder: 13
description: How to install and create Plugins to extend or overwrite the functionality of the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/openwhisk/guide/plugins)

<!-- DOCS-SITE-LINK:END -->

# OpenWhisk - Plugins

A Plugin is custom Javascript code that creates new or extends existing commands within the Serverless Framework. The Serverless Framework is merely a group of Plugins that are provided in the core. If you or your organization have a specific workflow, install a pre-written Plugin or write a plugin to customize the Framework to your needs. External Plugins are written exactly the same way as the core Plugins.

- [How to create serverless plugins - Part 1](https://serverless.com/blog/writing-serverless-plugins/)
- [How to create serverless plugins - Part 2](https://serverless.com/blog/writing-serverless-plugins-2/)

## Installing Plugins

External Plugins are added on a per service basis and are not applied globally. Make sure you are in your Service's root directory, then install the corresponding Plugin with the help of NPM:

```
npm install --save custom-serverless-plugin
```

We need to tell Serverless that we want to use the plugin inside our service. We do this by adding the name of the Plugin to the `plugins` section in the `serverless.yml` file.

```yml
# serverless.yml file

plugins:
  - custom-serverless-plugin
```

The `plugins` section supports two formats:

Array object:

```yml
plugins:
  - plugin1
  - plugin2
```

Enhanced plugins object:

```yml
plugins:
  localPath: './custom_serverless_plugins'
  modules:
    - plugin1
    - plugin2
```

Plugins might want to add extra information which should be accessible to Serverless. The `custom` section in the `serverless.yml` file is the place where you can add necessary configurations for your plugins (the plugins author / documentation will tell you if you need to add anything there):

```yml
plugins:
  - custom-serverless-plugin

custom:
  customkey: customvalue
```

## Service local plugin

If you are working on a plugin or have a plugin that is just designed for one project they can be loaded from the local folder. Local plugins can be added in the `plugins` array in `serverless.yml`.

By default local plugins can be added to the `.serverless_plugins` directory at the root of your service, and in the `plugins` array in `serverless.yml`.

```yml
plugins:
  - custom-serverless-plugin
```

Local plugins folder can be changed by enhancing `plugins` object:

```yml
plugins:
  localPath: './custom_serverless_plugins'
  modules:
    - custom-serverless-plugin
```

The `custom-serverless-plugin` will be loaded from the `custom_serverless_plugins` directory at the root of your service. If the `localPath` is not provided or empty `.serverless_plugins` directory will be taken as the `localPath`.

The plugin will be loaded based on being named `custom-serverless-plugin.js` or `custom-serverless-plugin\index.js` in the root of `localPath` folder (`.serverless_plugins` by default).

### Load Order

Keep in mind that the order you define your plugins matters. When Serverless loads all the core plugins and then the custom plugins in the order you've defined them.

```yml
# serverless.yml

plugins:
  - plugin1
  - plugin2
```

In this case `plugin1` is loaded before `plugin2`.

## Writing Plugins

### Concepts

#### Plugin

Code which defines _Commands_, any _Events_ within a _Command_, and any _Hooks_ assigned to an _Lifecycle Event_.

- Command // CLI configuration, commands, subcommands, options
  - LifecycleEvent(s) // Events that happen sequentially when the command is run
    - Hook(s) // Code that runs when a Lifecycle Event happens during a Command

#### Command

A CLI _Command_ that can be called by a user, e.g. `serverless deploy`. A Command has no logic, but simply defines the CLI configuration (e.g. command, subcommands, parameters) and the _Lifecycle Events_ for the command. Every command defines its own lifecycle events.

```javascript
'use strict';

class MyPlugin {
  constructor() {
    this.commands = {
      deploy: {
        lifecycleEvents: ['resources', 'functions'],
      },
    };
  }
}

module.exports = MyPlugin;
```

#### Lifecycle Events

Events that fire sequentially during a Command. The above example list two Events. However, for each Event, and additional `before` and `after` event is created. Therefore, six Events exist in the above example:

- `before:deploy:resources`
- `deploy:resources`
- `after:deploy:resources`
- `before:deploy:functions`
- `deploy:functions`
- `after:deploy:functions`

The name of the command in front of lifecycle events when they are used for Hooks.

#### Hooks

A Hook binds code to any lifecycle event from any command.

```javascript
'use strict';

class Deploy {
  constructor() {
    this.commands = {
      deploy: {
        lifecycleEvents: ['resources', 'functions'],
      },
    };

    this.hooks = {
      'before:deploy:resources': this.beforeDeployResources,
      'deploy:resources': this.deployResources,
      'after:deploy:functions': this.afterDeployFunctions,
    };
  }

  beforeDeployResources() {
    console.log('Before Deploy Resources');
  }

  deployResources() {
    console.log('Deploy Resources');
  }

  afterDeployFunctions() {
    console.log('After Deploy Functions');
  }
}

module.exports = Deploy;
```

### Nesting Commands

You can also nest commands, e.g. if you want to provide a command `serverless deploy single`. Those nested commands have their own lifecycle events and do not inherit them from their parents.

```javascript
'use strict';

class MyPlugin {
  constructor() {
    this.commands = {
      deploy: {
        lifecycleEvents: ['resources', 'functions'],
        commands: {
          function: {
            lifecycleEvents: ['package', 'deploy'],
          },
        },
      },
    };
  }
}

module.exports = MyPlugin;
```

### Defining Options

Each (sub)command can have multiple Options.

Options are passed in with a double dash (`--`) like this: `serverless function deploy --function functionName`.

Option Shortcuts are passed in with a single dash (`-`) like this: `serverless function deploy -f functionName`.

The `options` object will be passed in as the second parameter to the constructor of your plugin.

In it, you can optionally add a `shortcut` property, as well as a `required` property. The Framework will return an error if a `required` Option is not included.

**Note:** At this time, the Serverless Framework does not use parameters.

```javascript
'use strict';

class Deploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      deploy: {
        lifecycleEvents: ['functions'],
        options: {
          function: {
            usage: 'Specify the function you want to deploy (e.g. "--function myFunction")',
            shortcut: 'f',
            required: true,
          },
        },
      },
    };

    this.hooks = {
      'deploy:functions': this.deployFunction.bind(this),
    };
  }

  deployFunction() {
    console.log('Deploying function: ', this.options.function);
  }
}

module.exports = Deploy;
```

### Provider Specific Plugins

Plugins can be provider specific which means that they are bound to a provider.

**Note:** Binding a plugin to a provider is optional. Serverless will always consider your plugin if you don't specify a `provider`.

The provider definition should be added inside the plugins constructor:

```javascript
'use strict';

class ProviderDeploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    // set the providers name here
    this.provider = this.serverless.getProvider('providerName');

    this.commands = {
      deploy: {
        lifecycleEvents: ['functions'],
        options: {
          function: {
            usage: 'Specify the function you want to deploy (e.g. "--function myFunction")',
            required: true,
          },
        },
      },
    };

    this.hooks = {
      'deploy:functions': this.deployFunction.bind(this),
    };
  }

  deployFunction() {
    console.log('Deploying function: ', this.options.function);
  }
}

module.exports = ProviderDeploy;
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
