<!--
title: Installing Serverless Plugins
layout: Page
-->

# Adding custom plugins

Serverless is extendable through plugins. Plugins can provide new CLI commands or hook into existing plugins to extend their functionality.

Serverless uses the plugin infrastructure to run the core plugins. The plugin infrastructure is extendable by third party developers too. Using the same system, you can extend the framework to suit your custom needs.

Let's take a look into this now.

## Installing a plugin

First we need to install the corresponding plugin in the services root directory with the help of npm:

`npm install --save custom-serverless-plugin`.

Note: Custom plugins are added on a per service basis and are not applied globally

## Adding the plugin to a service

We need to tell Serverless that we want to use the plugin inside our service. We do this by adding the name of the plugin to the `plugins` section in the [`serverless.yml`](./serverless-yml.md) file.

```yml
# serviceXYZ serverless.yml file
plugins:
  - custom-serverless-plugin
```

Plugins might want to add extra information which should be accessible to Serverless. The `custom` section in the [`serverless.yml`](./serverless-yml.md) file is the place where you can add necessary
configurations for your plugins (the plugins author / documentation will tell you if you need to add anything there):

```yml
plugins:
  - custom-serverless-plugin

custom:
  customkey: customvalue
```

## Load order

Keep in mind that the order you define your plugins matters. When Serverless loads all the [core plugins](../lib/plugins) and then the custom plugins in the order you've defined them.

```yml
plugins:
  - plugin1
  - plugin2
```

In this case `plugin1` is loaded before `plugin2`.

[Next step > Removing your service](removing-a-service.md)
