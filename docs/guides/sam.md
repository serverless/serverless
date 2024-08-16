<!--
title: Serverless Framework - Deploying SAM & CloudFormation Projects
menuText: Deploying SAM/CFN Projects
short_title: Deploying SAM & CloudFormation Projects
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/sam/)

<!-- DOCS-SITE-LINK:END -->

# Overview

_Warning:_ Support for deploying raw CloudFormation & SAM projects is still experimental.

You can deploy any SAM or CloudFormation template using the Serverless Framework V4. This enables you to take advantage of the many features the framework offers, such as:

- You can simplify your configuration with Serverless Variables.
- You can compose services together with Serverless Compose.
- You can use dashboard features like parameters and observability.
- You can quickly test and debug in the cloud using dev mode by running `sls dev`.
- You can deploy just functions with `sls deploy function --function LambdaLogicalId`.
- You can invoke functions with `sls invoke --function LambdaLogicalId`.
- You can search function logs with `sls logs --function LambdaLogicalId`.
- You can view stack info with `sls info`.

You don't have to make any changes to your SAM or CloudFormation project to use the Serverless Framework. Just run `serverless deploy` in your project directory. So given an example SAM template:

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
      Events:
        ListCustomers:
          Type: Api
          Properties:
            Path: /
            Method: any
```

You can deploy it with the following command:

```
serverless deploy --stack my-dev-stack
```

You templte doesn't have to be a SAM template, it could also be a regular CloudFormation template.

## samconfig.toml

If your project has a `samconfig.toml` file, it'll be used by the framework. Most `samconfig.toml` properties are irrelevant outside the SAM/CFN context, so the Serverless Framework only supports the most essential `samconfig.toml` properties:

```toml
version = 0.1

[default.deploy.parameters]
stack_name = "my-dev-stack"
region = "us-east-1"
template_file = "template.yml"
parameter_overrides = "Environment=dev"
```

**Note:** Because `samconfig.toml` is structured around the SAM CLI commands that do not exist in the Serverless Framework, the CLI will only use the `<stage>.global.parameters` and `<stage>.deploy.parameters` configuration, even if you are running a command other than `deploy`

You now no longer have to specify a stack name on every deploy:

```
serverless deploy
```

And you can change your stage like any other Serverless Framework project:

```
serverless deploy --stage prod
```

**Note:** The default stage name when deploying SAM projects is `default`, not `dev` like traditional Serverless Framework projects. Because `samconfig.toml` will more likely have `default` config rather than `dev` config, as it is much more commonly used in the SAM ecosystem based on AWS recommendation.

## Using Serverless Variables

You can use Serverless Variables in your SAM or CloudFormation templates just like any other Serverless Framework project. The CLI will automatically resolve those variables before deployment. This simplifies your configuration as your project grows.

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

For a list of all the available serverless variables, take a look at the [Serverless Variables Docs](./variables/README.md).
