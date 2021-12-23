<!--
title: Serverless Rollback Function CLI Command
menuText: rollback function
menuOrder: 15
description: Rollback a function to a specific version
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/rollback-function)

<!-- DOCS-SITE-LINK:END -->

# AWS - Rollback Function

Rollback a function service to a specific version.

```bash
serverless rollback function --function <name> \
  --function-version <version>
```

**Note:** You can only rollback a function which was previously deployed through `serverless deploy`. Functions are not versioned when running `serverless deploy function`.

## Options

- `--function` or `-f` The name of the function which should be rolled back
- `--function-version` The version to which the function should be rolled back

## Examples

### AWS

At first you want to run `serverless deploy list functions` to see all the deployed functions of your service and their corresponding versions.
After picking a function and the version you can run the `serverless rollback function` command to rollback the function.

E.g. `serverless rollback function -f my-function --function-version 23` rolls back the function `my-function` to the version `23`.
