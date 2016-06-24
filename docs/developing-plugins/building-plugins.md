# Building plugins

The Serverless plugin System is at the core of the Serverless framework.

The main goals of the plugin system are:

- Separation of CLI configuration and plugin logic
  - We want any plugin author to be able to easily create new commands within the Serverless framework and extend
  existing commands. To achieve this we've created a strong separation between CLI and plugins that has clear
  interfaces between each other.
- Separation between logic of different plugins
  - Different plugins need to have an easy way to run independently and after each other without defining dependencies
  between each other.
- Greater Extensibility
  - Plugins need to be able to easily integrate into the lifecycle of a command independent of other Plugins that are
  running and can extend the functionality of Serverless easily.

## Concepts

### Plugin

A Plugin encapsulates commands (and corresponding lifecycles) and hooks in a shareable way. A Plugin is not forced
to provide both, they can only consist of a list of commands and lifecycle events or only of hooks.

### Command

A command represents a CLI command that can be called by a user, e.g. `serverless deploy` would be the `deploy` command.
A command has no logic, but simply defines the CLI configuration (e.g. command, subcommands, parameters) and the
lifecycle events for this particular command. Every command defines its own lifecycle events, so different commands
can have completely different lifecycles. The commands that come with Serverless (e.g. `deploy`, `remove`, ...) are
implemented in the exact same way as commands built by other users. This means that lifecycle events we define for our
commands do not have any special meaning in Serverless or for other plugins. Every Command is free to have its own
lifecycle events, none of them are more special than others.

```javascript
'use strict';

class MyPlugin {
  constructor() {
    this.commands = {
      deploy: {
        lifecycleEvents: [
          'resources',
          'functions'
        ]
      },
    };
  }
}

module.exports = MyPlugin;
```

We automatically put the name of the command in front of lifecycle events when they are used for hooks.
So in a hook the following syntax needs to be used.

***CommandName:LifecycleEventName***

Which would be ***deploy:resources*** in a hook definition (which we will show in more detail below).

In addition to the lifecycle events defined here we will create 2 additional events for each:
***before:CommandName:LifecycleEventName***
***after:CommandName:LifecycleEventName***

Following the above example we’ll have these lifecycle events for our `myPlugin` plugin:

- ***before:deploy:resources***
- ***deploy:resources***
- ***after:deploy:resources***
- ***before:deploy:functions***
- ***deploy:functions***
- ***after:deploy:functions***

These names will be used as hooks to include plugin logic. This allows to set up lifecycle events with generic names,
but still make sure they are only executed for specific commands.

You can also nest commands, e.g. if you want to provide a command `serverless deploy single` you can simply nest
commands as defined in the following example. Those nested commands have their own lifecycle events and do not inherit
them from their parents.

```javascript
'use strict';

class MyPlugin {
  constructor() {
    this.commands = {
    deploy: {
      lifecycleEvents: [
        'resources',
        'functions'
      ],
      commands: {
        single: {
          lifecycleEvents: [
            'resources',
            'functions'
          ],
        },
      },
    },
  }
}

module.exports = MyPlugin;
```

### Hook

Hooks allow to connect specific lifecycle events to functions in a Plugin. In the constructor of your class you define
a *hooks* variable that the Plugin System will use once a specific command is running. Any hook can bind to any
lifecycle event from any command, not just from commands that the same plugin provides.

This allows to extend any command with additional functionality.

```javascript
'use strict';

class Deploy {
  constructor() {
    this.commands = {
      deploy: {
        lifecycleEvents: [
          'resources',
          'functions'
        ]
      },
    };

    this.hooks = {
      'before:deploy:resources': this.beforeDeployResources,
      'deploy:resources': this.deployResources,
      'after:deploy:functions': this.afterDeployFunctions
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

### Serverless instance

The serverless instance which enables access to the whole Serverless setup during runtime is passed as the first
parameter of the plugin constructor.

```javascript
'use strict';

class MyPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      log: {
        lifecycleEvents: [
          'serverless'
        ],
      },
    };

    this.hooks = {
      'log:serverless': this.logServerless
    }
  }

  logServerless() {
    console.log('Serverless instance: ', this.serverless);
  }
}

module.exports = MyPlugin;
```

### Options

Each (sub)command can have multiple options. Options are passed with a single dash (`-`) or a double dash (`--`) like
this: `serverless function deploy --function functionName` or `serverless resource deploy -r resourceName`.
The `options` object will be passed in as the second parameter to the constructor of your plugin.

```javascript
'use strict';

class Deploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      deploy: {
        lifecycleEvents: [
          'functions'
        ],
        options: {
          function: {
            usage: 'Specify the function you want to deploy (e.g. "--function myFunction")'
          }
        }
      },
    };

    this.hooks = {
      'deploy:functions': this.deployFunction
    }
  }

  deployFunction() {
    console.log('Deploying function: ', this.options.function);
  }
}

module.exports = Deploy;
```

Options can be marked as required. This way the plugin manager will automatically raise an error if a required option
is not passed in via the CLI. You can mark options as required with the help of `required: true` inside the options
definition.

```javascript
'use strict';

class Deploy {
  constructor(serverless, options) {
    this.options = options;

    this.commands = {
      deploy: {
        lifecycleEvents: [
          'functions'
        ],
        options: {
          function: {
            usage: 'Specify the function you want to deploy (e.g. "--function myFunction")',
            required: true
          }
        }
      },
    };

    this.hooks = {
      'deploy:functions': this.deployFunction
    }
  }

  deployFunction() {
    console.log('Deploying function: ', this.options.function);
  }
}

module.exports = Deploy;
```

## Plugin registration process

A user has to define the plugins they want to use in the root level of the `serverless.yaml` file:

```yaml
plugins:
    - custom-plugin-1
    - custom-plugin-2
```

We do not auto-detect plugins from installed dependencies so users do not run into any surprises and we cut down on the
startup time of the tool. Through JSON-REF users can share configuration for used plugins between `serverless.yaml` files
in one repository.

After the `serverless.yaml` configuration file is loaded the plugin system will load all the commands and plugins and
initialize the plugin system.

## Plugin options

Sometimes your plugin needs to setup some custom options. The `serverless.yaml` file provides the `custom` section where
you can add options your plugin can use.

```yaml
plugins:
    - my-greet-plugin

custom:
    greeting: hello
```

## Plugin Order

Plugins are registered in the order they are defined through our system and the `serverless.yaml` file. By default we will
load the [core plugins](../using-plugins/core-plugins.md) first, then we will load all plugins according to the order
given in the `serverless.yaml` file.

This means the Serverless core plugins will always be executed first for every lifecycle event before 3rd party plugins.
If external plugins should be running before our plugins they should generally be able to hook into an earlier lifecycle
event.

## Command naming

Command names need to be unique. If we load two commands and both want to specify the same command (e.g. we have an
integrated command ***deploy*** and an external command also wants to use ***deploy***) the Serverless CLI will print
an error and exit. Commands need to be unique in the current Service context they are executed. So if you want to have
your own `deploy` command you need to name it something different like `myCompanyDeploy` so they don't clash with existing
plugins.
