<!--
title: Serverless Framework - Variables - Javascript Properties
description: How to reference Javascript properties
short_title: Serverless Variables - Javascript Properties
keywords: ['Serverless Framework', 'Javascript', 'Variables']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/javascript)

<!-- DOCS-SITE-LINK:END -->

# Reference Dynamic Values from Javascript

You can reference JavaScript modules to add dynamic data into your variables.

### Exporting an object

To rely on exported `someModule` property in `myFile.js` you'd use the following code `${file(./myFile.js):someModule}`)

e.g.

```js
// scheduleConfig.js
module.exports.rate = 'rate(10 minutes)'
```

```yml
# serverless.yml
service: new-service
provider: aws

functions:
  hello:
    handler: handler.hello
    events:
      - schedule: ${file(./scheduleConfig.js):rate} # Reference a specific module
```

### Exporting a function

_Note: the method described below works by default in Serverless v3 and later versions, but it requires the `variablesResolutionMode: 20210326` option in v2._

A variable resolver function receives an object with the following properties:

- `options` - An object referencing resolved CLI params as passed to the command
- `resolveVariable(variableString)` - Async function which resolves provided variable string. String should be passed without wrapping (`${` and `}`) braces. Example valid values:
  - `file(./config.js):SOME_VALUE`
  - `env:SOME_ENV_VAR, null` (end with `, null`, if missing value at the variable source should be resolved with `null`, and not with a thrown error)
- `resolveConfigurationProperty([key1, key2, ...keyN])` - Async function which resolves specific service configuration property. It returns a fully resolved value of configuration property. If circular reference is detected resolution will be rejected.

The resolver function can either be _sync_ or _async_. Note that both `resolveConfigurationProperty` and `resolveVariable` functions are async: if these functions are called, the resolver function must be async.

Here is an example of a resolver function:

```js
// config.js
module.exports = async ({ options, resolveVariable }) => {
  // We can resolve other variables via `resolveVariable`
  const stage = await resolveVariable('sls:stage');
  const region = await resolveVariable('opt:region, self:provider.region, "us-east-1"');
  ...

  // Resolver may return any JSON value (null, boolean, string, number, array or plain object)
  return {
    prop1: 'someValue',
    prop2: 'someOther value'
  }
}
```

It is possible to reference the resolver's returned value:

```yml
# serverless.yml
service: new-service

custom: ${file(./config.js)}
```

Or a single property (if the resolver returned an object):

```yml
# serverless.yml
service: new-service

custom:
  foo: ${file(./config.js):prop1}
```
