<!--
title: Serverless Framework Commands - AWS Lambda - Package
menuText: package
menuOrder: 4
description: Package your service according to a specified provider
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/package)

<!-- DOCS-SITE-LINK:END -->

# AWS - package

The `sls package` command packages your entire infrastructure into the `.serverless` directory by default and make it ready for deployment. You can specify another packaging directory by passing the `--package` option.

```bash
serverless package
```

## Options

- `--stage` or `-s` The stage in your service that you want to deploy to.
- `--region` or `-r` The region in that stage that you want to deploy to.
- `--package` or `-p` path to the custom packaging directory you want.

## Examples

### Packaging without stage and region options

```bash
serverless package
```

This example packages your service while using the default stage (`dev`) and default region (`us-east-1`). The generated package would be the default `.serverless` directory inside your service.

### Packaging with stage and region options

```bash
serverless package --stage production --region eu-central-1
```

This example packages your service while using the `production` stage in the region
`eu-central-1`. The generated package would be the default `.serverless` directory inside your service.

### Packaging to a custom path

```bash
serverless package --package /path/to/package/directory
```

This example packages your service using the default stage and region and output the generated package into the custom path you provided at `/path/to/package/directory`.
