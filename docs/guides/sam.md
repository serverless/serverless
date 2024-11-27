<!--
title: Serverless Framework - Deploying SAM & CloudFormation Projects
menuText: Deploying SAM & CFN Projects
short_title: Deploying SAM & CloudFormation Projects
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/sam/)

<!-- DOCS-SITE-LINK:END -->

# AWS SAM & Cloudformation Support

_Warning:_ Support for deploying raw CloudFormation & SAM projects is still experimental.

You can now deploy SAM/CFN templates with the Serverless Framework. This enables you to take advantage of the many features the framework offers. Here is what is currently supported and our future roadmap for this feature:

- [x] Deploying SAM/CFN templates in JSON & YAML formats.
- [x] Removing SAM/CFN templates in JSON & YAML formats.
- [x] Using Serverless Variables in your SAM/CFN templates (partially supported).
- [x] Composing services together with Serverless Compose.
- [x] Viewing stack info with `sls info`.
- [ ] Deploying indvidual functions with `sls deploy function --function LambdaLogicalId`.
- [ ] Invoking functions with `sls invoke --function LambdaLogicalId`.
- [ ] Searching function logs with `sls logs --function LambdaLogicalId`.
- [ ] Testing your app in the cloud with `sls dev`.

You don't have to make any changes to your SAM/CFN templates to deploy them with the Serverless Framework. Just run `serverless deploy` in your project directory. Your template doesn't have to be a SAM template, it could also be a regular CloudFormation template.

### Quick Start

Given an example SAM template:

```yml
# template.yml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Description: |
  An example RESTful service

Resources:
  ExampleFunction:
    Type: AWS::Serverless::Function
    Properties:
      Runtime: nodejs20.x
      Handler: index.handler
      CodeUri: '.'
      Events:
        ListCustomers:
          Type: Api
          Properties:
            Path: /
            Method: any
```

With the following handler file:

```js
// index.js
export const handler = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify('Hello from Lambda!'),
  }
}
```

You can deploy it with the following command:

```
serverless deploy --stack my-dev-stack
```

You only have to specify the `--stack` option if you don't have it in a `samconfig.toml` file.

## samconfig.toml

If your project has a `samconfig.toml` file, it'll be read by the framework. Most `samconfig.toml` properties are irrelevant outside the SAM/CFN context, so the Serverless Framework only uses the properties it needs, specifically:

```toml
version = 0.1

[default.deploy.parameters]
stack_name = "my-dev-stack"
region = "us-east-1"
template_file = "template.yml"
# s3_bucket = "my-bucket"
# parameter_overrides = "Environment=dev"
```

**Note:** Because `samconfig.toml` is structured around the SAM CLI commands that do not exist in the Serverless Framework, the CLI will only use the `<stage>.global.parameters` and `<stage>.deploy.parameters` configuration, even if you are running a command other than `deploy`

You now no longer have to specify a stack name on every deploy:

```
serverless deploy
```

## Deploying SAM/CFN Templates

You can deploy a SAM/CFN template with the Serverless Framework using the `sls deploy` command.

### Options

- `stack` - The stack name. Required if not specified in a `samconfig.toml` file.
- `bucket` - The deployment bucket. If not specified, we'll use the default Serverless Framework deployment bucket.
- `region` - The region to deploy to. Default is `us-east-1`.
- `stage` - The stage to deploy to. Default is `dev`.

**Note:** Deploying AWS Lambda Layers, AWS Lambda Containers, and AWS Lambda Step Functions resources is not yet supported.

## Removing SAM/CFN Templates

You can remove a SAM/CFN template with the Serverless Framework using the `sls remove` command.

### Options

- `stack` - The stack name. Required if not specified in a `samconfig.toml` file.
- `bucket` - The deployment bucket. If not specified, we'll use the default Serverless Framework deployment bucket.
- `region` - The region to deploy to. Default is `us-east-1`.
- `stage` - The stage to deploy to. Default is `dev`.

If you specified your own deployment bucket, it will not be emptied or removed with the `remove` command.

## Getting SAM/CFN Service Info

You can get information about your SAM/CFN service, specifically the stack outputs and their values, using the `sls info` command.

### Options

- `stack` - The stack name. Required if not specified in a `samconfig.toml` file.
- `region` - The region where the service/stack is deployed. Default is `us-east-1`.
- `stage` - The stage where the service/stack is deployed. Default is `dev`.

## Supported file formats and names

The Serverless Framework supports both JSON and YAML file formats for both SAM
and CloudFormation templates. The file can be named `template.yml`,
`template.yaml`, or `template.json`.

You can also use the `samconfig.toml` to specify the template filename using
the `template_file` parameter.

## Using Serverless Variables

You can use Serverless Variables in your SAM or CloudFormation templates just like any other Serverless Framework project. The CLI will automatically resolve those variables before deployment. This simplifies your configuration as your project grows.

We currently have partial support for Serverless Variables. Here are the Serverless Variables that are supported in SAM/CFN templates:

- AWS Account ID: `${aws:accountId}`
- AWS Region: `${aws:region}`
- AWS Stack Output: `${cf:another-service-dev.functionPrefix}`
- CLI Options: `${opt:<option>}`
- SLS Instance ID: `${sls:instanceId}`
- Environment Variables: `${env:ENV_VAR}`
- File: `${file(./myCustomFile.yml)}`
- Git: `${git:<variable>}`
- S3: `${s3:myBucket/myKey}`
- SSM: `${ssm:/path/to/service/id}`

For example, you can pass in your local environment variables to AWS Lambda:

```yml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Description: |
  An example RESTful service

Resources:
  ExampleFunction:
    Type: AWS::Serverless::Function
    Properties:
      Runtime: nodejs20.x
      Handler: index.handler
      Environment:
        Variables:
          STAGE: ${env:USER}
```

For more information about these variabels, take a look at the [Serverless Variables Docs](./variables/README.md).

## Using Serverless Compose

Just like traditional framework services, you can compose multiple SAM or CloudFormation (CFN) stacks together with Serverless Compose, or alongside traditional framework services. This allows you to reference outputs from other services and manage dependencies seamlessly. Here’s an example:

```yml
# serverless-compose.yml

services:
  traditional-service:
    path: traditional-service
  sam-service:
    path: sam-service
    params:
      traditionalServiceOutput: ${traditional-service.exampleOutput}
```

You can then reference these parameters in your SAM/CFN templates using the `${param:<key>}` variable:

```yml
# template.yml

Resources:
  HelloWorldFunction:
    Type: AWS::Serverless::Function
    Properties:
      Environment:
        Variables:
          FRAMEWORK_OUTPUT: ${param:traditionalServiceOutput}
```

Serverless Compose also supports stage-specific configuration shared between all your services. If you define stage-specific parameters in your `serverless-compose.yml`:

```yml
# serverless-compose.yml
stages:
  dev:
    params:
      STRIPE_API_KEY: 'stripe-api-dev-key'
  prod:
    params:
      STRIPE_API_KEY: 'stripe-api-prod-key'

services:
  traditional-service:
    path: traditional-service
  sam-service:
    path: sam-service
    params:
      traditionalServiceOutput: ${traditional-service.exampleOutput}
```

You can reference these parameters directly in your SAM/CFN templates, and the correct value will be used based on the stage you're deploying to:

```yml
# template.yml

Resources:
  HelloWorldFunction:
    Type: AWS::Serverless::Function
    Properties:
      Environment:
        Variables:
          STRIPE_API_KEY: ${param:STRIPE_API_KEY}
```

If you don't specify the stack name in a `samconfig.toml` file in any of these SAM/CFN services, the stack name will be the service key you specified in the `serverless-compose.yml` file. So in the above example, that would be `sam-service`.
