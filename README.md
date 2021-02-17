⚡ **Serverless Inc. is hiring to build the next generation of serverless development tools, [join us!](https://www.serverless.com/company/jobs/)**

---

[![Serverless Application Framework AWS Lambda API Gateway](https://s3.amazonaws.com/assets.github.serverless/readme-serverless-framework.gif)](http://serverless.com)

[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)
[![Build Status](https://github.com/serverless/serverless/workflows/Integrate/badge.svg)](https://github.com/serverless/serverless/actions?query=workflow%3AIntegrate)
[![npm version](https://badge.fury.io/js/serverless.svg)](https://badge.fury.io/js/serverless)
[![codecov](https://codecov.io/gh/serverless/serverless/branch/master/graph/badge.svg)](https://codecov.io/gh/serverless/serverless)
[![gitter](https://img.shields.io/gitter/room/serverless/serverless.svg)](https://gitter.im/serverless/serverless)
[![Known Vulnerabilities](https://snyk.io/test/github/serverless/serverless/badge.svg)](https://snyk.io/test/github/serverless/serverless)
[![license](https://img.shields.io/npm/l/serverless.svg)](https://www.npmjs.com/package/serverless)

<p align="center">
  <span>English</span> |
  <a href="./README_CN.md">简体中文</a>
</p>

[Website](http://www.serverless.com) • [Docs](https://serverless.com/framework/docs/) • [Newsletter](https://serverless.com/subscribe/) • [Swag](https://teespring.com/stores/serverless) • [Gitter](https://gitter.im/serverless/serverless) • [Forum](http://forum.serverless.com) • [Meetups](https://www.meetup.com/pro/serverless/) • [Twitter](https://twitter.com/goserverless) • [We're Hiring](https://serverless.com/company/jobs/) • [Try Pro](https://dashboard.serverless.com)

**The Serverless Framework** – Build applications comprised of microservices that run in response to events, auto-scale for you, and only charge you when they run. This lowers the total cost of maintaining your apps, enabling you to build more logic, faster.

The Framework uses new event-driven compute services, like AWS Lambda, Google Cloud Functions, and more. It's a command-line tool, providing scaffolding, workflow automation and best practices for developing and deploying your serverless architecture. It's also completely extensible via plugins.

Check out the [Serverless Framework Dashboard](https://app.serverless.com) for monitoring, troubleshooting, ci/cd and more features for serverless teams.

Serverless is actively maintained by [Serverless Inc](https://www.serverless.com).

## Contents

<img align="right" width="400" src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/email/sls-getting-started.gif" />

- [Quick Start](#quick-start)
- [Examples](https://github.com/serverless/examples)
- [Services](#services)
- [Features](#features)
- [Plugins](https://github.com/serverless/plugins)
- [Contributing](#contributing)
- [Community](#community)
- [Consultants](#consultants)
- [Licensing](#licensing)
- [Previous Version 0.5.x](#v.5)

## <a name="quick-start"></a>Quick Start

1. **Install via npm:**

```bash
npm install -g serverless
```

2. **Set-up your [Provider Credentials](./docs/providers/aws/guide/credentials.md)**. [Watch the video on setting up credentials](https://www.youtube.com/watch?v=HSd9uYj2LJA)

3. **Create a Service:**

You can create a new service or [install existing services](#how-to-install-a-service).

```bash
# Create a new Serverless Service/Project
serverless create --template aws-nodejs --path my-service
# Change into the newly created directory
cd my-service
```

4. **Deploy a Service:**

Use this when you have made changes to your Functions, Events or Resources in `serverless.yml` or you simply want to deploy all changes within your Service at the same time.

```bash
serverless deploy -v
```

5. **Deploy the Function:**

Use this to quickly upload and overwrite your AWS Lambda code on AWS, allowing you to develop faster.

```bash
serverless deploy function -f hello
```

6. **Invoke the Function on AWS:**

Invokes an AWS Lambda Function on AWS and returns logs.

```bash
serverless invoke -f hello -l
```

7. **Invoke the Function on your machine:**

Invokes an AWS Lambda Function on your local machine and returns logs.

```bash
serverless invoke local -f hello -l
```

8. **Fetch the Function Logs:**

Open up a separate tab in your console and stream all logs for a specific Function using this command.

```bash
serverless logs -f hello -t
```

9. **Remove the Service:**

Removes all Functions, Events and Resources from your AWS account.

```bash
serverless remove
```

### How to Install a Service:

This is a convenience method to install a pre-made Serverless Service locally by downloading the Github repo and unzipping it. Services are listed below.

```bash
serverless install -u https://github.com/your-url-to-the-serverless-service
```

Check out the [Serverless Framework Guide](./docs/providers/aws/guide/README.md) for more information.

## <a name="services"></a>Services (V1.0)

The following are services you can instantly install and use by running `serverless install --url <service-github-url>`

- [serverless-examples](https://github.com/serverless/examples)
- [CRUD](https://github.com/pmuens/serverless-crud) - CRUD service, [Scala Port](https://github.com/jahangirmohammed/serverless-crud-scala)
- [CRUD with FaunaDB](https://github.com/faunadb/serverless-crud) - CRUD service using FaunaDB
- [CRUD with S3](https://github.com/tscanlin/serverless-s3-crud) - CRUD service using S3
- [CRUD with Flask and SQLAlchemy](https://github.com/jetbridge/sls-flask) - Python [CRUD API service](https://blog.jetbridge.com/framework/) with Flask, SQLAlchemy and Swagger
- [GraphQL Boilerplate](https://github.com/serverless/serverless-graphql) - GraphQL application Boilerplate service
- [Authentication](https://github.com/laardee/serverless-authentication-boilerplate) - Authentication boilerplate service
- [Mailer](https://github.com/eahefnawy/serverless-mailer) - Service for sending emails
- [Kinesis streams](https://github.com/pmuens/serverless-kinesis-streams) - Service to showcase Kinesis stream support
- [DynamoDB streams](https://github.com/pmuens/serverless-dynamodb-streams) - Service to showcase DynamoDB stream support
- [Landingpage backend](https://github.com/pmuens/serverless-landingpage-backend) - Landingpage backend service to store E-Mail addresses
- [Facebook Messenger Chatbot](https://github.com/pmuens/serverless-facebook-messenger-bot) - Chatbot for the Facebook Messenger platform
- [Lambda chaining](https://github.com/pmuens/serverless-lambda-chaining) - Service which chains Lambdas through SNS
- [Secured API](https://github.com/pmuens/serverless-secured-api) - Service which exposes an API key accessible API
- [Authorizer](https://github.com/eahefnawy/serverless-authorizer) - Service that uses API Gateway custom authorizers
- [Thumbnails](https://github.com/eahefnawy/serverless-thumbnails) - Service that takes an image url and returns a 100x100 thumbnail
- [Boilerplate](https://github.com/eahefnawy/serverless-boilerplate) - Opinionated boilerplate
- [ES6 + Jest](https://github.com/americansystems/serverless-es6-jest) - ES6 + Jest Boilerplate
- [PHP](https://github.com/ZeroSharp/serverless-php) - Call a PHP function from your lambda
- [Ruby](https://github.com/stewartlord/serverless-ruby) - Call a Ruby function from your lambda
- [Slack App](https://github.com/johnagan/serverless-slack-app) - Slack App Boilerplate with OAuth and Bot actions
- [Swift](https://github.com/choefele/swift-lambda-app) - Full-featured project template to develop Lambda functions in Swift
- [Cloudwatch Alerts on Slack](https://github.com/dav009/serverless-aws-alarms-notifier) - Get AWS Cloudwatch alerts notifications on Slack

**Note**: the `serverless install` command will only work on V1.0 or later.

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

- [Email Updates](http://eepurl.com/b8dv4P)
- [Serverless Forum](http://forum.serverless.com)
- [Gitter Chatroom](https://gitter.im/serverless/serverless)
- [Serverless Meetups](http://www.meetup.com/serverless/)
- [Stackoverflow](http://stackoverflow.com/questions/tagged/serverless-framework)
- [Facebook](https://www.facebook.com/serverless)
- [Twitter](https://twitter.com/goserverless)
- [Contact Us](mailto:hello@serverless.com)

## <a name="consultants"></a>Consultants

We recommend the following professional services organizations who are experts in serverless development:

- [Serverless Guru](https://serverlessguru.com/)
- [Antstack](https://www.antstack.io/)
- [Theodo](https://www.theodo.co.uk) - full stack teams passionate about Serverless that also run the Serverless Transformation Newsletter & Blog.
- [null](https://null.tc/) - maintains [Bref](https://bref.sh/) to create serverless PHP applications
- [Nordcloud](https://nordcloud.com) - they created [several plugins](https://github.com/nordcloud?utf8=%E2%9C%93&q=serverless&type=&language=), sponsor [Serverless Days Helsinki](https://helsinki.serverlessdays.io/) and regularly host [Serverless Finland](https://www.meetup.com/Serverless-Finland/) Meetups.
- [API talent](http://www.apitalent.co.nz) - who also run [Serverless-Auckland Meetup](http://www.meetup.com/Serverless-Auckland)
- [EPX Labs](http://www.epxlabs.com/) - runs [Serverless NYC Meetup](https://www.meetup.com/Serverless-NYC/)
- [Seraro](http://www.seraro.com/) - Who also runs Atlanta Serverless Meetup (https://www.meetup.com/Atlanta-CABI-Camp-Cloud-AI-Blockchain-IOT) and Delhi Serverless Meetup (https://www.meetup.com/Delhi-NCR-Serverless-Architecture-Meetup/)
- [superluminar](https://superluminar.io) - runs serverlessdays Hamburg and Serverless Meetup Hamburg
- [JetBridge](https://jetbridge.com) - cloud-native and serverless application development services.

If you'd like to be featured here, [please contact us](mailto:hello@serverless.com).

---

## <a name="licensing"></a>Licensing

Serverless is licensed under the [MIT License](./LICENSE.txt).

All files located in the node_modules and external directories are externally maintained libraries used by this software which have their own licenses; we recommend you read them, as their terms may differ from the terms in the MIT License.

# <a name="v.5"></a>Previous Serverless Version 0.5.x

You can find projects and plugins relating to version 0.5 [here](./0.5.x-RESOURCES.md). Note that these are not compatible with v1.0 but we are working diligently on updating them. [Guide on building v1.0 plugins](./docs/providers/aws/guide/plugins.md).

You can read the v0.5.x documentation at [readme.io](https://serverless.readme.io/v0.5.0/docs).
