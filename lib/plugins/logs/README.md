# Logs

This plugin returns the CloudWatch logs of a lambda function. You can simply run `serverless logs -f hello` to test it out.

## Logs Options

The logs plugin only requires the function name you want to fetch the logs for. Other than that there are other options that you can add for extra control. Here's the full options list:

- `--function` or `-f` The function you want to fetch the logs for. **Required**
- `--stage` or `-s` The stage you want to view the function logs for. If not provided, the plugin will use the default stage listed in `serverless.yml`. If that doesn't exist either it'll just fetch the logs from the `dev` stage.
- `--region` or `-r` The region you want to view the function logs for. If not provided, the plugin will use the default region listed in `serverless.yml`. If that doesn't exist either it'll just fetch the logs from the `us-east-1` region.
- `--startTime` A specific unit in time to start fetching logs from. You can use standard date/time (ie: `2010-10-20` or `1469705761`), or simply a "since string" like `30m` (30 minutes), `2h` (2 hours), `3d` (3 days) and so on. We'll just fetch the logs that happened since then.
- `--filter` You can specify a filter string to filter the log output. This is useful if you want to to get the `error` logs for example.
- `--tail` or `-t` You can optionally tail the logs and keep listening for new logs in your terminal session by passing this option.
- `--interval` or `-i` If you choose to tail the output, you can control the interval at which the framework polls the logs with this option. The default is `1000`ms.

## Examples
```
serverless logs -f hello --startTime 5h
```
This will fetch the logs that happened in the past 5 hours.

```
serverless logs -f hello --startTime 1469694264
```
This will fetch the logs that happened starting at epoch `1469694264`.

```
serverless logs -f hello -t
```
This will keep the terminal session listening for logs and display them as they happen.

```
serverless logs -f hello --filter serverless
```
This will fetch only the logs that contain the string `serverless`