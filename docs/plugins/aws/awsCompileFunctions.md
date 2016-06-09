# awsCompileFunctions

This plugins compiles the functions in `serverless.yaml` to CloudFormation resources.

## How it works

`awsCompileFunctions` hooks into the `compileFunctions` hook of the [deploy](/docs/plugins/core/deploy.md) plugin.

It loops over all functions which are defined in `serverless.yaml`.

Inside the function loop it creates corresponding lambda function resources which will be merged into the
`serverless.service.resources.aws.Resources` section.
