# Adding custom plugins

Serverless is extendable through plugins. Plugins can provide e.g. new CLI commands or hook into existing plugins
to extend their functionality.

Serverless provides [core plugins](core-plugins.md) out of the box but what if you want to add a 3rd party plugin?

Let's take a look into this now.

## Installing a plugin

Custom plugins are added on a per service base.

At first we need to install the corresponding plugin in the services root directory with the help of npm:

`npm install --save custom-serverless-plugin`.

## Adding the plugin to the service

Next up we need to tell Serverless that we want to use the plugin inside our service. We do this by adding the name
of the plugin to the `plugins` section in the `serverless.yaml` file:

```yaml
plugins:
    - custom-serverless-plugin
```

Plugins might want to add extra information which should be accessible to Serverless. The `custom` section in the
[`serverless.yaml`](../understanding-serverless/serverless-yaml.md) file is the place where you can add necessary
configurations for your plugins (the plugins author / documentation will tell you if you need to add anything there):

```yaml
plugins:
    - custom-serverless-plugin

custom:
    customkey: customvalue
```

## Load order

Keep in mind that the order in which you define the plugins matter! At first Serverless loads all the [core
plugins](core-plugins.md) and then the custom plugins in the order you've defined them.

```yaml
plugins:
    - plugin1
    - plugin2
```

In this case `plugin1` is loaded before `plugin2`.
