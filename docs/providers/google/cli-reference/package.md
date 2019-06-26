<!--
title: Serverless Framework Commands - Google Cloud Functions - Package
menuText: package
menuOrder: 3
description: Package your service according to a specified provider
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/google/cli-reference/package)

<!-- DOCS-SITE-LINK:END -->

# Google - package

The `sls package` command packages your entire infrastructure into the `.serverless` directory by default and make it ready for deployment. You can specify another packaging directory by passing the `--package` option.

```bash
serverless package
```

## Examples

### Packaging

```bash
serverless package
```

This example packages your service. The generated package would be the default `.serverless` directory inside your service.
