# Plugin System and Lifecycle Management

The Serverless Plugin System is at the core of our Framework. It supports any feature we build, it decides how fast we
can build them, how easily testable they are and how approachable they are for our users.

The main goals for our plugin system are:

* Separation of CLI configuration and Plugin logic
  * We want any plugin author to be able to easily create new commands within the serverless framework and extend
  existing commands. To achieve this we need to create a strong separation between CLI and Plugins that has clear
  interfaces between each other.
* Separation between logic of different plugins
  * Different plugins need to have an easy way to run independently and after each other without defining dependencies
  between each other.
* Greater Extensibility
  * Plugins need to be able to easily integrate into the lifecycle of a command independent of other Plugins that are
  running and can extend the functionality of Serverless easily.

## Concepts

### Plugin

A Plugin encapsulates commands and hooks in a shareable way. A Plugin is not forced to provide both, they can only
consist of a list of commands and lifecycle events or only of hooks.

### Command

A command represents a CLI command that can be called by a user, e.g. `serverless deploy` would be the deploy command.
A command has no logic, but simply defines the CLI configuration (e.g. command, subcommands, parameters) and the
lifecycle events for this particular command. Every command defines its own lifecycle events, so different commands
can have completely different lifecycles. The commands that come with Serverless (e.g. deploy, remove, ...) are
implemented in the exact same way as Commands built by other users. This means that lifecycle events we define for our
commands do not have any special meaning in Serverless or for other plugins. Every Command is free to have its own
lifecycle events, none of them are more special than others.

```javascript
'use strict';

class HelloWorld {
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
```

We automatically put the name of the command in front of lifecycle events when they are used for hooks.
So in a hook the following syntax needs to be used.

* ***CommandName:LifecycleEventName***

Which would be ***deploy:resources*** in a hook definition (which we will show in more detail below).

In addition to the lifecycle events defined here we will create 2 additional events for each:
* ***before:CommandName:LifecycleEventName***
* ***after:CommandName:LifecycleEventName***

Following the above example we’ll have these lifecycle events:

* ***before:deploy:resources***
* ***deploy:resources***
* ***after:deploy:resources***
* ***before:deploy:functions***
* ***deploy:functions***
* ***after:deploy:functions***

These names will be used as hooks to include plugin logic. This allows to set up lifecycle events with generic names,
but still make sure they are only executed for specific commands.

You can also nest commands, e.g. if you want to provide a command `serverless deploy single` you can simply nest
commands as defined in the following example. Those nested commands have their own lifecycle events and do not inherit
them from their parents.

```javascript
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
};
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

class MyPlugin {
  constructor(serverless) {
    this.serverless = serverless;

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

  deployFunction() {
    console.log('Serverless instance: ', this.serverless);
  }
}
```


### Options

Each (sub)command can have multiple options. Options are passed with a single dash (`-`) or a double dash (`--`) like
this: `serverless function deploy --function functionName` or `serverless resource deploy -r resourceName`.
The `options` object will be passed in as the second parameter to the constructor of your plugin.

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
```

## Registering plugins for hooks and commands

A user has to define the plugins they want to use in the root level of the serverless.yaml file:

```yaml
plugins:
  - custom_plugin_1
  - custom_plugin_2
```

We do not auto-detect plugins from installed dependencies so users do not run into any surprises and we cut down on the
startup time of the tool. Through JSON-REF users can share configuration for used plugins between serverless.yaml files
in one repository.

After the serverless.yaml configuration file is loaded the plugin system will load all the commands and plugins and
initialize the plugin system.

## Plugin Order

Plugins are registered in the order they are defined through our system and the serverless.yaml file. By default we will
load our plugins first, then we will load all plugins according to the order given in the serverless.yaml file.

This means our internal plugins will always be executed first for every lifecycle event before plugins by contributors.
If external plugins should be running before our plugins they should generally be able to hook into an earlier lifecycle
event.

## Command naming

Command names need to be unique. If we load two commands and both want to specify the same command (e.g. we have an
integrated command ***deploy*** and an external command also wants to use ***deploy***) the Serverless CLI will print
an error and exit. Commands need to be unique in the current Service context they are executed. So if you want to have
your own deploy command you need to name it something different like `mycompanydeploy` so they don't clash with existing
plugins.

## Provider Integration

Integrating different Infrastructure providers happens through the standard plugin setup. Infrastructure provider
plugins bind to specific Lifecycle Events and have appropriate hooks.

Once those hooks are called the Provider plugins check if deployment is configured to the specific provider for any of
the functions defined in serverless.yaml. The plugin will deploy all functions that have a deployment configured for
this particular provider. Depending on the provider deploying resources might be handled in a separate hook or the same
as function deployment.

Provider Event configuration can also be simply embedded in a plugin. The plugin can bind to a specific lifecycle event
and take our simplified event syntax and translate it into resources that should be deployed to the specific provider.
E.g. we defined the following event for a function:

```yaml
events:
  aws:
    S3: bucket_name
```

The SimpleS3Event plugin could now bind to the configureEvent Lifecycle Event, read this configuration and add
appropriate resources to the CloudFormation configuration. Then once the AWSResourceDeployment plugin converts the
CloudFormation syntax we’ve stored in the object into an actual CloudFormation stack file it will include all of the
configuration necessary to create the Bucket and set it up to trigger the Lambda function we’re also deploying.

One Provider Plugin can of course also implement various hooks, thus sharing code (e.g. AWS Resource Deployment and
AWS Function Deployment). Thus they can also share libraries and code for interaction with the specific provider.
