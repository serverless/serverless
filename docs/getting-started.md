<!--
title: 'Setting Up Serverless Framework With AWS'
description: 'Learn how to install, set up, and deploy projects using the Serverless Framework with AWS Lambda, DynamoDB, S3, and more.'
short_title: 'Setting Up Serverless Framework With AWS'
keywords:
  [
    'Serverless Framework setup',
    'AWS Lambda',
    'AWS DynamoDB',
    'Serverless installation',
    'Serverless deployment',
  ]
-->

# Setting Up Serverless Framework With AWS

Here's how to install the Serverless Framework, set up a project and deploy it to Amazon Web Services on serverless infrastructure like AWS Lambda, AWS DynamoDB, AWS S3 and more.

## Installation

### Install the Serverless Framework via NPM

First, you must have the [Node.js runtime](https://nodejs.org) installed, then you can install the Serverless Framework via NPM.

Open your CLI and run the command below to install the Serverless Framework globally.

```text
npm i serverless -g
```

Run `serverless` to verify your installation is working, and show the current version.

## Update Serverless Framework

As of version 4, the Serverless Framework automatically updates itself and performs a check to do so every 24 hours.

You can force an update by running this command:

```text
serverless update
```

Or, you can set this environment variable:

```text
SERVERLESS_FRAMEWORK_FORCE_UPDATE=true
```

## Pinning to a Specific Version

You are able to pin to a specific version of the Serverless Framework using normal semver syntax, by setting the `frameworkVersion` property in your `serverless.yml` file. If you do not set this property, then every 24 hours you will be automatically updated to the latest version of the Serverless Framework. If you do set this property, you will be updated every 24 hours to the highest version that is currently available for the version constraint you have set.

For example, If you set `frameworkVersion: ~4.1.0` then you will always be updated to the most recent patch version of `4.1.x`.

We highly recommend that you never pin to a specific patch version and instead pin to a specific major or minor version. This way you will always benefit from patch updates that may include security and bug fixes.

We periodically will block versions that are found to contain regressions, security issues, or other issues that impact stability for our users. If you are pinning to a version that is found to be broken, we will update you to the next closest patch version that is not blocked.

### Blocked Versions

Currently, the following versions are blocked,

1. Versions older than `4.0.4`
2. Version `4.1.8`
3. Versions `4.1.13` to `4.1.15`

## The `serverless` Command

The Serverless Framework ships with a `serverless` command that walks you through getting a project created and deployed onto AWS. It helps with downloading a Template, setting up AWS Credentials, setting up the Serverless Framework Dashboard, and more, while explaining each concept along the way.

This guide will also walk you through getting started with the Serverless Framework, but please note, simply typing the `serverless` command may be the superior experience.

```text
serverless
```

## Create A Service

The primary concept for a project in the Serverless Framework is known as a "Service", and its declared by a `serverless.yml` file, which contains simplified syntax for deploying cloud infrastructure, such as AWS Lambda functions, infrastructure that triggers those functions with events, and additional infrastructure your AWS Lambda functions may need for various use-cases (e.g. AWS DynamoDB database tables, AWS S3 storage buckets, AWS API Gateways for recieving HTTP requests and forwarding them to AWS Lambda).

A Service can either be an entire application, logic for a specific domain (e.g. "blog", "users", "products"), or a microservice handling one task. You decide how to organize your project. Generally, we recommend starting with a monolithic approach to everything to reduce complexity, until breaking up logic is absolutely necessary.

To create and fully set up a Serverless Framework Service, use the `serverless` command, which offers an interactive set-up workflow.

```text
serverless
```

This will show you several Templates. Choose one that fits the language and use-case you want.

```text
Serverless ϟ Framework
Welcome to Serverless Framework V.4

Create a new project by selecting a Template to generate scaffolding for a specific use-case.

? Select A Template: …
❯ AWS / Node.js / Starter
  AWS / Node.js / HTTP API
  AWS / Node.js / Scheduled Task
  AWS / Node.js / SQS Worker
  AWS / Node.js / Express API
  AWS / Node.js / Express API with DynamoDB
  AWS / Python / Starter
  AWS / Python / HTTP API
  AWS / Python / Scheduled Task
  AWS / Python / SQS Worker
  AWS / Python / Flask API
  AWS / Python / Flask API with DynamoDB
  (Scroll for more)
```

After selecting a Service Template, its files will be downloaded and you will have the opportunity to give your Service a name.

```text
? Name Your Service: ›
```

Please use only lowercase letters, numbers and hyphens. Also, keep Service names short, since they are added into the name of each cloud resource the Serverless Framework creates, and some cloud resources have character length restrictions in their names.

Learn more about Services and more in the [Core Concepts documentation](https://www.serverless.com/framework/docs/providers/aws/guide/intro).

## Signing In

As of Serverless Framework V.4, if you are using the `serverless` command to set up a Service, it will eventually ask you to log in.

If you need to log in outside of that, run `serverless login`.

Logging in will redirect you to the [Serverless Framework Dashboard](https://app.serverless.com) within your browser. After registering or logging in, go back to your CLI and you will be signed in.

Please note, you can get up and running with the Serverless Framework CLI and Dashboard for free, and the CLI will always be free for small orgs and indiehackers. For more information on pricing, check out our [pricing page](https://serverless.com/pricing).

## Creating An App

The "App" concept is a parent container for one or many "Services" which you can optionally set via the `app` property in your `serverless.yml`. Setting an `app` also enables Serverless Framework Dashboard features for that Service, like tracking your Services and their deployments in Serverless Framework Dashboard, enabling sharing outputs between them, sharing secrets between them, and enabling metrics, traces and logs.

If you are using the `serverless` onboarding command, it will help you set up an `app` and add it to your Service. You can use the `serverless` command to create an App on an existing Service as well, or create an App in the Dashboard.

```text
❯ Create A New App
  ecommerce
  blog
  acmeinc
  Skip Adding An App
```

The app can also be set manually in serverless.yml via the `app` property:

```yaml
service: my-service
app: my-app
```

If you don't want to use the Serverless Framework Dashboard's features, simply don't add an `app` property. Apps are not required.

## Setting Up AWS Credentials

To deploy cloud infrastructure to AWS, you must give the Serverless Framework access to your AWS credentials.

Running the Serverless Framework's `serverless` command in a new or existing Service will help identify if AWS credentials have been set correctly or if they are expired, or help you set them up from scratch.

```text
No valid AWS Credentials were found in your environment variables or on your machine. Serverless Framework needs these to access your AWS account and deploy resources to it. Choose an option below to set up AWS Credentials.

❯ Create AWS IAM Role (Easy & Recommended)
  Save AWS Credentials in a Local Profile
  Skip & Set Later (AWS SSO, ENV Vars)
```

We recommend creating an AWS IAM Role that's stored in the Serverless Framework Dashboard. We'll be supporting a lot of Provider Credentials in the near future, and the Dashboard is a great place to keep these centralized across your team, helping you stay organized, and securely eliminating the need to keep credentials on the machines of your teammates.

If you are using AWS SSO, we recommend simply pasting your temporary SSO credentials within the terminal as environment variables.

To learn more about setting up your AWS Credentials, [read this guide](https://www.serverless.com/framework/docs/providers/aws/guide/credentials).

## Deploy A Service

After you've used the `serverless` command to set up everything, it's time to deploy your Service to AWS.

Make sure your terminal session is within the directory that contains your `serverless.yml` file. If you just created a Service, don't forget to `cd` into it.

```text
cd [your-new-service-name]
```

Deploying will create/update cloud infrastructure and code on AWS, all at the same time.

Run the `deploy` command:

```text
serverless deploy
```

More details on deploying can be found [here](https://www.serverless.com/framework/docs/providers/aws/guide/deploying).

## Developing

Many Serverless Framework and serverless developers generally choose to develop on the cloud, since it matches reality (i.e. your production environment), and emulating Lambda and other infrastructure dependencies locally can be complex.

In Serverless Framework V.4, we've created a _hybrid approach to development_, to help developers develop rapidly with the accuracy of the real cloud environment. This is the new `dev` command:

```text
serverless dev
```

When you run this command, the following happens...

An AWS Cloudformation deployment will happen to slightly modify all of the AWS Lambda functions within your Service so that they include a lightweight wrapper.

Once this AWS Cloudformation deployment has completed, your live AWS Lambda functions within your Service will still be able to receive events and be invoked within AWS.

However, the events will be securely and instantly proxied down to your machine, and the code on your machine which will be run, rather than the code within your live AWS Lambda functions.

This allows you to make changes to your code, without having to deploy or recreate every aspect of your architecture locally, allowing you to develop rapidly.

Logs from your local code will also be shown within your terminal `dev` session.

Once your code has finished, the response from your local code will be forwarded back up to your live AWS Lambda functions, and they will return the response—just like a normal AWS Lambda function in the cloud would.

Please note, `dev` is only designed for development or personal stages/environments and should not be run in production or any stage where a high volume of events are being processed.

Once you are finished with your `dev` session, you MUST re-deploy, using `serverless deploy` to push your recent local changes back to your live AWS Lambda functions—or your AWS Lambda functions will fail(!)

More details on dev mode can be found [here](https://www.serverless.com/framework/docs/providers/aws/cli-reference/dev).

## Invoking

To invoke your AWS Lambda function on the cloud, you can find URLs for your functions w/ API endpoints in the `serverless deploy` output, or retrieve them via `serverless info`. If your functions do not have API endpoints, you can use the `invoke` command, like this:

```bash
sls invoke -f hello

# Invoke and display logs:
serverless invoke -f hello --log
```

More details on the `invoke` command can be found [here](https://www.serverless.com/framework/docs/providers/aws/cli-reference/invoke).

## Deploy Functions

To deploy code changes quickly, you can skip the `serverless deploy` command which is much slower since it triggers a full AWS CloudFormation update, and deploy only code and configuration changes to a specific AWS Lambda function.

To deploy code and configuration changes to individual AWS Lambda functions in seconds, use the `deploy function` command, with `-f [function name in serverless.yml]` set to the function you want to deploy.

```text
serverless deploy function -f my-api
```

More details on the `deploy function` command can be found [here](https://www.serverless.com/framework/docs/providers/aws/cli-reference/deploy-function).

## Streaming Logs

You can use Serverless Framework to stream logs from AWS Cloudwatch directly to your terminal. Use the `sls logs` command in a separate terminal window:

```bash
sls logs -f [Function name in serverless.yml] -t
```

Target a specific function via the `-f` option and enable tailing (i.e. streaming) via the `-t` option.

## Full Local Development

Many Serverless Framework users choose to emulate their entire serverless architecture locally. Please note, emulating AWS Lambda and other cloud services is never accurate and the process can be complex, especially as your project and teammates grow. As of V.4, we highly recommend using the new `dev` mode with personal stages.

If you do choose to develop locally, we recommend the following workflow...

Use the `invoke local` command to invoke your function locally:

```bash
sls invoke local -f my-api
```

You can also pass data to this local invocation via a variety of ways. Here's one of them:

```bash
sls invoke local --function functionName --data '{"a":"bar"}'
```

More details on the `invoke local` command can be found [here](https://www.serverless.com/framework/docs/providers/aws/cli-reference/invoke-local)

Serverless Framework also has a great plugin that allows you to run a server locally and emulate AWS API Gateway. This is the `serverless-offline` command.

More details on the **serverless-offline** plugins command can be found [here](https://github.com/dherault/serverless-offline)

## Use Plugins

A big benefit of Serverless Framework is within its [Plugin ecosystem](https://serverless.com/plugins).

Plugins extend or overwrite the Serverless Framework, giving it new use-cases or capabilites, and there are hundreds of them.

Some of the most common Plugins are:

- **[Serverless Offline](https://github.com/dherault/serverless-offline)** - Emulate AWS Lambda and API Gateway locally when developing your Serverless project.
- **[Serverless Domain Manager](https://github.com/amplify-education/serverless-domain-manager)** - Manage custom domains with AWS API Gateways.
- **[Serverless Step Functions](https://github.com/serverless-operations/serverless-step-functions)** - Build AWS Step Functions architectures.
- **[Serverless Python Requirements](https://github.com/serverless/serverless-python-requirements)** - Bundle dependencies from requirements.txt and make them available in your PYTHONPATH.

## Remove Your Service

If you want to delete your service, run `remove`. This will delete all the AWS resources created by your project and ensure that you don't incur any unexpected charges. It will also remove the service from Serverless Dashboard.

```bash
serverless remove
```

More details on the `remove` command can be found [here](https://www.serverless.com/framework/docs/providers/aws/cli-reference/remove).

## What's Next

Here are some helpful resources for continuing with the Serverless Framework:

- [Study Serverless Framework's core concepts](https://www.serverless.com/framework/docs/providers/aws/guide/intro)
- [Get inspiration from these Serverless Framework templates](https://github.com/serverless/examples)
- [Discover all of the events that can trigger Lambda functions](https://www.serverless.com/framework/docs/providers/aws/guide/events)
- [Bookmark Serverless Framework's `serverless.yml` guide](https://www.serverless.com/framework/docs/providers/aws/guide/serverless.yml)
- [Search the plugins registry to extend Serverless Framework](https://www.serverless.com/plugins)
