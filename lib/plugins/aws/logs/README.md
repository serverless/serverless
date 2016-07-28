# Logs

This plugin returns the CloudWatch logs of a lambda function. You can simply run `serverless logs -f hello` to test it out.

## How it works

`Logs` hooks into the [`logs:logs`](/lib/plugins/logs) lifecycle. It will fetch the CloudWatch log group of the provided function and outputs all the log stream events in the terminal.