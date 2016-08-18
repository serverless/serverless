# Deploy Function

**Note:** This plugin should be used with caution. It will directly upload the lambda function code and bypass
the steps of updating the CloudFormation stack or the zip-File in S3. Never use this plugin if you're working on a
production system. Use this plugin only for development to test how your code behaves on AWS.

This plugin deploys a single function through the AWS SDK.

## How it works

`Deploy Function` hooks into the [`deploy:function:deploy`](/lib/plugins/deploy) lifecycle.
It checks if the function exists in the service. After that it checks if the function was already deployed to AWS.
Next up it zips the function and uploads the new function code directly to the corresponding lambda function.

The `Deploy Function` plugin reuses the [Package plugin](/lib/plugins/package) under the hood to create the exact same
deployment artifact which is also created when you run `serverless deploy`.
