<!--
title: Serverless Framework Commands - AWS Lambda - Deploy List
menuText: Deploy List
menuOrder: 6
description: List your previous CloudFormation deployments
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/deploy-list)
<!-- DOCS-SITE-LINK:END -->

# AWS - Deploy List

The `sls deploy list` command will list your recent deployments available in your S3 deployment bucket. It will use stage and region from the provider config and show the timestamp of each deployment so you can roll back if necessary using `sls rollback`.

## Options

- `--stage` or `-s` The stage in your service that you want to deploy to.
- `--region` or `-r` The region in that stage that you want to deploy to.

## Artifacts

After the `serverless deploy` command runs all created deployment artifacts are placed in the `.serverless` folder of the service.

## Examples

### List existing deploys

```bash
serverless deploy list --stage dev --region us-east-1
```
