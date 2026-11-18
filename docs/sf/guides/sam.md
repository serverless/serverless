<!--
title: AWS SAM and CloudFormation Templates
description: Deploy, inspect and remove an AWS SAM or CloudFormation template with the Serverless Framework CLI, using samconfig, variables and Compose.
short_title: SAM & CloudFormation Templates
keywords:
  [
    'Serverless Framework',
    'AWS SAM',
    'CloudFormation template',
    'samconfig.toml',
    'deploy SAM template',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/sam)

<!-- DOCS-SITE-LINK:END -->

# AWS SAM and CloudFormation Templates

The Serverless Framework CLI deploys an AWS SAM or plain AWS CloudFormation template as it is, without a `serverless.yml`: run `serverless deploy` in the directory that holds `template.yml`. Use it to bring an existing SAM or CloudFormation project under the same CLI as your Framework services, with Serverless Framework variables in the template and [Serverless Compose](./compose.md) to pass outputs between services. The SAM and CloudFormation runner supports the `deploy`, `remove`, `info` and `print` commands.

## Deploy a SAM template

The following `template.yml` defines one function behind an API Gateway REST API:

```yaml
# template.yml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: An example RESTful service

Resources:
  ExampleFunction:
    Type: AWS::Serverless::Function
    Properties:
      Runtime: nodejs24.x
      Handler: index.handler
      CodeUri: src
      Events:
        ListCustomers:
          Type: Api
          Properties:
            Path: /
            Method: any

Outputs:
  ApiUrl:
    Value: !Sub https://${ServerlessRestApi}.execute-api.${AWS::Region}.amazonaws.com/Prod/
```

The handler lives in `src/index.mjs`:

```javascript
// src/index.mjs
export const handler = async () => {
  return {
    statusCode: 200,
    body: JSON.stringify('Hello from Lambda!'),
  }
}
```

Deploy it to a stack named `my-dev-stack`:

```bash
serverless deploy --stack my-dev-stack
```

The command zips `src`, uploads the zip to the deployment bucket, creates the stack, and prints its outputs:

```text
Deploying "my-dev-stack" to stage "dev" (us-east-1)

✔ Service "my-dev-stack" deployed successfully
Outputs:
  ApiUrl: https://abc123def4.execute-api.us-east-1.amazonaws.com/Prod/
```

To skip `--stack`, set `stack_name` in a [`samconfig.toml` file](#configure-a-sam-project-with-samconfig). To delete the stack, run `serverless remove --stack my-dev-stack`.

## How the Framework detects a SAM or CloudFormation project

The CLI runs a directory as a SAM or CloudFormation project when it holds one of these files, checked in this order:

1. `samconfig.toml`, `samconfig.yaml` or `samconfig.yml`. The template is the `template_file` the samconfig names, or else `template.yaml`, `template.yml` or `template.json`.
2. `template.yaml`, `template.yml` or `template.json`.

A `serverless-compose.yml` in the same directory takes precedence, and a SAM or CloudFormation file takes precedence over `serverless.yml`. To run a `serverless.yml` service in a directory that also holds `template.yml`, pass `--config serverless.yml`.

The template can be YAML (with CloudFormation short-form tags such as `!Sub` and `!Ref`) or JSON, and can be a SAM template or a plain CloudFormation template.

## Commands and options for SAM and CloudFormation projects

| Command             | What it does                                                    | Options                                      |
| ------------------- | --------------------------------------------------------------- | -------------------------------------------- |
| `serverless deploy` | Uploads function code and creates or updates the stack          | `--stack`, `--bucket`, `--region`, `--stage` |
| `serverless remove` | Deletes the stack                                               | `--stack`, `--bucket`, `--region`, `--stage` |
| `serverless info`   | Prints the service, stage, Region, stack name and stack outputs | `--stack`, `--region`, `--stage`             |
| `serverless print`  | Prints the template after variables are resolved                | `--format`: `yaml` (default) or `json`       |

The options:

| Option           | Default                                                                                                        | Description                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `--stack`        | `stack_name` in samconfig, else the Compose service key                                                        | The CloudFormation stack name. Required when neither default applies                  |
| `--bucket`, `-b` | `s3_bucket` in samconfig, else the [shared deployment bucket](./deployment-bucket.md#shared-deployment-bucket) | An existing bucket in the stack's Region for function zips                            |
| `--region`, `-r` | `region` in samconfig, else `us-east-1`                                                                        | The AWS Region of the stack                                                           |
| `--stage`, `-s`  | `dev`                                                                                                          | The samconfig environment to read ([Stages and stack names](#stages-and-stack-names)) |

The CLI uses the same AWS credentials as for any other service: `--aws-profile`, the `AWS_PROFILE` environment variable, or the default AWS credential chain ([AWS Credentials](../providers/aws/guide/credentials.md)). Other Framework commands, such as `deploy function`, `invoke`, `logs` and `dev`, aren't available for SAM and CloudFormation projects.

## What `serverless deploy` does with a SAM template

`serverless deploy` runs these steps:

1. Resolves the [Serverless Framework variables](#use-serverless-framework-variables-in-a-template) in the template.
2. Finds or creates the shared deployment bucket for the Region and its SSM parameter. It does this on every run, also when `--bucket` or `s3_bucket` names another bucket.
3. For each `AWS::Serverless::Function` resource, zips the local directory its `CodeUri` names (default: the project directory), uploads the zip to `serverless/<stack>/<timestamp>/<LogicalId>.zip` in the deployment bucket, and replaces `CodeUri` with the zip's `s3://` URI.
4. Creates the stack, or updates it when it exists, passing the template in the request with the `CAPABILITY_IAM`, `CAPABILITY_NAMED_IAM` and `CAPABILITY_AUTO_EXPAND` capabilities and the `parameter_overrides` from samconfig.
5. Waits for the stack to finish and prints its outputs. The first failed resource event stops the command with that event's reason. When CloudFormation reports no changes, the command prints `No changes to deploy. Deployment skipped.` Because each deploy uploads the function zips under a new key and writes that key into `CodeUri`, this happens only for a template without `AWS::Serverless::Function` resources.

What the deploy step packages, and what it leaves to you:

- The whole `CodeUri` directory goes into the zip, including `node_modules`, with no include or exclude patterns and no build step. Point `CodeUri` at a directory that holds only the function's code, and install its dependencies there first.
- `CodeUri` must be a local directory. `Globals.Function.CodeUri` doesn't apply; set `CodeUri` on each function.
- Only `AWS::Serverless::Function` code is uploaded. Other resources that point to local files, such as layers (`ContentUri`), `AWS::Lambda::Function` `Code` and state machine definitions, are passed to CloudFormation unchanged, so they must reference S3 objects or inline content.
- Every `AWS::Serverless::Function` gets a zip and a `CodeUri`, including one that sets `InlineCode` or `ImageUri`: a function without `CodeUri` gets the zipped project directory.
- CloudFormation accepts a template body of at most 51,200 bytes in a request ([CloudFormation quotas](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cloudformation-limits.html)); the CLI sends the template in the request, so a larger template stops the deploy.
- The bucket must exist: a missing `--bucket` or `s3_bucket` stops the deploy with `Bucket <name> does not exist`.

## What `serverless remove` does with a SAM stack

`serverless remove` deletes the CloudFormation stack and waits until the deletion finishes. Like `serverless deploy`, it first finds or creates the shared deployment bucket and its SSM parameter, also when `--bucket` or `s3_bucket` names another bucket. When the stack exists, it checks that the deployment bucket exists before deleting the stack, and stops with `Bucket <name> does not exist` when it doesn't. It doesn't empty or delete any bucket, so the uploaded function zips stay under `serverless/<stack>/` in the deployment bucket. When the stack doesn't exist, the command reports success.

## Configure a SAM project with samconfig

The CLI reads `samconfig.toml` (or `samconfig.yaml` / `samconfig.yml`) from the project directory and uses these keys:

```toml
# samconfig.toml
version = 0.1

[default.deploy.parameters]
stack_name = "my-dev-stack"
region = "us-east-1"
template_file = "template.yml"
s3_bucket = "my-company-deployments-us-east-1"
parameter_overrides = "Environment=dev LogLevel=info"
```

| Key                   | Used for                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `stack_name`          | The stack name, when `--stack` isn't given                                                        |
| `region`              | The stack's Region, when `--region` isn't given                                                   |
| `s3_bucket`           | The deployment bucket, when `--bucket` isn't given                                                |
| `template_file`       | The template file name, in the project directory, with a `.yaml`, `.yml` or `.json` extension     |
| `parameter_overrides` | Template parameters, as `Key=Value` pairs separated by spaces. Values can't contain spaces or `=` |

The CLI reads each key from the `[<stage>.deploy.parameters]` table, then `[<stage>.global.parameters]`, then `[default.deploy.parameters]`, then `[default.global.parameters]`, for every command. `template_file` is the exception: it is read only from `[<stage>.deploy.parameters]` when you pass `--stage`, and only from `[default.deploy.parameters]` when you don't. The CLI ignores the other samconfig keys and the SAM CLI command sections, such as `build` and `sync`.

## Stages and stack names

For a SAM or CloudFormation project, the stage (`--stage`, default `dev`) only selects which samconfig environment the CLI reads; it isn't added to the stack name. To deploy one template as several stages, give each stage its own `stack_name`:

```toml
# samconfig.toml
version = 0.1

[default.deploy.parameters]
stack_name = "orders-dev"
region = "us-east-1"

[prod.deploy.parameters]
stack_name = "orders-prod"
region = "eu-west-1"
```

```bash
serverless deploy --stage prod
```

Without a stage-specific `stack_name`, every stage deploys to the same stack.

## Use Serverless Framework variables in a template

The CLI resolves [Serverless Framework variables](./variables/README.md) in the template before it deploys it, so a template can read environment variables, CLI options, SSM parameters, other stacks' outputs and files:

```yaml
# template.yml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Resources:
  ExampleFunction:
    Type: AWS::Serverless::Function
    Properties:
      Runtime: nodejs24.x
      Handler: index.handler
      CodeUri: src
      Environment:
        Variables:
          STAGE: ${sls:stage}
          TABLE_NAME: ${ssm:/orders/table-name}
          OWNER: ${env:USER}
```

The variable sources available in `serverless.yml` work in templates too, including `${env:…}`, `${opt:…}`, `${sls:stage}`, `${sls:instanceId}`, `${param:…}`, `${aws:accountId}`, `${aws:region}`, `${ssm:…}`, `${s3:…}`, `${cf:…}`, `${file(…)}` and `${git:…}`. CloudFormation's own substitutions stay as they are: `${AWS::Region}` and other pseudo parameters, and `${LogicalId}` or `${LogicalId.Attribute}` without a colon, reach CloudFormation unchanged.

`${aws:region}`, and the Region that `${ssm:…}`, `${cf:…}` and `${s3:…}` read from, come from `--region`, else the `AWS_REGION` environment variable, else `us-east-1`. The `region` in samconfig doesn't apply to them, so pass `--region` when the stack's Region isn't `us-east-1`.

## Use SAM and CloudFormation services in Compose

A SAM or CloudFormation project can be a service in [Serverless Compose](./compose.md), next to `serverless.yml` services, and its stack outputs can feed other services:

```yaml
# serverless-compose.yml
services:
  traditional-service:
    path: traditional-service
  sam-service:
    path: sam-service
    params:
      traditionalServiceOutput: ${traditional-service.exampleOutput}
```

The template reads the value with `${param:…}`:

```yaml
# sam-service/template.yml
Resources:
  HelloWorldFunction:
    Type: AWS::Serverless::Function
    Properties:
      Environment:
        Variables:
          FRAMEWORK_OUTPUT: ${param:traditionalServiceOutput}
```

Stage parameters in `serverless-compose.yml` reach every service, SAM templates included:

```yaml
# serverless-compose.yml
stages:
  dev:
    params:
      STRIPE_API_KEY: ${ssm:/stripe/dev/api-key}
  prod:
    params:
      STRIPE_API_KEY: ${ssm:/stripe/prod/api-key}

services:
  sam-service:
    path: sam-service
```

The template reads them the same way, for example `STRIPE_API_KEY: ${param:STRIPE_API_KEY}`. When a SAM service in Compose has no `stack_name` in samconfig and no `--stack`, its stack name is the service key in `serverless-compose.yml` (`sam-service` in the example). Compose stores the stack outputs in [Compose state](./state.md).

## Related pages

- [Serverless Compose](./compose.md): deploy SAM, CloudFormation and `serverless.yml` services together.
- [Deployment Bucket](./deployment-bucket.md): the shared bucket that holds the function zips.
- [Variables](./variables/README.md): every variable source a template can use.
- [AWS SAM CLI configuration file](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-config.html): the samconfig format.
