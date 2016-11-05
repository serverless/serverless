<!--
title: Serverless Framework - AWS Lambda Guide - Pinning the Serverless framework version
menuText: Version pinning
menuOrder: 14
description: How to pin a service to certain Serverless versions.
layout: Doc
-->

# Why?

The Serverless framework is usually installed globally via `npm install -g serverless`. This way you have the Serverless CLI available for all your services. Installing tools globally has the downside that the version can't be pinned inside package.json. This can lead to issues if you upgrade Serverless, but your colleagues or CI system don't. You can now use a new feature in your serverless.yaml which is available only in the latest version without worrying that your CI system will deploy with an old version of Serverless.

## Pinning a Version

To configure version pinning define a `frameworkVersion` property in your serverless.yaml. Whenever you run a Serverless command from the CLI it checks if your current Serverless version is matching the `frameworkVersion` range. The CLI uses [Semantic Versioning](http://semver.org/) so you can pin it to an exact version or provide a range. In general we recommend to pin to an exact version to ensure everybody in your team has the exact same setup and no unexpected problems happen.

## Examples

### Exact Version

```yml
# serverless.yml

frameworkVersion: "=1.0.3"

service: users

provider:
  name: aws
  runtime: nodejs4.3
  memorySize: 512

…
```

### Version Range

```yml
# serverless.yml

frameworkVersion: ">=1.0.0 <2.0.0"

service: users

provider:
  name: aws
  runtime: nodejs4.3
  memorySize: 512

…
```
