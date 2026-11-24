<!--
title: AWS Lambda Layers
description: Publish AWS Lambda layers from serverless.yml, share them with other accounts, and attach layers from this or another service to your functions.
short_title: Layers
keywords:
  [
    'Serverless Framework',
    'AWS Lambda layers',
    'serverless.yml layers',
    'Lambda layer version',
    'shared dependencies',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/layers)

<!-- DOCS-SITE-LINK:END -->

# AWS Lambda Layers

An [AWS Lambda layer](https://docs.aws.amazon.com/lambda/latest/dg/chapter-layers.html) is a zip of code or dependencies that functions load alongside their own package. Each entry under the top-level `layers` key in `serverless.yml` publishes a layer version on deploy; functions in the service, or in other services and accounts, can then use it. To attach a layer that already exists, you only need the function's `layers` list (see [Use layers in functions](#use-layers-in-functions)).

This service publishes the contents of `layer-dir` as a layer and attaches it to a function:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

layers:
  shared:
    path: layer-dir

functions:
  hello:
    handler: handler.hello
    layers:
      - !Ref SharedLambdaLayer
```

For a Node.js layer, put the modules under `layer-dir/nodejs/node_modules`; for Python, under `layer-dir/python`. Lambda extracts the layer to `/opt`, and each runtime looks in its own [layer path](https://docs.aws.amazon.com/lambda/latest/dg/packaging-layers.html).

## Configuration

Each key under `layers` names a layer. Its settings:

```yaml
layers:
  hello:
    path: layer-dir # required unless package.artifact is set; relative to the service directory
    name: ${sls:stage}-hello # default: the layer key
    description: Shared helpers # up to 256 characters
    compatibleRuntimes: # up to 15 runtimes
      - python3.14
    compatibleArchitectures: # up to 2
      - x86_64
      - arm64
    licenseInfo: MIT # up to 512 characters
    allowedAccounts: # accounts that may use the layer
      - '123456789012'
    retain: false # default false
```

| Key                       | Type    | Default                            | Allowed values                                                                                                             |
| ------------------------- | ------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `path`                    | string  | Required unless `package.artifact` | A directory, relative to the service directory                                                                             |
| `name`                    | string  | The layer key                      | 1 to 140 letters, numbers, `-` or `_`, or a layer ARN prefix                                                               |
| `description`             | string  | None                               | Up to 256 characters                                                                                                       |
| `compatibleRuntimes`      | list    | None                               | Up to 15 Lambda runtime identifiers, or `custom` for [customer-managed runtimes](./functions.md#customer-managed-runtimes) |
| `compatibleArchitectures` | list    | None                               | `x86_64`, `arm64`                                                                                                          |
| `licenseInfo`             | string  | None                               | Up to 512 characters                                                                                                       |
| `allowedAccounts`         | list    | None                               | 12-digit account IDs, `arn:aws:iam::<account>:root`, or `'*'`                                                              |
| `retain`                  | boolean | `false`                            | Keep earlier layer versions when a new one is published                                                                    |
| `package`                 | object  | None                               | `patterns`, `artifact` (and the deprecated `include`, `exclude`)                                                           |

A service can define any number of layers. Lambda lets one function use at most five.

### Layer versions and `retain`

Lambda layer versions can't be changed. When a deploy changes a layer's content or settings, CloudFormation publishes a new version and, by default, deletes the previous one. With `retain: true`, previous versions stay published, so functions in other services that still reference them keep working. When nothing about a layer changed since the last deploy, the deploy reuses the zip it uploaded before instead of uploading it again.

### Package a layer

A layer is zipped from its `path`. The service's `package.patterns` apply to it, followed by the layer's own `package.patterns`; all of them match paths relative to the layer's `path`, not to the service directory:

```yaml
package:
  patterns:
    - '!**/*.tar.gz' # applies to functions and layers

layers:
  shared:
    path: layer-dir
    package:
      patterns:
        - '!tests/**' # applies to this layer only
```

The service's [development dependency exclusion](./packaging.md#development-dependencies) doesn't apply to a layer, unless the layer's `path` is the service directory itself: the layer ships its `path` as it is on disk. Function and service zips leave out the layers' `path` directories.

To publish a zip you built yourself, set `package.artifact` instead of `path`:

```yaml
layers:
  shared:
    package:
      artifact: build/shared-layer.zip
```

## Share a layer with other accounts

`allowedAccounts` gives other AWS accounts permission to use the layer version (`lambda:GetLayerVersion`). It takes 12-digit account IDs, account root ARNs, or `'*'`:

```yaml
layers:
  shared:
    path: layer-dir
    allowedAccounts:
      - '123456789012' # or arn:aws:iam::123456789012:root
```

**Warning:** `'*'` makes the layer version usable by every AWS account. Use it only for layers you mean to publish.

## Use layers in functions

A function's `layers` lists the layer version ARNs it uses:

```yaml
functions:
  hello:
    handler: handler.hello
    layers:
      - arn:aws:lambda:us-east-1:123456789012:layer:shared-utils:3
```

`provider.layers` sets layers for every function. A function's own `layers` replaces `provider.layers` for that function; the two lists are not merged.

```yaml
provider:
  name: aws
  runtime: python3.14
  layers:
    - arn:aws:lambda:us-east-1:123456789012:layer:mylayer1:1
    - arn:aws:lambda:us-east-1:123456789012:layer:mylayer2:3

functions:
  hello1:
    handler: handler.hello1 # both provider layers
  hello2:
    handler: handler.hello2
    layers: # only this layer
      - arn:aws:lambda:us-east-1:123456789012:layer:mylayer3:1
```

### Reference a layer from the same service

To use a layer defined in the same service, reference its CloudFormation logical ID with `Ref`, which resolves to the current layer version ARN. The logical ID is the layer key with its first letter uppercased, `-` replaced with `Dash` and `_` with `Underscore`, followed by `LambdaLayer`: `shared` becomes `SharedLambdaLayer`, `my-layer` becomes `MyDashlayerLambdaLayer`.

```yaml
layers:
  test:
    path: layer

functions:
  hello:
    handler: handler.hello
    layers:
      - !Ref TestLambdaLayer
```

A layer with `retain: true` gets a content hash appended to its logical ID (`TestLambdaLayer<hash>`), so every version is a separate resource; such a layer can't be referenced with a static `Ref`.

### Reference a layer from another service

The Framework adds a stack output `<LogicalId>QualifiedArn` (for example `TestLambdaLayerQualifiedArn`) that holds the current layer version ARN. Other services read it with the [`cf` variable](../../../guides/variables/aws/cf-stack.md):

```yaml
functions:
  hello:
    handler: handler.hello
    layers:
      - ${cf:my-service-dev.TestLambdaLayerQualifiedArn}
```

## Related pages

- [AWS Lambda functions](./functions.md#lambda-layers): the function `layers` setting.
- [Packaging](./packaging.md): patterns and artifacts.
- [Creating layers](https://docs.aws.amazon.com/lambda/latest/dg/creating-deleting-layers.html) in the AWS Lambda Developer Guide.
