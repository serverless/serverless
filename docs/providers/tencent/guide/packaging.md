<!--
title: Tencent Cloud - Serverless Cloud Function (SCF) Guide - Packaging | Serverless Framework
menuText: Packaging
menuOrder: 9
description: How the Serverless Framework packages your Serverless Cloud Function (Tencent Cloud) and other available options
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/guide/packaging/)

<!-- DOCS-SITE-LINK:END -->

# Tencent-SCF - Packaging

## Package CLI Command

Using the Serverless CLI tool, you can package your project without deploying it to Tencent Cloud. This is best used with CI / CD workflows to ensure consistent deployable artifacts.

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

and the serverless configuration file being used (i.e. `serverless.yml`)

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
  patterns:
    - '!src/**'
    - src/function/handler.js
```

**Note:** Don't forget to use the correct glob syntax if you want to exclude directories

```
exclude:
  - tmp/**
  - .git/**
```
