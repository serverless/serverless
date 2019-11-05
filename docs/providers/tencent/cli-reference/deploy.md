<!--
title: Serverless Framework Commands - Tencent-SCF - Deploy
menuText: deploy
menuOrder: 5
description: Deploy your service to the specified provider
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/cli-reference/deploy/)

<!-- DOCS-SITE-LINK:END -->

# Tencent-SCF - deploy

The `sls deploy` command deploys your entire service. Run this command when you have made infrastructure changes (i.e., you edited `serverless.yml`). Use `serverless deploy function -f myFunction` when you have made code changes and you want to quickly upload your updated code to Tencent SCF (Serverless Cloud Functions) or just change function configuration.

```bash
serverless deploy
```

## Options

- `--config` or `-c` Name of your configuration file, if other than `serverless.yml|.yaml|.js|.json`.
- `--stage` or `-s` The stage in your service that you want to deploy to.
- `--region` or `-r` The region in that stage that you want to deploy to.
- `--package` or `-p` path to a pre-packaged directory and skip packaging step.
- `--force` Forces a deployment to take place, the triggers will be forced updated too.
- `--function` or `-f` Invoke `deploy function` (see above). Convenience shortcut - cannot be used with `--package`.

## Artifacts

After the `serverless deploy` command runs, the framework runs `serverless package` in the background first then deploys the generated package. During the deployment, the framework creates a COS(Cloud Object Storage) bucket to storage the package by default.

## Examples

### Deployment without stage and region options

```bash
serverless deploy
```

This is the simplest deployment usage possible. With this command Serverless will deploy your service to the defined
provider in the default stage (`dev`) to the default region (`ap-guangzhou`).

### Deployment with stage and region options

```bash
serverless deploy --stage pro --region ap-guangzhou
```

With this example we've defined that we want our service to be deployed to the `pro` stage in the region
`ap-guangzhou`.

### Deployment from a pre-packaged directory

```bash
serverless deploy --package /path/package/directory
```

With this example, the packaging step will be skipped and the framework will start deploying the package from the `/path/package/directory` directory.
