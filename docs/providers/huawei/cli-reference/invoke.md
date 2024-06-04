# Huawei Cloud - Invoke

Invokes a deployed function. You can send event data, read logs and display other important information of the function invocation.

```bash
serverless invoke --function functionName
```

## Options

- `--function` or `-f` The name of the function in your service that you want to invoke. **Required**.
- `--data` or `-d` Data you want to pass into the function.
- `--path` or `-p` The path to a json file with input data to be passed to the invoked function. This path is relative to the root directory of the service.

## Examples

### Simple function invocation

```bash
serverless invoke --function functionName
```

This example will invoke the deployed function and output the result of the invocation in the terminal.

### Function invocation with data

```bash
serverless invoke --function functionName --data '{"name": "Bob"}'
```

This example will invoke the function with the provided data and output the result in the terminal.

### Function invocation with data passing

```bash
serverless invoke --function functionName --path lib/event.json
```

This example will pass the json data in the `lib/event.json` file (relative to the root of the service) while invoking the specified/deployed function.

Example of `event.json`

```
{
    "key": "value"
}
```

