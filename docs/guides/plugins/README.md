<!--
title: Serverless Framework - Plugins
menuText: Plugins
menuOrder: 4
description: How to install plugins to customize the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/plugins)

<!-- DOCS-SITE-LINK:END -->

# Plugins

A plugin is custom JavaScript code that extends the Serverless Framework with new features.

If you or your organization have a specific workflow, install a pre-written plugin or write one to customize the Framework to your needs.

Since the Serverless Framework is a group of "core" plugins, custom plugins are written exactly the same way as core plugins. Learn more about [creating a custom plugin](creating-plugins.md).

Explore existing plugins in the [Serverless Framework Plugins repository](https://www.serverless.com/plugins).

## Installing plugins

Plugins are installed per service. They are not applied globally.

To install a plugin, run the following command in a service directory:

```
serverless plugin install -n custom-serverless-plugin
```

This command will install the plugin via NPM and register it in `serverless.yml`.

You can also install the plugin manually via NPM:

```
npm install --save-dev custom-serverless-plugin
```

and then register it in `serverless.yml` in the `plugins` section:

```yml
# serverless.yml file

plugins:
  - custom-serverless-plugin
```

Some plugins require extra configuration. The `custom` section in `serverless.yml` is where you can add extra configuration for plugins (the plugin's documentation will tell you if you need to add anything there):

```yml
plugins:
  - custom-serverless-plugin

custom:
  customkey: customvalue
```

Note for plugin authors: read [Extending the configuration](custom-configuration.md) to learn how to enhance `serverless.yml` with configuration validation.

## Service local plugin

If you are working on a plugin, or have a plugin that is just designed for one project, it can be loaded from local files:

```yml
plugins:
  - ./local-directory/custom-serverless-plugin
```

The path must start with `./` and is relative to the root of your service.

## Load Order

Keep in mind that the order you define your plugins matters. Serverless loads all the core plugins, and then the custom plugins in the order you've defined them.

```yml
# serverless.yml

plugins:
  - plugin1
  - plugin2
```

In this case `plugin1` is loaded before `plugin2`.
