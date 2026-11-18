<!--
title: JavaScript and TypeScript Variables
description: Compute serverless.yml values with code by referencing exports and resolver functions in JavaScript (ESM or CommonJS) and TypeScript files.
short_title: JavaScript and TypeScript
keywords: ['Serverless Framework', 'JavaScript', 'TypeScript', 'ESM', 'file variable', 'dynamic values', 'Variables']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/javascript)

<!-- DOCS-SITE-LINK:END -->

# JavaScript and TypeScript Variables

A `${file(...)}` variable that points to a JavaScript or TypeScript file inserts a value computed by your code into `serverless.yml`. Use it when a value can't be written as plain YAML: it depends on other variables, on logic, or on a call to an API or an SDK while the Framework resolves the configuration.

The following ES module exports a schedule:

```javascript
// schedule.mjs
export const rate = 'rate(10 minutes)'
```

The following `serverless.yml` uses the `rate` export as the schedule of a function:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

functions:
  hello:
    handler: handler.hello
    events:
      - schedule: ${file(./schedule.mjs):rate}
```

## Syntax of JavaScript and TypeScript file variables

```text
${file(FILE_PATH)}
${file(FILE_PATH):EXPORT_OR_PROPERTY}
${file(FILE_PATH):EXPORT_OR_PROPERTY, DEFAULT_VALUE}
```

- `FILE_PATH` (required): the module's path, relative to the directory that contains `serverless.yml`, or an absolute path. The extension selects the loader:
  - `.mjs`: an ES module.
  - `.cjs`: a CommonJS module.
  - `.js`: an ES module or a CommonJS module, as Node.js decides from the nearest `package.json` (`"type": "module"` for ES modules); see [Determining module system](https://nodejs.org/api/packages.html#determining-module-system) in the Node.js docs.
  - `.ts`, `.mts`, `.cts`: a TypeScript module, compiled on the fly with tsx, with no build step; see [TypeScript modules](#typescript-modules).
- `EXPORT_OR_PROPERTY` (optional): which value to take from the module; [How the Framework reads a module](#how-the-framework-reads-a-module) describes how it's matched. Keys are separated by dots (`settings.memorySize`).
- `DEFAULT_VALUE` (optional): the value to use when the module returns `null` or `undefined`; see [Missing values and errors](#missing-values-and-errors).

To write ES module syntax (`export`, `import`), use `.mjs`, or `.js` in a package with `"type": "module"`.

## How the Framework reads a module

What a JavaScript or TypeScript file variable returns depends on the module's exports:

| The module exports                  | `${file(./config.mjs)}` returns         | `${file(./config.mjs):name}` returns                                       |
| ----------------------------------- | --------------------------------------- | -------------------------------------------------------------------------- |
| A default export that is a function | The function's return value             | The `name` property of the function's return value                         |
| A default export that is a value    | The default export                      | The named export `name`, or else the `name` property of the default export |
| Named exports only                  | `undefined`, treated as a missing value | The named export `name`; if it's a function, its return value              |

- In a CommonJS module, `module.exports` is the default export, and its properties are also read as named exports.
- When the default export is a function, the Framework always calls it and ignores the named exports. To read a named export, don't export a default function from the same module.
- A function can be `async`. The Framework awaits it and uses the resolved value.
- A function's return value can be any JSON-compatible value: a string, number, boolean, list or object.
- The Framework calls the function once for each distinct variable that references it in a run. `${file(./config.mjs):a}` and `${file(./config.mjs):b}` call a default-exported function twice, and two identical references share one call.

## Resolver function arguments

The Framework calls an exported function with one object that has these properties:

- `options`: the CLI options passed to the command, as an object, for example `{ stage: 'prod', region: 'eu-west-1' }` for `serverless deploy --stage prod --region eu-west-1`. Options that weren't passed are absent.
- `resolveVariable(variableString)`: an async function that resolves a variable written without the `${}`, for example `'sls:stage'`, `'file(./config.json):dbHost'` or `"opt:region, self:provider.region, 'us-east-1'"`. A variable with no value and no default rejects with an error; to get `null` instead, end the string with `, null` (`'env:API_URL, null'`).
- `resolveConfigurationProperty(path)`: an async function that takes a property path as an array of keys (`['provider', 'region']`) and returns that property of `serverless.yml`, with its variables resolved. It rejects when the property references the variable being resolved (a circular reference).

Both functions are async, so a function that calls them must be `async` and `await` them.

## Compute a value from other variables

The following ES module builds stage-specific settings. It reads the stage and region with `resolveVariable` and the service name with `resolveConfigurationProperty`:

```javascript
// config.mjs
export default async ({ resolveVariable, resolveConfigurationProperty }) => {
  const stage = await resolveVariable('sls:stage')
  const region = await resolveVariable(
    "opt:region, self:provider.region, 'us-east-1'",
  )
  const service = await resolveConfigurationProperty(['service'])

  return {
    tableName: `${service}-${stage}-users`,
    memorySize: stage === 'prod' ? 1024 : 512,
    apiUrl: `https://api.${region}.example.com`,
  }
}
```

The following `serverless.yml` uses the whole result as `custom`, and single properties of it for the function settings:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x
  region: eu-west-1

custom: ${file(./config.mjs)}

functions:
  hello:
    handler: handler.hello
    memorySize: ${file(./config.mjs):memorySize}
    environment:
      TABLE_NAME: ${file(./config.mjs):tableName}
```

With `serverless deploy --stage prod`, `TABLE_NAME` is `my-service-prod-users` and `memorySize` is `1024`.

## TypeScript modules

The Framework compiles `.ts`, `.mts` and `.cts` files with tsx when it loads them, the same way it loads `serverless.ts`, and reads their exports with the rules in [How the Framework reads a module](#how-the-framework-reads-a-module).

The following TypeScript module exports a function that returns settings:

```typescript
// settings.ts
type Settings = { apiUrl: string }

export const getSettings = async (): Promise<Settings> => {
  return { apiUrl: 'https://api.example.com' }
}
```

The following `serverless.yml` puts the function's return value under `custom.settings`:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

custom:
  settings: ${file(./settings.ts):getSettings}

functions:
  hello:
    handler: handler.hello
    environment:
      API_URL: ${self:custom.settings.apiUrl}
```

The property path selects only the named export: `${file(./settings.ts):getSettings.apiUrl}` looks for an `apiUrl` property on the function itself and finds none. To read one property of the result, reference the result through `${self:...}` as in the example, or export the function as the default export (`${file(./settings.ts):apiUrl}`).

The same variables work in a `serverless.ts` configuration file, written as strings: `custom: { settings: '${file(./settings.ts):getSettings}' }`.

## CommonJS modules

A `.cjs` file, or a `.js` file in a package without `"type": "module"`, is loaded as CommonJS, and `module.exports` is its default export:

```javascript
// schedule.cjs
module.exports = {
  rate: 'rate(10 minutes)',
}
```

`${file(./schedule.cjs):rate}` returns `rate(10 minutes)`, and `module.exports = async ({ resolveVariable }) => { ... }` works as a default-exported function.

## Missing values and errors

A module value of `null` or `undefined`, including a property path that matches nothing, is a missing value. The variable then uses its default value:

```yaml
custom:
  apiUrl: ${file(./config.mjs):apiUrl, 'https://api.example.com'}
```

Without a default, a missing value stops the command:

```text
Cannot resolve '${file(./config.mjs):apiUrl}' variable at 'custom.apiUrl'. No value is available for this variable, and no default value was provided. Please check your variable definitions or provide a default value.
```

A module that can't be loaded, or a function that throws or rejects, stops the command even when the variable has a default, with the error and its stack trace:

```text
Cannot load or execute JS module "/path/to/config.mjs": Error: ...
```

For TypeScript modules the message starts with `Cannot load TS module` or `Cannot execute TS module`. To fall back to a default when your code can't produce a value, catch the error in the function and return `null`.

## Related variable sources

- [Variables](./README.md): how variables work, and the list of all variable sources.
- [File variables](./file.md): read values from YAML, JSON and text files.
- [Environment variables](./env-vars.md): read values from the shell and `.env` files.
- [Self-reference variables](./self.md): reuse values from the same `serverless.yml`.
