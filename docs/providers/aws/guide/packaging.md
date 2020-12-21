<!--
title: Serverless Framework Guide - AWS Lambda Guide - Packaging
menuText: Packaging
menuOrder: 12
description: How the Serverless Framework packages your AWS Lambda functions and other available options
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/packaging)

<!-- DOCS-SITE-LINK:END -->

# AWS - Packaging

## Package CLI Command

Using the Serverless CLI tool, you can package your project without deploying it to AWS. This is best used with CI / CD workflows to ensure consistent deployable artifacts.

Running the following command will build and save all of the deployment artifacts in the service's .serverless directory:

```bash
serverless package
```

However, you can also use the --package option to add a destination path and Serverless will store your deployment artifacts there (./my-artifacts in the following case):

```bash
serverless package --package my-artifacts
```

## Package Configuration

Sometimes you might like to have more control over your function artifacts and how they are packaged.

You can use the `package` and `exclude` configuration for more control over the packaging process.

### Exclude / include

Exclude and include allows you to define globs that will be excluded / included from the resulting artifact. If you wish to
include files you can use a glob pattern prefixed with `!` such as `!re-include-me/**` in `exclude` or the dedicated `include` config.
Serverless will run the glob patterns in order.

At first it will apply the globs defined in `exclude`. After that it'll add all the globs from `include`. This way you can always re-include
previously excluded files and directories.

By default, serverless will exclude the following patterns:

- .git/\*\*
- .gitignore
- .DS_Store
- npm-debug.log
- .serverless/\*\*
- .serverless_plugins/\*\*

and the serverless configuration file being used (i.e. `serverless.yml`). In addition, if `useDotenv` is set, all files satisfying pattern `.env*` will be excluded as well.

### Examples

Exclude all node_modules but then re-include a specific modules (in this case node-fetch) using `exclude` exclusively

```yml
package:
  exclude:
    - node_modules/**
    - '!node_modules/node-fetch/**'
```

Exclude all files but `handler.js` using `exclude` and `include`

```yml
package:
  exclude:
    - src/**
  include:
    - src/function/handler.js
```

**Note:** Don't forget to use the correct glob syntax if you want to exclude directories

```
exclude:
  - tmp/**
  - .git/**
```

### Artifact

For complete control over the packaging process you can specify your own artifact zip file.
Serverless won't zip your service if this is configured and therefore `exclude` and `include` will be ignored. Either you use artifact or include / exclude.

The artifact option is especially useful in case your development environment allows you to generate a deployable artifact like Maven does for Java.

#### Service package

```yml
service: my-service
package:
  artifact: path/to/my-artifact.zip
```

#### Individual function packages

You can also use this to package functions individually:

```yml
service: my-service

package:
  individually: true

functions:
  hello:
    handler: com.serverless.Handler
  package:
    artifact: hello.jar
  events:
    - http:
        path: hello
        method: get
```

#### Artifacts hosted on S3

Artifacts can also be fetched from a remote S3 bucket. In this case you just need to provide the S3 object URL as the artifact value. This applies to both, service-wide and function-level artifact setups.

##### Service package

```yml
service: my-service

package:
  artifact: https://s3.amazonaws.com/some-bucket/service-artifact.zip
```

##### Individual function packages

```yml
service: my-service

package:
  individually: true

functions:
  hello:
    handler: com.serverless.Handler
  package:
    artifact: https://s3.amazonaws.com/some-bucket/function-artifact.zip
```

### Packaging functions separately

If you want even more controls over your functions for deployment you can configure them to be packaged independently. This allows you more control for optimizing your deployment. To enable individual packaging set `individually` to true in the service or function wide packaging settings.

Then for every function you can use the same `exclude`, `include` or `artifact` config options as you can service wide. The `exclude` and `include` option will be merged with the service wide options to create one `exclude` and `include` config per function during packaging.

```yml
service: my-service
package:
  individually: true
  exclude:
    - excluded-by-default.json
functions:
  hello:
    handler: handler.hello
    package:
      # We're including this file so it will be in the final package of this function only
      include:
        - excluded-by-default.json
  world:
    handler: handler.hello
    package:
      exclude:
        - some-file.js
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
