[![Serverless Application Framework AWS Lambda API Gateway](https://s3.amazonaws.com/assets.github.serverless/readme-serverless-framework.gif)](https://serverless.com)

[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)
[![Build Status](https://github.com/serverless/serverless/workflows/Integrate/badge.svg)](https://github.com/serverless/serverless/actions?query=workflow%3AIntegrate)
[![npm version](https://badge.fury.io/js/serverless.svg)](https://badge.fury.io/js/serverless)
[![codecov](https://codecov.io/gh/serverless/serverless/branch/master/graph/badge.svg)](https://codecov.io/gh/serverless/serverless)
[![gitter](https://img.shields.io/gitter/room/serverless/serverless.svg)](https://gitter.im/serverless/serverless)
[![Known Vulnerabilities](https://snyk.io/test/github/serverless/serverless/badge.svg)](https://snyk.io/test/github/serverless/serverless)
[![license](https://img.shields.io/npm/l/serverless.svg)](https://www.npmjs.com/package/serverless)

[Website](http://www.serverless.com) • [Docs](https://serverless.com/framework/docs/) • [Community Slack](https://join.slack.com/t/serverless-contrib/shared_invite/zt-d5qzowja-pnOerTzAIZUrN18hWYUIHA) • [Forum](http://forum.serverless.com) • [Twitter](https://twitter.com/goserverless) • [Meetups](https://www.meetup.com/pro/serverless/) • [We're Hiring](https://serverless.com/company/jobs/) • [简体中文](./README_CN.md)

**The Serverless Framework** – Build applications on AWS Lambda and other next-gen cloud services, that auto-scale and only charge you when they run. This lowers the total cost of running and operating your apps, enabling you to build more and manage less.

The Serverless Framework is a command-line tool that uses easy and approachable YAML syntax to deploy both your code and cloud infrastructure needed to make tons of serverless application use-cases. It's a multi-language framework that supports Node.js, Typescript, Python, Go, Java, and more. It's also completely extensible via over 1,000 plugins that can add more serverless use-cases and workflows to the Framework.

Actively maintained by [Serverless Inc](https://www.serverless.com).

## Contents

- [Quick Start](#quick-start)
- [Examples](https://github.com/serverless/examples)
- [Features](#features)
- [Plugins](https://github.com/serverless/plugins)
- [Contributing](#contributing)
- [Community](#community)
- [Licensing](#licensing)
- [Previous Version 0.5.x](#v.5)

## <a name="quick-start"></a>Quick Start

### Install Via NPM:

```bash
npm install -g serverless
```

### Set Up Your AWS Account Credentials:

The Serverless Framework deploys to your own AWS account. You'll need to enable Serverless Framework to deploy to your AWS account by giving it access. [Here is a guide to help you set up your credentials securely](https://www.serverless.com/framework/docs/providers/aws/guide/credentials)

### Create A Service:

A "Service" is the Framework's project or app concept. You can create one from scratch or select an existing template by running.

```bash
serverless
```

Go through the onboarding flow and then navigate into the newly created directory.

```bash
cd my-new-service
```

### Deploy A Service:

Use this when you have made changes to your Functions, Events or Resources in `serverless.yml` or you simply want to deploy all changes within your Service at the same time.

```bash
serverless deploy
```

### Deploy A Function:

Use this to quickly upload and overwrite your AWS Lambda code on AWS, allowing you to develop faster.

```bash
serverless deploy function -f hello
```

### Invoke The Function On AWS:

Invokes an AWS Lambda Function on AWS and returns logs.

```bash
serverless invoke -f hello -l
```

### Invoke The Function Locally:

Invokes an AWS Lambda Function on your local machine and returns logs.

```bash
serverless invoke local -f hello -l
```

### Stream Function Logs:

Open up a separate tab in your console and stream all logs for a specific Function using this command.

```bash
serverless logs -f hello -t
```

### Remove The Service:

Removes all Functions, Events and Resources from your AWS account.

```bash
serverless remove
```

## <a name="features"></a>Features

- Supports Node.js, Python, Java, Go, C#, Ruby, Swift, Kotlin, PHP, Scala, & F#
- Manages the lifecycle of your serverless architecture (build, deploy, update, delete).
- Safely deploy functions, events and their required resources together via provider resource managers (e.g., AWS CloudFormation).
- Functions can be grouped ("serverless services") for easy management of code, resources & processes, across large projects & teams.
- Minimal configuration and scaffolding.
- Built-in support for multiple stages.
- Optimized for CI/CD workflows.
- Loaded with automation, optimization and best practices.
- 100% Extensible: Extend or modify the Framework and its operations via Plugins.
- An ecosystem of serverless services and plugins.
- A passionate and welcoming community!

## <a name="contributing"></a>Contributing

We love our contributors! Please read our [Contributing Document](CONTRIBUTING.md) to learn how you can start working on the Framework yourself.

Check out our [help wanted](https://github.com/serverless/serverless/labels/help%20wanted) or [good first issue](https://github.com/serverless/serverless/labels/good%20first%20issue) labels to find issues we want to move forward on with your help.

## <a name="community"></a>Community

- [Twitter](https://twitter.com/goserverless)
- [Community Slack](https://join.slack.com/t/serverless-contrib/shared_invite/zt-d5qzowja-pnOerTzAIZUrN18hWYUIHA)
- [Gitter Chatroom](https://gitter.im/serverless/serverless)
- [Serverless Meetups](http://www.meetup.com/serverless/)
- [Stackoverflow](http://stackoverflow.com/questions/tagged/serverless-framework)
- [Facebook](https://www.facebook.com/serverless)
- [Contact Us](mailto:hello@serverless.com)

## <a name="licensing"></a>Licensing

Serverless is licensed under the [MIT License](./LICENSE.txt).

All files located in the node_modules and external directories are externally maintained libraries used by this software which have their own licenses; we recommend you read them, as their terms may differ from the terms in the MIT License.

# <a name="v.5"></a>Previous Serverless Version 0.5.x

You can read the v0.5.x documentation at [readme.io](https://serverless.readme.io/v0.5.0/docs).
