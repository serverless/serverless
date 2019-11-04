
# Tencent-scf - Invoke

Invokes deployed function. It allows to send event data to the function, read logs and display other important information of the function invocation.

```bash
serverless invoke --function functionName
```

## Options

- `--function` or `-f` The name of the function in your service that you want to invoke. **Required**.
- `--stage` or `-s` The stage in your service you want to invoke your function in.
- `--region` or `-r` The region in your stage that you want to invoke your function in.

## Examples

```bash
serverless invoke --function functionName --stage dev --region ap-guangzhou
```

This example will invoke your deployed function named `functionName` in region `ap-guangzhou` in stage `dev`. This will
output the result of the invocation in your terminal.
