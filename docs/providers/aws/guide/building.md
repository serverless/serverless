<!--
title: Function Build Configuration
description: Configuration guide for building AWS Lambda functions with Serverless Framework using esbuild.
short_title: Build Config
keywords:
  [
    'Serverless Framework',
    'AWS Lambda',
    'Build Configuration',
    'esbuild',
    'Typescript',
  ]
-->

# AWS Lambda Build Configuration

## ESBuild

In Serverless Framework V.4, [esbuild](https://github.com/evanw/esbuild) is included within the Framework for bundling Javascript and Typescript AWS Lambda functions.

By default, if your AWS Lambda handler is using Typescript files directly, the Framework will build your code automagically upon deploy, without a plugin. No configuration is necessary by default.

**Note:** Even though you are writing ESM code, you should not set "type": "module" in your package.json file, as your code will be transpiled to CommonJS.

### Configuration

V.4 introduces a new `build` configuration block, which you can use to customize [esbuild](https://github.com/evanw/esbuild) settings.

```yaml
build:
  esbuild:
    # Enable or Disable bundling the function code and dependencies. (Default: true)
    bundle: true
    # Enable minifying function code. (Default: false)
    minify: false
    # NPM packages to not be bundled. Glob patterns are supported here.
    external:
      - '@aws-sdk/client-s3'
    # NPM packages to not be bundled, as well as not included in node_modules
    # in the zip file uploaded to Lambda. By default this will be set to aws-sdk
    # if the runtime is set to nodejs16.x or lower or set to @aws-sdk/* if set to nodejs18.x or higher.
    # Glob patterns are supported here.
    exclude:
      - '@aws-sdk/*'
      - '!@aws-sdk/client-bedrock-runtime'
    # The packages config, this can be set to override the behavior of external
    # If this is set then all dependencies will be treated as external and not bundled.
    packages: external
    # By default Framework will attempt to build and package all functions concurrently.
    # This property can bet set to a different number if you wish to limit the
    # concurrency of those operations.
    buildConcurrency: 3
    # Enable or configure sourcemaps, can be set to true or to an object with further configuration.
    sourcemap:
      # The sourcemap type to use, options are (inline, linked, or external)
      type: linked
      # Whether to set the NODE_OPTIONS on functions to enable sourcemaps on Lambda
      setNodeOptions: true
```

You may also configure esbuild with a JavaScript file, which is useful if you want to use esbuild plugins. Here's an example:

```yml
build:
  esbuild:
    # Path to the esbuild config file relative to the `serverless.yml` file
    configFile: ./esbuild.config.js
```

The JavaScript file must export a function that returns an esbuild configuration object. For your convenience, the **serverless** instance is passed to that function.

Here's an example of the `esbuild.config.js` file that uses the `esbuild-plugin-env` plugin:

**ESM:**

```js
/**
 * don't forget to set the `"type": "module"` property in `package.json`
 * and install the `esbuild-plugin-env` package
 */
import env from 'esbuild-plugin-env'

export default (serverless) => {
  return {
    external: ['@aws-sdk/client-s3'],
    plugins: [env()],
  }
}
```

**CommonJS:**

```js
const env = require('esbuild-plugin-env')

module.exports = (serverless) => {
  return {
    external: ['@aws-sdk/client-s3'],
    plugins: [env()],
  }
}
```

## Plugin Conflicts

Please note, plugins that build your code will not work unless you opt out of the default build experience. Some of the plugins affected are:

- `serverless-esbuild`
- `serverless-webpack`
- `serverless-plugin-typescript`

The new `build` configuration is customizable by plugins. We will be introducing more features around this soon.
