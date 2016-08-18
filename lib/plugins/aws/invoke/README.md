# Invoke

This plugin invokes a lambda function.

## How it works

`Invoke` hooks into the [`invoke:invoke`](/lib/plugins/invoke) lifecycle. It will run the `invoke` command
which is provided by the AWS SDK on the function the user passes in as a parameter.

The output of the function is fetched and will be prompted on the console.

