# awsDeploy

This plugin (re)deploys the service to AWS.

## How it works

`awsDeploy` starts by hooking into the [`deploy:initializeResources`](/docs/plugins/core/deploy.md) lifecycle.
It fetches the basic CloudFormation template from `lib/templates` and replaces the necessary names and definitions
with the one it gets from the `serverless.yaml` file.
Furthermore the `resources` section of the `serverless.yaml` file is parsed and merged into the core CloudFormation
template (this makes sure that custom resources the user has defined inside the `serverless.yaml` file are added correctly).

The parsed resources are attached to the `Service` class. You can access them like this:
```
serverless.service.resources.aws.Resources
```

**Note:**
Other plugins (e.g. the `awsCompileFunctions` plugin) use this `Resources` property to add the compiled resources by
merging them in.

Next up it hooks into the [`deploy:createProviderStacks`](/docs/plugins/core/deploy.md) lifecycle and deploys the
previously created CloudFormation template to AWS.

At the end it hooks into [`deploy:deploy`](/docs/plugins/core/deploy.md) lifecycle to zip the lambda function and
uploads it to the core S3 bucket (which is defined in the core CloudFormation template). Furthermore it updates the
stack with all the Resources which are defined in `serverless.service.resources.aws.Resources`.

The stack status is checked every 5 seconds with the help of the CloudFormation API. It will return a success message if
the stack status is `CREATE_COMPLETE` or `UPDATE_COMPLETE` (depends if you deploy your service for the first time or
redeploy it after making some changes).
