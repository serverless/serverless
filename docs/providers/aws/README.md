<!--
title: Serverless AWS Documentation
description: todo
layout: Page
-->

# Serverless AWS Documentation

- [About AWS lambda](#about-aws-lambda)
- [Quick Start](#quick-start)
- [Guide to using Serverless with AWS](./guide)
- [AWS Lambda Examples](./examples)
- [AWS Events](./events.md)
- [Plugins for AWS](#plugins-for-aws)

# About AWS Lambda

Learn more about the programming model of lambda functions http://docs.aws.amazon.com/lambda/latest/dg/programming-model-v2.html

## <a name="quick-start"></a>Quick Start

[Watch the video guide here](https://youtu.be/weOsx5rLWX0) or follow the steps below to create and deploy your first serverless microservice in minutes.

| **Step** | **Command** |**Description**|
|---|-------|------|
|  1.  | `npm install -g serverless@beta` | Install Serverless CLI  |
|  2.  | `mkdir my-first-service && cd my-first-service` | Create the project directory |
|  3.  | [Create a default AWS profile, if you don't have one set locally](/docs/guide/provider-account-setup.md#amazon-web-services) | Connect Serverless with your provider |
|  4.  | `serverless create --template aws-nodejs` | Create an AWS Lamdba function in Node.js |
|  5.  | `serverless deploy` | Deploy to live AWS account  |
|  6.  | `serverless invoke --function hello` | run the live API endpoint  |

Run `serverless remove` to clean up this function from your account.

# [Guide to using Serverless with AWS](./guide)

- [Installing Serverless](./guide/01-installing-serverless.md)
- [Creating Services](./guide/creating-services.md)
- [Deploying Services](./guide/deploying-services.md)
- [Invoking Services](./guide/invoking-functions.md)
- [Removing Services](./guide/removing-services.md)

# [Available CLI commands for AWS](./cli)

- [`sls deploy`](./cli/deploy.md)
- [`sls info`](./cli/info.md)
- [`sls invoke`](./cli/invoke.md)
- [`sls logs`](./cli/logs.md)
- [`sls remove`](./cli/remove.md)

# [Examples](./examples)

See the examples folder for all AWS serverless examples

- [hello-world](./examples/hello-world)
- [using-external-libraries](./examples/using-external-libraries)
- [web-api](./examples/web-api)

To add examples, fork this repo and submit a pull request

# [Setup and configuration](./setup.md)

Please follow these [setup instructions](./setup.md) to start using AWS Lambda and serverless together

# Plugins for AWS

- list coming soon. check out the [community plugins repo](https://github.com/serverless/community-plugins) in the meantime!

