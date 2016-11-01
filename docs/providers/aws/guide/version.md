<!--
title: Serverless Framework - AWS Lambda Guide - Pinning the Serverless framework version
menuText: Version pinning
menuOrder: 14
description: How to pin a service to a specific Serverless versions.
layout: Doc
-->

# Why?

The Serverless framework is usually installed globally via `npm install -g serverless`. This way you have the Serverless CLI available to your disposal on you system. Installing tools globally has the downside that the version can't be pinned inside package.json. This can lead to issues if you upgrade Serverless, but your colleagues or CI system doesn't. Think about you using a new feature in your serverless.yaml which is available only in the latest version, but your CI system not being aware of this feature and therefor can't leverage it.

## Pinning a Version

In order to tackle this issue you optionally can define a `frameworkVersion` property in your serverless.yaml. Whenever you run a Serverless command from the CLI a check is happening if your current Serverless version is matching the `frameworkVersion` range. The CLI leverages [Semantic Versioning](http://semver.org/). Therefor you can pin it down to an exact version or provide a larger range. In general we recommend to pin to an exact version to ensure everybody in your team has the exact same setup.

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
