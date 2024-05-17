<!--
title: Function Build Configuration
menuText: Function Build Configuration
layout: Doc
-->

# Function Build Configuration

## ESBuild

Framework has built in support for esbuild for being used to bundle and deploy javascript and typescript. By default if your handler is pointed to a typescript file then it will use esbuild to prepare your function code for deployment. No configuration is necessary by default.

### Configuration

```yaml
build:
  esbuild:
    # Enable or Disable bundling the function code and dependencies. (Default: true)
    bundle: true
    # Enable minifying function code. (Default: false)
    minify: false
    # NPM packages to not be bundled
    external:
      - @aws-sdk/client-s3
    # NPM packages to not be bundled, as well as not included in node_modules
    # in the zip file uploaded to Lambda. By default this will be set to aws-sdk
    # if the runtime is set to nodejs16.x or lower or set to @aws-sdk/* if set to nodejs18.x or higher.
    exclude:
      - @aws-sdk/*
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
