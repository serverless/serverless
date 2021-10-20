<!--
title: Serverless Framework - Plugins - Custom variables
menuText: Plugins
menuOrder: 14
description: How to create custom Serverless Framework variables via a plugin
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/plugins/custom-variables)

<!-- DOCS-SITE-LINK:END -->

# Custom variables

Plugins can register custom variables sources, for example `${foo:some-variable}`.

Custom sources can be registered via `configurationVariablesSources` as an object with a `resolve` function:

```javascript
'use strict';

class SomePlugin {
  constructor() {
    this.configurationVariablesSources = {
      foo: {
        async resolve({ address }) {
          // `address` contains the name of the variable to resolve:
          // In `${foo:some-variable}`, address will contain `some-variable`.

          // Resolver is expected to return an object with the value in the `value` property:
          return {
            //
            value: `Resolving variable ${address}`,
          };
        },
      },
    };
  }
}

module.exports = MyPlugin;
```

The variable source defined above (registered via a plugin) can be used as follows:

```yaml
service: test
# ...

custom:
  value1: ${foo:bar}

plugins:
  - ./my-plugin
```

The configuration will be resolved into the following:

```yaml
service: test
# ...

custom:
  value1: Resolving variable bar

plugins:
  - ./my-plugin
```

## Variable parameters

Variable sources can support advanced use cases via parameters:

```yaml
service: test
# ...

custom:
  value1: ${foo(one, two):bar}
```

Parameters can be retrieved in the `params` argument:

```javascript
class SomePlugin {
  constructor() {
    this.configurationVariablesSources = {
      foo: {
        async resolve({ address, params }) {
          return {
            // In the example below, ${foo(one, two):bar} will
            // resolve to "one,two"
            value: (params || []).join(','),
          };
        },
      },
    };
  }
}
```

## Resolving configuration values and options

It is possible to retrieve other configuration values and CLI options in the variable resolver:

```javascript
class SomePlugin {
  constructor() {
    this.configurationVariablesSources = {
      foo: {
        async resolve({ resolveConfigurationProperty, options }) {
          // `options` is CLI options
          // `resolveConfigurationProperty` allows to access other configuration properties,
          // and guarantees to return a fully resolved form (even if property is configured with variables)
          const stage =
            options.stage || (await resolveConfigurationProperty(['provider', 'stage'])) || 'dev';

          return {
            value: `Resolving with ${stage}`,
          };
        },
      },
    };
  }
}
```
