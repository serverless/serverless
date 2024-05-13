<!--
title: Setting Up Serverless Framework With AWS
layout: Doc
-->

# Setting Up Serverless Framework With AWS

Here's how to install the Serverless Framework, set up a project and deploy it to Amazon Web Services on serverless infrastructure like AWS Lambda, AWS DynamoDB, AWS S3 and more.

## Installation

As of version 4, the Serverless Framework Command Line Interface is packaged as a binary, which can be installed via two ways.

### Install the Serverless Framework via NPM

If you have the [Node.js runtime](https://nodejs.org) installed, you can install the Serverless Framework via NPM.

Open your CLI and run the command below to install the Serverless Framework globally.

```text
npm i serverless -g
```

Run `serverless` to verify your installation is working.

### Install the Serverless Framework via CURL

This option is best if you don't have/want to use the Node.js runtime and its package manager, NPM.

Open your CLI and run the command below to install the Serverless Framework.

```text
curl -o- -L https://install.serverless.com | bash
```

This will install the binary within your home directory (`~/.serverless/binaries`), create symbolic links for `serverless` and `sls`, and update your shell configuration file (`.zshrc`, `.bashrc`, `.bash_profile`, `.bash_login`, or `.profile`) to include the binary directory in the $PATH, allowing the `serverless` or `sls` command to be run from any location in the terminal.

Run `serverless` to verify your installation is working.

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

## The Serverless Command

The Serverless Framework ships with a `serverless` command that walks you through getting a project created and deployed onto AWS. It helps with downloading a Template, setting up AWS Credentials, setting up the Serverless Framework Dashboard, and more, while explaining each concept along the way.

This guide will also walk you through getting started with the Serverless Framework, but please note, simply typing the `serverless` command may be the superior experience.

```text
serverless
```

## Create A Service

The primary concept for a project in the Serverless Framework is known as a "Service", and its declared by a `serverless.yml` file, which contains simplified syntax for deploying cloud infrastructure. A Service can either be an entire application, logic for a specific domain (e.g. "blog", "users", "products"), or a microservice handling one task. Generally, we recommend starting with a monolithic approach to everything to reduce complexity, until breaking up logic is absolutely necessary.

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

## Signing In

If you are using the `serverless` command to set up a Service, it will eventually ask you to log in. 

If you need to log in outside of that, run `serverless login`.

Logging in will redirect you to the [Serverless Framework Dashboard](https://app.serverless.com) within your browser. After registering or logging in, go back to your CLI and you will be signed in.

## Creating An App

The "App" concept is a parent container for one or many "Services" which you can optionally set via the `app` property in your `serverless.yml`. Setting an `app` also enables Serverless Framework Dashboard features for that Service, like tracking your Services and their deployments in Serverless Framework Dashboard, enabling sharing outputs between them, sharing secrets between them, and enabling metrics, traces and logs.

If you are using the `serverless` onboarding command, it will help you set up an `app` and add it to your Service.

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

If you don't want to use Serverless Framework Dashboard, Apps are not required.

## Setting Up AWS Credentials

To deploy cloud infrastructure to AWS, you must set up your AWS credentials.

Running the Serverless Framework's `serverless` command in a new or existing Service will help identify if AWS credentials have been set correctly or if they are expired, or help you set them up from scratch.

```text
No valid AWS Credentials were found in your environment variables or on your machine. Serverless Framework needs these to access your AWS account and deploy resources to it. Choose an option below to set up AWS Credentials.

❯ Create AWS IAM Role (Easy & Recommended)
  Save AWS Credentials in a Local Profile
  Skip & Set Later (AWS SSO, ENV Vars)
```

To learn more about setting up your AWS Credentials, [read this guide](https://www.serverless.com/framework/docs/providers/aws/guide/credentials)

If you are using AWS SSO, we recommend simply pasting your temporary SSO credentials within the terminal as environment variables.

## Deploy A Service

Make sure your terminal session is within the directory that contains your `serverless.yml` file.

which you can set up AWS credentials a few ways. You can simply add them as environment variables, which is best if you're using AWS SSO. You can have the Serverless Framework Platform store an AWS IAM Role for you and your team to share and assign to specific Stages, or you can persist long-term credentials to an AWS Profile on your local machine. We recommend the first two options.

After onboarding, move into the newly created directory.

```
cd [your-new-project-name]
```

Your new project will contain a `serverless.yml` file with simple syntax for deploying infrastructure to AWS, such as AWS Lambda functions, infrastructure that triggers those functions with events, and additional infrastructure your AWS Lambda functions may need for various use-cases. Learn more about this in the [Core Concepts documentation](https://www.serverless.com/framework/docs/providers/aws/guide/intro).

<br/>

## Deploy to AWS

Run the `deploy` command to deploy your project to AWS. Note, you can use `serverless` or `sls` as the command prompt.

```bash
sls deploy
```

The deployed AWS Lambda functions and other essential information such as API Endpoint URLs will be displayed in the command output.

More details on deploying can be found [here](https://www.serverless.com/framework/docs/providers/aws/guide/deploying).

<br/>

## Develop On The Cloud

Many Serverless Framework users choose to develop on the cloud, since it matches reality and emulating Lambda locally can be complex. To develop on the cloud quickly, without sacrificing speed, we recommend the following workflow...

To deploy code changes quickly, skip the `serverless deploy` command which is much slower since it triggers a full AWS CloudFormation update. Instead, deploy code and configuration changes to individual AWS Lambda functions in seconds via the `deploy function` command, with `-f [function name in serverless.yml]` set to the function you want to deploy.

```bash
sls deploy function -f my-api
```

More details on the `deploy function` command can be found [here](https://www.serverless.com/framework/docs/providers/aws/cli-reference/deploy-function).

To invoke your AWS Lambda function on the cloud, you can find URLs for your functions w/ API endpoints in the `serverless deploy` output, or retrieve them via `serverless info`. If your functions do not have API endpoints, you can use the `invoke` command, like this:

```bash
sls invoke -f hello

# Invoke and display logs:
serverless invoke -f hello --log
```

More details on the `invoke` command can be found [here](https://www.serverless.com/framework/docs/providers/aws/cli-reference/invoke).

To stream your logs while you work, use the `sls logs` command in a separate terminal window:

```bash
sls logs -f [Function name in serverless.yml] -t
```

Target a specific function via the `-f` option and enable streaming via the `-t` option.

<br/>

## Develop Locally

Many Serverless Framework users rely on local emulation to develop more quickly. Please note, emulating AWS Lambda and other cloud services is never accurate and the process can be complex. We recommend the following workflow to develop locally...

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

<br/>

## Use Plugins

A big benefit of Serverless Framework is within its [Plugin ecosystem](https://serverless.com/plugins).

Plugins extend or overwrite the Serverless Framework, giving it new use-cases or capabilites, and there are hundreds of them.

Some of the most common Plugins are:

- **[Serverless Offline](https://github.com/dherault/serverless-offline)** - Emulate AWS Lambda and API Gateway locally when developing your Serverless project.
- **[Serverless ESBuild](https://github.com/floydspace/serverless-esbuild)** - Bundles JavaScript and TypeScript extremely fast via esbuild.
- **[Serverless Domain Manager](https://github.com/amplify-education/serverless-domain-manager)** - Manage custom domains with AWS API Gateways.
- **[Serverless Step Functions](https://github.com/serverless-operations/serverless-step-functions)** - Build AWS Step Functions architectures.
- **[Serverless Python Requirements](https://github.com/serverless/serverless-python-requirements)** - Bundle dependencies from requirements.txt and make them available in your PYTHONPATH.

## Remove Your Service

If you want to delete your service, run `remove`. This will delete all the AWS resources created by your project and ensure that you don't incur any unexpected charges. It will also remove the service from Serverless Dashboard.

```bash
sls remove
```

More details on the `remove` command can be found [here](https://www.serverless.com/framework/docs/providers/aws/cli-reference/remove).

<br/>

## What's Next

Here are some helpful resources for continuing with the Serverless Framework:

- [Study Serverless Framework's core concepts](https://www.serverless.com/framework/docs/providers/aws/guide/intro)
- [Get inspiration from these Serverless Framework templates](https://github.com/serverless/examples)
- [Discover all of the events that can trigger Lambda functions](https://www.serverless.com/framework/docs/providers/aws/guide/events)
- [Bookmark Serverless Framework's `serverless.yml` guide](https://www.serverless.com/framework/docs/providers/aws/guide/serverless.yml)
- [Search the plugins registry to extend Serverless Framework](https://www.serverless.com/plugins)
