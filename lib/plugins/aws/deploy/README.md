# Deploy

This plugin (re)deploys the service to AWS.

## How it works

`Deploy` starts by hooking into the [`deploy:setupProviderConfiguration`](/lib/plugins/deploy) lifecycle.
It fetches the basic CloudFormation template from `lib/templates` and replaces the necessary names and definitions
with the one it gets from the `serverless.yml` file.

Next up it deploys the CloudFormation template (which only includes the Serverless S3 deployment bucket) to AWS.

In the end it hooks into [`deploy:deploy`](/lib/plugins/deploy) lifecycle to update the previously created stack.

The `resources` section of the `serverless.yml` file is parsed and merged into the CloudFormation template.
This makes sure that custom resources the user has defined inside the `serverless.yml` file are added correctly.

**Note:** Empty, but defined `Resources` or `Outputs` sections are set to an empty object before being merged.

Next up it removes old service .zip files in the services S3 bucket. After that it uploads the services
.zip file (which is available via `serverless.service.package.artifact`) to the S3 bucket (which is defined in the core
CloudFormation template). Furthermore it updates the stack with all the Resources which are defined in
`serverless.service.resources.Resources` (this also includes the custom provider resources).

The stack status is checked every 5 seconds with the help of the CloudFormation API. It will return a success message if
the stack status is `CREATE_COMPLETE` or `UPDATE_COMPLETE` (depends if you deploy your service for the first time or
redeploy it after making some changes).
