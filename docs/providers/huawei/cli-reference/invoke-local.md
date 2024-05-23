# Huawei Cloud - Invoke Local

This runs your code locally by emulating the Huawei Cloud Function environment. Please keep in mind, it's not a 100% perfect emulation, there may be some differences, but it works for the vast majority of users. We mock the `context` with simple mock data.

```bash
serverless invoke local --function functionName
```

## Options

- `--function` or `-f`: The name of the function in your service that you want to invoke locally. **Required**.
- `--path` or `-p`: The path to a JSON file holding input data to be passed to the invoked function as the `event`. This path is relative to the root directory of the service.
- `--data` or `-d`: String containing data to be passed as an event to your function. Keep in mind that if you pass both `--path` and `--data`, the data included in the `--path` file will overwrite the data you passed with the `--data` flag.
* `--env` or `-e` String representing an environment variable to set when invoking your function, in the form `<name>=<value>`. Can be repeated for more than one environment variable.
## Environment

The invoke local command sets reasonable environment variables for the invoked function.

## Examples

### Local function invocation

```bash
serverless invoke local --function functionName
```

This example will locally invoke your function.

### Local function invocation with data

```bash
serverless invoke local --function functionName --data '{"a":"bar"}'
```

### Local function invocation with a data file

```bash
serverless invoke local --function functionName --path lib/data.json
```

This example will pass the JSON data in the `lib/data.json` file (relative to the root of the service) while invoking the specified/deployed function.

Example `data.json`:

```json
{
  "resource": "/",
  "path": "/",
  "httpMethod": "GET"
  //  etc. //
}
```


### Local function invocation, setting environment variables

```bash
serverless invoke local -f functionName -e VAR1=value1

# Or more than one variable

serverless invoke local -f functionName \
  -e VAR1=value1 \
  -e VAR2=value2
```
- [http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-shared.html](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-shared.html)
- [http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-lambda.html](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-lambda.html)

Whatever approach you decide to implement, **be aware**: the set of permissions might be (and probably is) different, so you won't have an exact simulation of the _real_ IAM policy in place.
