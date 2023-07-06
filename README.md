[![Serverless Application Framework AWS Lambda API Gateway](https://s3.amazonaws.com/assets.github.serverless/readme-serverless-framework.gif)](https://serverless.com)

[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)
[![Build Status](https://github.com/serverless/serverless/workflows/Integrate/badge.svg)](https://github.com/serverless/serverless/actions?query=workflow%3AIntegrate)
[![npm version](https://badge.fury.io/js/serverless.svg)](https://badge.fury.io/js/serverless)
[![codecov](https://codecov.io/gh/serverless/serverless/branch/master/graph/badge.svg)](https://codecov.io/gh/serverless/serverless)
[![gitter](https://img.shields.io/gitter/room/serverless/serverless.svg)](https://gitter.im/serverless/serverless)
[![Known Vulnerabilities](https://snyk.io/test/github/serverless/serverless/badge.svg)](https://snyk.io/test/github/serverless/serverless)
[![license](https://img.shields.io/npm/l/serverless.svg)](https://www.npmjs.com/package/serverless)

[Website](http://www.serverless.com) • [Docs](https://serverless.com/framework/docs/) • [Community Slack](https://serverless.com/slack) • [Forum](http://forum.serverless.com) • [Twitter](https://twitter.com/goserverless) • [Meetups](https://www.meetup.com/pro/serverless/)

**The Serverless Framework** – Build applications on AWS Lambda and other next-gen cloud services, that auto-scale and only charge you when they run. This lowers the total cost of running and operating your apps, enabling you to build more and manage less.

The Serverless Framework is a command-line tool with an easy and approachable YAML syntax to deploy both your code and cloud infrastructure needed to make tons of serverless application use-cases. It's a multi-language framework that supports Node.js, Typescript, Python, Go, Java, and more. It's also completely extensible via over 1,000 plugins which add more serverless use-cases and workflows to the Framework.

Actively maintained by [Serverless Inc](https://www.serverless.com).

# Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Plugins](https://github.com/serverless/plugins)
- [Contributing](#contributing)
- [Community](#community)
- [Licensing](#licensing)

# <a name="features"></a>Features

- **Hyper-Productive** - Build more and manage less with serverless architectures.
- **Multiple Use-Cases** - Choose from tons of efficient serverless use-cases (APIs, Scheduled Tasks, Event Handlers, Streaming Data Pipelines, Web Sockets & more).
- **Infra & Code** - Deploys both code and infrastructure together, resulting in out-of-the-box serverless apps.
- **Easy** - Enjoy simple syntax to safely deploy deploy AWS Lambda functions, event sources and more without being a cloud expert.
- **Multi-Language** - Supports Node.js, Python, Java, Go, C#, Ruby, Swift, Kotlin, PHP, Scala, & F#
- **Full Lifecycle** - Manages the lifecycle of your serverless architecture (build, deploy, update, monitor, troubleshoot).
- **Multi-Domains** - Group domains into Serverless Services for easy management of code, resources & processes, across large projects & teams.
- **Multi-Environments** - Built-in support for multiple stages (e.g. development, staging, production).
- **Guardrails** - Loaded with automation, optimization and best practices.
- **Extensible** - Extend or modify the Framework and its operations via Plugins.
- **Plugin Ecosystem** - Extend or modify the Framework and its operations via Plugins.
- **Welcoming** - A passionate and welcoming community!

# <a name="quick-start"></a>Quick Start

Here's how to get started quickly, as well as some recommended development workflows.

## Installation

Install `serverless` module via NPM:

```bash
npm install -g serverless
```

_If you don’t already have Node.js on your machine, [install it first](https://nodejs.org/). If you don't want to install Node or NPM, you can [install **serverless** as a standalone binary](https://www.serverless.com/framework/docs/install-standalone)._

## Creating A Service

To create your first project (known as a Serverless Framework "Service"), run the `serverless` command below, then follow the prompts.

```bash
# Create a new serverless project
serverless

# Move into the newly created directory
cd your-service-name
```

The `serverless` command will guide you to:

1. Create a new project
2. Configure your [AWS credentials](https://serverless.com/framework/docs/providers/aws/guide/credentials/)
3. Optionally set up a free Serverless Framework account with additional features.

Your new serverless project will contain a `serverless.yml` file. This file features simple syntax for deploying infrastructure to AWS, such as AWS Lambda functions, infrastructure that triggers those functions with events, and additional infrastructure your AWS Lambda functions may need for various use-cases. You can learn more about this in the [Core Concepts documentation](https://www.serverless.com/framework/docs/providers/aws/guide/intro).

The `serverless` command will give you a variety of templates to choose from. If those do not fit your needs, check out the [project examples from Serverless Inc. and our community](https://github.com/serverless/examples). You can install any example by passing a GitHub URL using the `--template-url` option:

```base
serverless --template-url=https://github.com/serverless/examples/tree/v3/...
```

Please note that you can use `serverless` or `sls` to run Serverless Framework commands.

## Deploying

If you haven't done so already within the `serverless` command, you can deploy the project at any time by running:

```bash
sls deploy
```

The deployed AWS Lambda functions and other essential information such as API Endpoint URLs will be displayed in the command output.

More details on deploying can be found [here](https://www.serverless.com/framework/docs/providers/aws/guide/deploying).

## Developing On The Cloud

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

## Developing Locally

Many Serverless Framework users rely on local emulation to develop more quickly. Please note, emulating AWS Lambda and other cloud services is never accurate and the process can be complex. We recommend the following workflow to develop locally...

Use the `invoke local` command to invoke your function locally:

```bash
sls invoke local -f my-api
```

You can also pass data to this local invocation via a variety of ways. Here's one of them:

```bash
serverless invoke local --function functionName --data '{"a":"bar"}'
```

More details on the `invoke local` command can be found [here](https://www.serverless.com/framework/docs/providers/aws/cli-reference/invoke-local)

Serverless Framework also has a great plugin that allows you to run a server locally and emulate AWS API Gateway. This is the `serverless-offline` command.

More details on the **serverless-offline** plugins command can be found [here](https://github.com/dherault/serverless-offline)

## Monitoring, Secrets & Collaboration

If you're looking for easy, out-of-the-box monitoring, secrets management and collaboration features, sign into the Serverless Framework Dashboard. It's free!

```bash
sls login
```

## Remove your service

If you want to delete your service, run `remove`. This will delete all the AWS resources created by your project and ensure that you don't incur any unexpected charges. It will also remove the service from Serverless Dashboard.

```bash
sls remove
```

More details on the `remove` command can be found [here](https://www.serverless.com/framework/docs/providers/aws/cli-reference/remove).

## What's Next

Here are some helpful resources for continuing with the Serverless Framework:

- [Study Serverless Framework's core concepts](https://www.serverless.com/framework/docs/providers/aws/guide/intro)
- [Get inspiration from these Serverless Framework templates](https://github.com/serverless/examples)
- [Discover all of the events that can trigger Lambda functions](https://www.serverless.com/framework/docs/providers/aws/guide/events)
- [Bookmark Serverless Framework's `serverless.yml` guide](https://www.serverless.com/framework/docs/providers/aws/guide/serverless.yml)
- [Search the plugins registry to extend Serverless Framework](https://www.serverless.com/plugins)

# <a name="contributing"></a>Contributing

We love our contributors! Please read our [Contributing Document](CONTRIBUTING.md) to learn how you can start working on the Framework yourself.

Check out our [help wanted](https://github.com/serverless/serverless/labels/help%20wanted) or [good first issue](https://github.com/serverless/serverless/labels/good%20first%20issue) labels to find issues we want to move forward on with your help.

# <a name="community"></a>Community

- [Twitter](https://twitter.com/goserverless)
- [Community Slack](https://serverless.com/slack)
- [Serverless Meetups](http://www.meetup.com/serverless/)
- [Stackoverflow](http://stackoverflow.com/questions/tagged/serverless-framework)
- [Facebook](https://www.facebook.com/serverless)
- [Contact Us](mailto:hello@serverless.com)

# <a name="licensing"></a>Licensing

Serverless is licensed under the [MIT License](./LICENSE.txt).

All files located in the node_modules and external directories are externally maintained libraries used by this software which have their own licenses; we recommend you read them, as their terms may differ from the terms in the MIT License.
