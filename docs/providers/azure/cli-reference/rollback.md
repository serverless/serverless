<!--
title: Serverless Rollback CLI Command
menuText: rollback
menuOrder: 6
description: Rollback the Serverless service to a specific deployment
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/azure/cli-reference/rollback)

<!-- DOCS-SITE-LINK:END -->

# Azure - Rollback

Rollback the Serverless service to a specific deployment.

```bash
serverless rollback --timestamp timestamp
```

## Options

- `--resourceGroup` or `-g` - Specify the resource group name
- `--stage` or `-s` - Specify stage name
- `--region` or `-r` - Specify region name
- `--subscriptionId` or `-i` - Specify subscription ID
- `--timestamp` or `-t` The deployment you want to rollback to.
- `--verbose` or `-v` Shows any Stack Output.

## Provided lifecycle events

- `rollback:rollback`

## Examples

### Azure

At first you want to run `serverless deploy list` to show your existing deployments. This will provide you with a list of the ARM deployments from Azure. You can then use the timestamp of one of these deployments to set your infrastructure stack and app code to this specific deployment.

**Example:**

```
$ sls deploy list
Serverless: Listing deployments for resource group 'sls-myapp-rg':
Serverless:

Deployments
-----------
Name: sls-myapp-rg-deployment-t1562970576430
Timestamp: 1562970576430
Datetime: 2019-07-12T22:29:36.430Z

-----------
Name: sls-myapp-rg-deployment-t1562970293429
Timestamp: 1562970293429
Datetime: 2019-07-12T22:24:53.429Z
-----------
$ serverless rollback -t 1562970293429
```
