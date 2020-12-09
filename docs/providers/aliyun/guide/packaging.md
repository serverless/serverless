<!--
title: Serverless Framework Guide - Alibaba Cloud Function Compute Guide - Packaging
menuText: Packaging
menuOrder: 9
description: How the Serverless Framework packages your Alibaba Cloud Function Compute functions and other available options
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aliyun/guide/packaging)

<!-- DOCS-SITE-LINK:END -->

# Alibaba Cloud - Packaging

## Package CLI Command

Using the Serverless CLI tool, you can package your project without deploying it to the Alibaba Cloud. This is best used with CI / CD workflows to ensure consistent deployable artifacts.

Running the following command will build and save all of the deployment artifacts in the service's `.serverless` directory:

```bash
serverless package
```

## Package Configuration

Sometimes you might like to have more control over your function artifacts and how they are packaged.

You can use the `package` and `patterns` configuration for more control over the packaging process.

### Patterns

Patterns allows you to define globs that will be excluded / included from the resulting artifact. If you wish to exclude files you can use a glob pattern prefixed with `!` such as `!exclude-me/**`.
Serverless will run the glob patterns in order so you can always re-include previously excluded files and directories.

### Examples

Exclude all node_modules but then re-include a specific modules (in this case node-fetch) using `exclude` exclusively

```yml
package:
  patterns:
    - '!node_modules/**'
    - 'node_modules/node-fetch/**'
```

Exclude all files but `handler.js`

```yml
package:
  patterns:
    - '!src/**'
    - src/function/handler.js
```

**Note:** Don't forget to use the correct glob syntax if you want to exclude directories

```yml
package:
  patterns:
    - '!tmp/**'
    - '!.git/**'
```

### Artifact

For complete control over the packaging process you can specify your own artifact zip file.
Serverless won't zip your service if this is configured and therefore `patterns` will be ignored. Either you use artifact or patterns.

The artifact option is especially useful in case your development environment allows you to generate a deployable artifact like Maven does for Java.

### Example

```yml
service: my-service
package:
  patterns:
    - '!tmp/**'
    - '!.git/**'
    - some-file
  artifact: path/to/my-artifact.zip
```

### Packaging functions separately

If you want even more controls over your functions for deployment you can configure them to be packaged independently. This allows you more control for optimizing your deployment. To enable individual packaging set `individually` to true in the service or function wide packaging settings.

Then for every function you can use the same `patterns` or `artifact` config options as you can service wide. The `patterns` option will be merged with the service wide options to create one `patterns` config per function during packaging.

```yml
service: my-service
package:
  individually: true
  patterns:
    - '!excluded-by-default.json'
functions:
  hello:
    handler: handler.hello
    package:
      # We're including this file so it will be in the final package of this function only
      patterns:
        - excluded-by-default.json
  world:
    handler: handler.hello
    package:
      patterns:
        - '!some-file.js'
```

You can also select which functions to be packaged separately, and have the rest use the service package by setting the `individually` flag at the function level:

```yml
service: my-service
functions:
  hello:
    handler: handler.hello
  world:
    handler: handler.hello
    package:
      individually: true
```

### Development dependencies

Serverless will auto-detect and exclude development dependencies based on the runtime your service is using.

This ensures that only the production relevant packages and modules are included in your zip file. Doing this drastically reduces the overall size of the deployment package which will be uploaded to the cloud provider.

You can opt-out of automatic dev dependency exclusion by setting the `excludeDevDependencies` package config to `false`:

```yml
package:
  excludeDevDependencies: false
```
