# Logs

This plugin returns the CloudWatch logs of a lambda function. You can simply run `serverless logs -f hello` to test it out.

## How it works

`Logs` hooks into the [`logs:logs`](/lib/plugins/logs) lifecycle. It will fetch the CloudWatch log group of the provided function and outputs all the log stream events in the terminal.

## Logs Options

The logs plugin only require the function name you want to fetch the logs for. Other than that there are other options that you can add for extra control:

* **stage:** (shortcut: `-s`) - The stage you want to view the function logs for. If not provided, the plugin will use the default stage listed in `serverless.yaml`. If that doesn't exist either it'll just fetch the logs from the `dev` stage.
* **region:** (shortcut: `-r`) - The region you want to view the function logs for. If not provided, the plugin will use the default region listed in `serverless.yaml`. If that doesn't exist either it'll just fetch the logs from the `us-east-1` region.
* **duration:** (shortcut: `-d`) - With this option, you can set a certain duration to fetch the logs. Logs before this time will not be displayed. The default is `30m` (30 minutes). So by default only the logs that happened within 30 minutes will be displayed. You can provide friendly duration strings like `2h` (2 hours), `3d` (3 days) and so on. 
* **startTime:** (shortcut: `-m`) - Other than duration, you can also set a specific **Unix epoch time** at which you want to fetch the logs
* **filter:** (shortcut: `-l`) - You can specify a filter string to filter the log output. This is useful if you want to to get the `error` logs for example.
* **tail:** (shortcut: `-t`) - You can optionally tail the logs and keep listening for new logs in your terminal session by passing he `--tail` option.
* **pollInterval:** (shortcut: `-i`) - If you choose to tail the output, you can control the interval at which the framework polls the logs with this option. The default is `1000`ms.

## Examples

```
serverless logs -f hello -d 5h
```
This will fetch the logs that happened in the past 5 hours.


```
serverless logs -f hello -m 1469694264
```
This will fetch the logs that happened starting at epoch `1469694264`.

```
serverless logs -f hello -t
```
This will keep the terminal session listening for logs and display them as they happen.

```
serverless logs -f hello -l serverless
```
This will fetch only the logs that contain the string `serverless`