# awsCompileS3Events

This plugins compiles the function related S3 events in `serverless.yaml` to CloudFormation resources.

## How it works

`awsCompileS3Events` hooks into the [`deploy:compileEvents`](/docs/plugins/core/deploy.md) hook.

It loops over all functions which are defined in `serverless.yaml`.

Inside the function loop it loops over all the defined `S3` events in the `events` section and will create a S3 bucket
resource with the corresponding lambda notification configuration for the current function and the `s3:objectCreated:*`
events.

Furthermore a lambda permission for the current function is created which makes is possible to call the function
when the `s3:objectCreated:*` event is fired.

Those two resources are then merged into the `serverless.service.resources.aws.Resources` section.
