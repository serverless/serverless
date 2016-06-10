# awsInvoke

This plugin invokes a lambda function.

## How it works

`awsInvoke` hooks into the [`invoke:invoke`](/docs/plugins/core/invoke.md) lifecycle. It will run the `invoke` command
which is provided by the AWS SDK on the function the user passes in as a parameter.

The output of the function is fetched and will be prompted on the console.
