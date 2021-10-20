<!--
title: Serverless Framework - Plugins
menuText: Plugins
menuOrder: 14
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

## Installing plugins

Plugins are installed per service. They are not applied globally.

To install a plugin, run the following command in a service directory:

```
serverless plugin install -n custom-serverless-plugin
```

This command will install the plugin via NPM and register it in `serverless.yml`.

You can also install the plugin manually via NPM:

```
npm install --save custom-serverless-plugin
```

and then register it in `serverless.yml` in the `plugins` section:

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

Some plugins require extra configuration. The `custom` section in `serverless.yml` is where you can add extra configuration for plugins (the plugin's documentation will tell you if you need to add anything there):

```yml
plugins:
  - custom-serverless-plugin

custom:
  customkey: customvalue
```

## Service local plugin

If you are working on a plugin or have a plugin that is just designed for one project, it can be loaded from the local `.serverless_plugins` folder at the root of your service. Local plugins can be added in the `plugins` array in `serverless.yml`.

```yml
plugins:
  - custom-serverless-plugin
```

The local plugin folder can be customized:

```yml
plugins:
  localPath: './custom_serverless_plugins'
  modules:
    - custom-serverless-plugin
```

The `custom-serverless-plugin` will be loaded from the `custom_serverless_plugins` directory at the root of your service. If the `localPath` is not provided or empty, the `.serverless_plugins` directory will be used.

The plugin will be loaded based on being named `custom-serverless-plugin.js` or `custom-serverless-plugin/index.js` in the root of `localPath` folder (`.serverless_plugins` by default).

If you want to load a plugin from a specific directory without affecting other plugins, you can also specify a path relative to the root of your service:

```yaml
plugins:
  # This plugin will be loaded from the `.serverless_plugins/` or `node_modules/` directories
  - custom-serverless-plugin
  # This plugin will be loaded from the `sub/directory/` directory
  - ./sub/directory/another-custom-plugin
```

## Load Order

Keep in mind that the order you define your plugins matters. Serverless loads all the core plugins, and then the custom plugins in the order you've defined them.

```yml
# serverless.yml

plugins:
  - plugin1
  - plugin2
```

In this case `plugin1` is loaded before `plugin2`.
