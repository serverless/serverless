# Documentation

Welcome to the Serverless v1.0 documentation.

Here you'll find all the necessary information you need to learn and understand Serverless.
You'll find documentation on how to build next generation Serverless applications. Furthermore we'll deep dive into the
internals of Serverless so that you know how it works and how you can extend and modify it!

## Quick start

Follow these simple steps to install the alpha, create and deploy your first service, run your function and remove the
service afterwards.

1. `npm install serverless@1.0.0-alpha.1`
2. `serverless create --name first-service --provider aws`
3. `serverless deploy`
4. `serverless invoke --function hello --stage dev --region us-east-1`
5. `serverless remove --stage dev --region us-east-1`

## In depth

- [Concepts](/docs/concepts)
  - [Services](/docs/concepts/services.md) - Understanding Serverless services
  - [serverless.yaml](/docs/concepts/serverless-yaml.md) - A look at the `serverless.yaml` file
  - [serverless.env.yaml](/docs/concepts/serverless-env-yaml.md) - A look at the `serverless.env.yaml` file
  - [Plugins](/docs/concepts/plugins.md) - How plugins work
- [Guide](/docs/guide)
  - [Event sources](/docs/guide/event-sources.md) - Understand and use event sources
- [Tutorials](/docs/tutorials)
  - [Your first service](/docs/tutorials/your-first-service.md) - Create, deploy, invoke and remove your first service
  - [Adding event sources](/docs/tutorials/adding-event-sources.md) - Learn how you can extend your services functionality
  with event sources
- Plugins
  - [Core plugins](/lib/plugins)
    - [Create](/lib/plugins/create) - Creates a new Serverless service
    - [Deploy](/lib/plugins/deploy) - Deploy your resources to your provider
    - [Invoke](/lib/plugins/invoke) - Invoke your function
    - [Remove](/lib/plugins/remove) - Remove a deployed service
  - [AWS plugins](/lib/plugins/aws)
    - [Compile Functions](/lib/plugins/aws/deploy/compile/functions) - Compiles functions to
    CloudFormation resources
    - [Compile S3 Events](/lib/plugins/aws/deploy/compile/events/s3) - Compiles S3 events to
    CloudFormation resources
    - [Compile Scheduled Events](/lib/plugins/aws/deploy/compile/events/schedule) - Compiles scheduled
    events to CloudFormation resources
    - [Compile Api Gateway Events](/lib/plugins/aws/deploy/compile/apiGateway) - Compiles http events
    to CloudFormation resources
    - [Deploy](/lib/plugins/aws/deploy) - Deploys the service to AWS
    - [Invoke](/lib/plugins/aws/invoke) - Invokes an AWS lambda function
    - [Remove](/lib/plugins/aws/remove) - Removes the service with all it's resources from AWS

## FAQ

> Where do I start when I want to write apps with Serverless?

You should take a look at the [tutorials](/docs/tutorials) where you will find different guides which will help you
with your first application (there's also a ["Your first service"](/docs/tutorials/your-first-service.md) tutorial).

> I want to integrate provider X. How does this work?

You can implement your provider of choice with he help of plugins. Start by reading the [plugin concept](/docs/concepts/plugins.md)
to get an overview how plugins work. After that you might want to take a look at the [AWS Deploy](/lib/plugins/aws/deploy)
plugin which will explain to you how the AWS provider is implemented / works.

We'd recommend to take a look at the different sources of the [plugins](/lib/plugins) as they show implementation
details and best practices which will help you integrate your provider easily.

> How does Serverless work?

The [concepts](/docs/concepts) folder in the docs will help you understand how Serverless works.

> I found a bug / encountered a strange error

Please take a look at our [issues](https://github.com/serverless/serverless/issues) to see if someone else has faced
the same problem.

Contributions are always welcomed! Just open up a new issue to start the discussion or submit a pull request
which fixes the bug.
