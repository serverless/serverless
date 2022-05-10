<!--
title: Serverless Framework - Plugins - Custom variables
menuText: Custom variables
menuOrder: 4
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

class MyPlugin {
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
class MyPlugin {
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

## Resolving variables, configuration values and options

It is possible to retrieve other variables, configuration values and CLI options in the variable resolver:

```javascript
class MyPlugin {
  constructor() {
    this.configurationVariablesSources = {
      foo: {
        async resolve({ resolveVariable, options }) {
          // `options` is CLI options
          // `resolveVariable` resolves other variables (for example here: `${sls:stage}`)
          const stage = await resolveVariable('sls:stage');
          // To retrieve a configuration value from serverless.yml, use the `self:xxx` variable source, for example:
          // await resolveVariable('self:provider.region')

          return {
            value: `The stage is ${stage}`,
          };
        },
      },
    };
  }
}
```
