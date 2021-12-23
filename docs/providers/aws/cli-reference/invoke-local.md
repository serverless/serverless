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

This runs your code locally by emulating the AWS Lambda environment. Please keep in mind, it's not a 100% perfect emulation, there may be some differences, but it works for the vast majority of users. We mock the `context` with simple mock data.

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

* `--env` or `-e` String representing an environment variable to set when invoking your function, in the form `<name>=<value>`. Can be repeated for more than one environment variable.
* `--docker` Enable docker support for NodeJS/Python/Ruby/Java. Enabled by default for other
  runtimes.
* `--docker-arg` Pass additional arguments to docker run command when `--docker` is option used. e.g. `--docker-arg '-p 9229:9229' --docker-arg '-v /var:/host_var'`
* `--skip-package` Use the last packaged files from `.serverless` directory. This will speed up invocation significantly as we can skip the packaging of all files before every invoke

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
  "httpMethod": "GET"
  //  etc. //
}
```

### Local function invocation with custom context

```bash
serverless invoke local --function functionName --context "hello world"
```

### Local function invocation with context passing

```bash
serverless invoke local --function functionName \
  --contextPath lib/context.json
```

This example will pass the json context in the `lib/context.json` file (relative to the root of the service) while invoking the specified/deployed function.

### Local function invocation, setting environment variables

```bash
serverless invoke local -f functionName -e VAR1=value1

# Or more than one variable

serverless invoke local -f functionName \
  -e VAR1=value1 \
  -e VAR2=value2
```

When using [AWS CloudFormation intrinsic functions](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference.html) as environment variables value, **only Fn::ImportValue and Ref** will be automatically resolved for function invocation. Other intrinsic functions use will result in the corresponding configuration object passed in the function as environment variable.

```yml
functions:
  functionName:
    handler: handler.main
    environment:
      EXT_TABLE_NAME:
        Fn::ImportValue: exported-tableName
      REF_TABLE_NAME:
        Ref: myTable
      INT_TABLE_NAME:
        Fn::GetAtt: [myTable, Arn]
```

In the above example, `EXT_TABLE_NAME` and `REF_TABLE_NAME` will be resolved to the exported value `exported-tableName` and `myTable` physical ID respectively while `INT_TABLE_NAME` will not be resolved.

### Limitations

Use of the `--docker` flag and runtimes other than NodeJs, Python, Java, & Ruby depend on having
[Docker](https://www.docker.com/) installed. On MacOS & Windows, install
[Docker Desktop](https://www.docker.com/products/docker-desktop); On Linux install
[Docker engine](https://www.docker.com/products/docker-engine) and ensure your user is in the
`docker` group so that you can invoke docker without `sudo`.

**Note:** In order to get correct output when using Java runtime, your Response class must implement `toString()` method.

**Environment variables:** The `IS_LOCAL` environment variable, as well as
any environment variables provided via command line arguments,
will only be set once the invoked function begins its execution.
They _will not_ be set during the parsing of the `serverless.yml` file.

## Resource permissions

Lambda functions assume an _IAM role_ during execution: the framework creates this role, and set all the permission provided in the `provider.iam.role.statements` section of `serverless.yml`.

Unless you explicitly state otherwise, every call to the AWS SDK inside the lambda function is made using this role (a temporary pair of key / secret is generated and set by AWS as environment variables, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`).

When you use `serverless invoke local`, the situation is quite different: the role isn't available (the function is executed on your local machine), so unless you set a different user directly in the code (or via a key pair of environment variables), the AWS SDK will use the default profile specified inside your AWS credential configuration file.

Take a look to the official AWS documentation (in this particular instance, for the javascript SDK, but should be similar for all SDKs):

- [http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-shared.html](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-shared.html)
- [http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-lambda.html](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-lambda.html)

Whatever approach you decide to implement, **be aware**: the set of permissions might be (and probably is) different, so you won't have an exact simulation of the _real_ IAM policy in place.
