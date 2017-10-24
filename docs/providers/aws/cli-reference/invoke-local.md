<!--
title: Serverless Framework Commands - AWS Lambda - Invoke Local
menuText: invoke local
menuOrder: 9
description: Emulate an invocation of your AWS Lambda function locally using the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/invoke-local)
<!-- DOCS-SITE-LINK:END -->

# AWS - Invoke Local

This runs your code locally by emulating the AWS Lambda environment. Please keep in mind, it's not a 100% perfect emulation, there may be some differences, but it works for the vast majority of users.  We mock the `context` with simple mock data.

```bash
serverless invoke local --function functionName
```

**Note:** Please refer to [this guide](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-set-up-simple-proxy.html#api-gateway-simple-proxy-for-lambda-input-format) for event data passing when your function uses the `http` event with a Lambda Proxy integration.

## Options

- `--function` or `-f` The name of the function in your service that you want to invoke locally. **Required**.
- `--path` or `-p` The path to a json file holding input data to be passed to the invoked function as the `event`. This path is relative to the root directory of the service.
- `--data` or `-d` String data to be passed as an event to your function. Keep in mind that if you pass both `--path` and `--data`, the data included in the `--path` file will overwrite the data you passed with the `--data` flag.
- `--raw` Pass data as a raw string even if it is JSON. If not set, JSON data are parsed and passed as an object.
- `--contextPath` or `-x`, The path to a json file holding input context to be passed to the invoked function. This path is relative to the root directory of the service.
- `--context` or `-c`, String data to be passed as a context to your function. Same like with `--data`, context included in `--contextPath` will overwrite the context you passed with `--context` flag.

## Environment

The invoke local command sets reasonable environment variables for the invoked function.
All AWS specific variables are set to values that are quite similar to those found in
a real "physical" AWS Lambda environment. Additionally the `IS_LOCAL` variable is
set, that allows you to determine a local execution within your code.

## Examples

### Local function invocation

```bash
serverless invoke local --function functionName
```

This example will locally invoke your function.

### Local function invocation with data

```bash
serverless invoke local --function functionName --data "hello world"
```

```bash
serverless invoke local --function functionName --data '{"a":"bar"}'
```

### Local function invocation with data from standard input

```bash
node dataGenerator.js | serverless invoke local --function functionName
```

### Local function invocation with data passing

```bash
serverless invoke local --function functionName --path lib/data.json
```

This example will pass the json data in the `lib/data.json` file (relative to the root of the service) while invoking the specified/deployed function.

### Example `data.json`

```json
{
  "resource": "/",
  "path": "/",
  "httpMethod": "GET",
  //  etc. //
}
```

### Local function invocation with custom context

```bash
serverless invoke local --function functionName --context "hello world"
```

### Local function invocation with context passing

```bash
serverless invoke local --function functionName --contextPath lib/context.json
```
This example will pass the json context in the `lib/context.json` file (relative to the root of the service) while invoking the specified/deployed function.

### Limitations

Currently, `invoke local` only supports the NodeJs, Python & Java runtimes.

**Note:** In order to get correct output when using Java runtime, your Response class must implement `toString()` method.

## Resource permissions

Lambda functions assume an *IAM role* during execution: the framework creates this role, and set all the permission provided in the `iamRoleStatements` section of `serverless.yml`.

Unless you explicitly state otherwise, every call to the AWS SDK inside the lambda function is made using this role (a temporary pair of key / secret is generated and set by AWS as environment variables, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`).

When you use `serverless invoke local`, the situation is quite different: the role isn't available (the function is executed on your local machine), so unless you set a different user directly in the code (or via a key pair of environment variables), the AWS SDK will use the default profile specified inside you AWS credential configuration file.

Take a look to the official AWS documentation (in this particular instance, for the javascript SDK, but should be similar for all SDKs):

- [http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-shared.html](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-shared.html)
- [http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-lambda.html](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-lambda.html)

Whatever approach you decide to implement, **be aware**: the set of permissions might be (and probably is) different, so you won't have an exact simulation of the *real* IAM policy in place.
