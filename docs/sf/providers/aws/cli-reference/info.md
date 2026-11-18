<!--
title: serverless info
description: Print a deployed service's endpoints, functions, layers, API keys and stack outputs, as text or JSON, with serverless info.
short_title: info
keywords:
  [
    'serverless info',
    'Serverless Framework CLI',
    'service endpoints',
    'CloudFormation stack outputs',
    'serverless info --json',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/info)

<!-- DOCS-SITE-LINK:END -->

# serverless info

`serverless info` prints what a deployed stage of a service exposes: its endpoints, functions, layers, API Gateway API keys and, on request, its CloudFormation stack outputs. It reads the stack and changes nothing. Use it to look up URLs after a deployment or from a script with `--json`; [`serverless deploy`](./deploy.md) prints the same summary when it finishes.

```bash
serverless info
```

## Options

`serverless info` accepts these options:

| Option          | Alias | Value     | Default                             | Required | Description                                                      |
| --------------- | ----- | --------- | ----------------------------------- | -------- | ---------------------------------------------------------------- |
| `--stage`       | `-s`  | string    | `provider.stage`, else `dev`        | No       | Stage to describe.                                               |
| `--region`      | `-r`  | string    | `provider.region`, else `us-east-1` | No       | AWS Region of that stage.                                        |
| `--aws-profile` |       | string    | `provider.profile`                  | No       | AWS profile whose credentials the command uses.                  |
| `--config`      | `-c`  | file path | `serverless.yml`                    | No       | Service configuration file to use.                               |
| `--verbose`     |       | flag      | off                                 | No       | Add a `Stack Outputs:` section with every CloudFormation output. |
| `--json`        |       | flag      | off                                 | No       | Print the information as JSON on standard output.                |
| `--conceal`     |       | flag      | off                                 | No       | Print API key names without their values in the text output.     |

`serverless info` also accepts the options every command takes: `--param="key=value"` (repeatable), `--org`, `--app`, `--debug` and `--help` (`-h`). For an AWS SAM or CloudFormation project, it takes `--stack`; see [AWS SAM and CloudFormation](../../../guides/sam.md).

`--conceal` applies to the text output only: the `--json` output always contains the API key values.

## Output of serverless info

`serverless info` prints one line or section per item:

```text
service: my-service
stage: dev
region: us-east-1
stack: my-service-dev
api keys:
  myKey: abc123exampleapikeyvalue
endpoint: GET - https://abc123example.execute-api.us-east-1.amazonaws.com/dev/users
functions:
  hello: my-service-dev-hello
```

The `endpoint` heading becomes `endpoints` when the service has several. Each endpoint line has one of these forms:

- `<METHOD> - <url>`: a route of an `http` (REST API) or `httpApi` (HTTP API) event.
- `<url>`: a WebSocket API.
- `CloudFront - <domain>`: the CloudFront distribution of `cloudFront` events.
- `<name>: <url>`: a [function URL](../guide/functions.md#lambda-function-urls) or a web app; just `<url>` when it is the service's only endpoint.

When the stack has 450 or more resources, the command also prints a warning about the CloudFormation limit of 500 resources per stack.

When the stage isn't deployed, the command stops with:

```text
Service "my-service" is not deployed to stage "dev" in us-east-1. Deploy it with "serverless deploy --stage dev --region us-east-1".
```

`serverless info` is read-only and safe to re-run.

## Web app endpoints in serverless info

`serverless info` lists each [web app](../guide/web-apps.md) under `endpoints` by name with its endpoint URL, followed by each custom domain that serves it:

```text
service: shop
stage: dev
region: us-east-1
stack: shop-dev
endpoints:
  web: https://abc123example.lambda-web.us-east-1.on.aws
  web: https://shop.example.com
  api: https://def456example.lambda-web.us-east-1.on.aws
  api: https://shop.example.com/api
```

A service whose only endpoint is one web app's prints it as `endpoint: <url>`. With a custom domain, `--verbose` also shows the CloudFront distribution's domain name and ID as stack outputs.

## Stack outputs with serverless info --verbose

`serverless info --verbose` adds every output of the CloudFormation stack, including the ones you define under `resources.Outputs`:

```text
service: my-service
stage: dev
region: us-east-1
stack: my-service-dev
endpoint: GET - https://abc123example.execute-api.us-east-1.amazonaws.com/dev/users
functions:
  hello: my-service-dev-hello
Stack Outputs:
  HelloLambdaFunctionQualifiedArn: arn:aws:lambda:us-east-1:123456789012:function:my-service-dev-hello:3
  ServiceEndpoint: https://abc123example.execute-api.us-east-1.amazonaws.com/dev
  ServerlessDeploymentBucketName: serverless-framework-deployments-us-east-1-d7b2bf38-2784
```

## JSON output with serverless info --json

`serverless info --json` prints one JSON document on standard output, while progress and log lines go to standard error, so you can redirect it to a file or pipe it to `jq`:

```bash
serverless info --json > info.json
```

The document has the same information as the text output, plus the resource count and every stack output with its export name:

```json
{
  "inputs": {
    "compose": {}
  },
  "info": {
    "functions": [
      {
        "name": "hello",
        "deployedName": "my-service-dev-hello"
      }
    ],
    "layers": [],
    "agents": [],
    "endpoints": ["https://abc123example.execute-api.us-east-1.amazonaws.com"],
    "service": "my-service",
    "stage": "dev",
    "region": "us-east-1",
    "stack": "my-service-dev",
    "resourceCount": 4,
    "apiKeys": []
  },
  "outputs": [
    {
      "OutputKey": "HelloLambdaFunctionQualifiedArn",
      "OutputValue": "arn:aws:lambda:us-east-1:123456789012:function:my-service-dev-hello:26",
      "Description": "Current Lambda function version",
      "ExportName": "sls-my-service-dev-HelloLambdaFunctionQualifiedArn"
    },
    {
      "OutputKey": "ServerlessDeploymentBucketName",
      "OutputValue": "serverless-framework-deployments-us-east-1-d7b2bf38-2784",
      "ExportName": "sls-my-service-dev-ServerlessDeploymentBucketName"
    },
    {
      "OutputKey": "HttpApiUrl",
      "OutputValue": "https://abc123example.execute-api.us-east-1.amazonaws.com",
      "Description": "URL of the HTTP API",
      "ExportName": "sls-my-service-dev-HttpApiUrl"
    }
  ]
}
```

In a service with web apps, `info` also has a `webApps` list of `{ "name", "url" }` entries.

## Run serverless info in CI

`serverless info` has no prompts of its own. In CI, sign in with `SERVERLESS_ACCESS_KEY` or `SERVERLESS_LICENSE_KEY` (see [Non-interactive use](./README.md#non-interactive-use-ci-and-ai-agents)) and read values from the JSON output:

```bash
serverless info --stage prod --json | jq -r '.info.endpoints[0]'
```

## Provided lifecycle events

- `info:info`

## Examples

### Show the stack outputs of a stage

```bash
serverless info --stage prod --region eu-central-1 --verbose
```

### Print the service information without API key values

```bash
serverless info --conceal
```

## Related commands

- [`serverless deploy`](./deploy.md) deploys the service and prints the same summary.
- [`serverless agent inspect`](./agent-inspect.md) shows the deployed resources in more detail.
- [`serverless remove`](./remove.md) deletes the deployed stage.
