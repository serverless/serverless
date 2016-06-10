# Invoke

```
serverless invoke --function functionName --stage dev --region us-east-1
```

Invokes your deployed function and outputs the results.

## Options
- `--function` The name of the function in your service that you want to invoke. **Required**.
- `--stage` The stage in your service you want to invoke your function in. **Required**.
- `--region` The region in your stage that you want to invoke your function in. **Required**.
- `--path` The path to a json file holding input data to be passed to the invoked function. This path is relative to the root directory of the service.
- `--type` The type of invocation. Either `RequestResponse`, `Event` or `DryRun`. Default is `RequestResponse`.
- `--log` If set to `true` and invocation type is `RequestResponse`, it will output logging data of the invocation. Default is `false`.

## Provided lifecycle events
- `invoke:invoke`

## Examples

```
serverless invoke --function functionName --stage dev --region us-east-1
```

This example will invoke your deployed function named `functionName` in region `us-east-1` in stage `dev`. This will output the result of the invocation in your terminal.

```
serverless invoke --function functionName --stage dev --region us-east-1 --log
```

Just like the first example, but will also outputs logging information about your invocation.

```
serverless invoke --function functionName --stage dev --region us-east-1 --path lib/data.json
```

This example will pass the json data in the `lib/data.json` file (relative to the root of the service) while invoking the specified/deployed function.
