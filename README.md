[![Serverless Application Framework AWS Lambda API Gateway](https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/images/serverless_framework_v1.gif)](http://serverless.com)

[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)
[![Build Status](https://travis-ci.org/serverless/serverless.svg?branch=master)](https://travis-ci.org/serverless/serverless)
[![npm version](https://badge.fury.io/js/serverless.svg)](https://badge.fury.io/js/serverless)
[![Coverage Status](https://coveralls.io/repos/github/serverless/serverless/badge.svg?branch=master)](https://coveralls.io/github/serverless/serverless?branch=master)
[![gitter](https://img.shields.io/gitter/room/serverless/serverless.svg)](https://gitter.im/serverless/serverless)
[![dependencies](https://img.shields.io/david/serverless/serverless.svg)](https://www.npmjs.com/package/serverless)
[![license](https://img.shields.io/npm/l/serverless.svg)](https://www.npmjs.com/package/serverless)

[Website](http://www.serverless.com) • [Docs](https://serverless.com/framework/docs/) • [Newsletter](http://eepurl.com/b8dv4P) • [Gitter](https://gitter.im/serverless/serverless) • [Forum](http://forum.serverless.com) • [Meetups](https://github.com/serverless-meetups/main) • [Twitter](https://twitter.com/goserverless)

**The Serverless Framework** – Build applications comprised of microservices that run in response to events, auto-scale for you, and only charge you when they run.  This lowers the total cost of maintaining your apps, enabling you to build more logic, faster.

The Framework uses new event-driven compute services, like AWS Lambda, Google CloudFunctions, and more.  It's a command-line tool, providing scaffolding, workflow automation and best practices for developing and deploying your serverless architecture. It's also completely extensible via plugins.

Serverless is an MIT open-source project, actively maintained by a full-time, venture-backed team.

<a href="https://serverless.com/framework/" target="_blank">Watch the video guide here.</a>

<a href="https://goo.gl/forms/4AvkCrSf5oDOytDv1" target="_blank">Serverless Framework Feedback Survey</a>

## Contents

* [Quick Start](#quick-start)
* [Services](#services)
* [Features](#features)
* [Plugins](#v1-plugins)
* [Example Projects](#v1-projects)
* [Why Serverless?](#why-serverless)
* [Contributing](#contributing)
* [Community](#community)
* [Consultants](#consultants)
* [Previous Version 0.5.x](#v.5)

## <a name="quick-start"></a>Quick Start

[Watch the video guide here](https://serverless.com/framework/) or follow the steps below to create and deploy your first serverless microservice in minutes.

* ##### Install via npm:
  * `npm install -g serverless`

* ##### Set-up your [Provider Credentials](./docs/providers/aws/guide/credentials.md)

* ##### Create a Service:
  * Creates a new Serverless Service/Project
  * `serverless create --template aws-nodejs --path my-service`
  * `cd my-service`

* ##### Or Install a Service:
  *  This is a convenience method to install a pre-made Serverless Service locally by downloading the Github repo and unzipping it.  Services are listed below.
  * `serverless install -u [GITHUB URL OF SERVICE]`

* ##### Deploy a Service:
  * Use this when you have made changes to your Functions, Events or Resources in `serverless.yml` or you simply want to deploy all changes within your Service at the same time.
  * `serverless deploy -v`

* ##### Deploy Function:
  * Use this to quickly upload and overwrite your AWS Lambda code on AWS, allowing you to develop faster.
  * `serverless deploy function -f myfunction`

* ##### Invoke a Function:
  * Invokes an AWS Lambda Function on AWS and returns logs.
  * `serverless invoke -f hello -l`

* ##### Fetch Function Logs:
  * Open up a separate tab in your console and stream all logs for a specific Function using this command.
  * `serverless logs -f hello -t`

* ##### Remove a Service:
  * Removes all Functions, Events and Resources from your AWS account.
  * `serverless remove`

Check out our in-depth [Serverless Framework Guide](./docs/providers/aws/guide/README.md) for more information.

## <a name="services"></a>Services (V1.0)

The following are services you can instantly install and use by running `serverless install --url <service-github-url>`

* [CRUD](https://github.com/pmuens/serverless-crud) - CRUD service, [Scala Port](https://github.com/jahangirmohammed/serverless-crud-scala)
* [GraphQL Boilerplate](https://github.com/serverless/serverless-graphql) - GraphQL application Boilerplate service
* [Authentication](https://github.com/laardee/serverless-authentication-boilerplate) - Authentication boilerplate service
* [Mailer](https://github.com/eahefnawy/serverless-mailer) - Service for sending emails
* [Kinesis streams](https://github.com/pmuens/serverless-kinesis-streams) - Service to showcase Kinesis stream support
* [DynamoDB streams](https://github.com/pmuens/serverless-dynamodb-streams) - Service to showcase DynamoDB stream support
* [Landingpage backend](https://github.com/pmuens/serverless-landingpage-backend) - Landingpage backend service to store E-Mail addresses
* [Facebook Messenger Chatbot](https://github.com/pmuens/serverless-facebook-messenger-bot) - Chatbot for the Facebook Messenger platform
* [Lambda chaining](https://github.com/pmuens/serverless-lambda-chaining) - Service which chains Lambdas through SNS
* [Secured API](https://github.com/pmuens/serverless-secured-api) - Service which exposes an API key accessible API
* [Authorizer](https://github.com/eahefnawy/serverless-authorizer) - Service that uses API Gateway custom authorizers
* [Thumbnails](https://github.com/eahefnawy/serverless-thumbnails) - Service that takes an image url and returns a 100x100 thumbnail
* [Boilerplate](https://github.com/eahefnawy/serverless-boilerplate) - Opinionated boilerplate
* [ES6 + Jest](https://github.com/americansystems/serverless-es6-jest) - ES6 + Jest Boilerplate

**Note**: the `serverless install` command will only work on V1.0 or later.

## <a name="features"></a>Features

* Supports Node.js, Python, Java & Scala.
* Manages the lifecycle of your serverless architecture (build, deploy, update, delete).
* Safely deploy functions, events and their required resources together via provider resource managers (e.g., AWS CloudFormation).
* Functions can be grouped ("serverless services") for easy management of code, resources & processes, across large projects & teams.
* Minimal configuration and scaffolding.
* Built-in support for multiple stages.
* Optimized for CI/CD workflows.
* Loaded with automation, optimization and best practices.
* 100% Extensible: Extend or modify the Framework and its operations via Plugins.
* An ecosystem of serverless services and plugins.
* A passionate and welcoming community!

## <a name="v1-plugins"></a>Plugins (V1.0)

Use these plugins to overwrite or extend the Framework's functionality…

* [serverless-offline](https://github.com/dherault/serverless-offline) - Emulate AWS Lambda and API Gateway locally to speed up your development cycles.
* [serverless-webpack](https://github.com/elastic-coders/serverless-webpack) - Bundle your lambdas with Webpack
* [serverless-plugin-browserify](https://github.com/doapp-ryanp/serverless-plugin-browserify) - Bundle your lambdas with Browserify
* [serverless-alexa-plugin](https://github.com/rajington/serverless-alexa-plugin) - Support Alexa Lambda events
* [serverless-optimizer](https://github.com/FidelLimited/serverless-plugin-optimize) - Bundle with Browserify, transpile with Babel to ES5 and minify with Uglify your Serverless functions.
* [serverless-run-function](https://github.com/lithin/serverless-run-function-plugin) - Run functions locally
* [serverless-plugin-write-env-vars](https://github.com/silvermine/serverless-plugin-write-env-vars)
* [serverless-plugin-multiple-responses](https://github.com/silvermine/serverless-plugin-multiple-responses)
* [serverless-build](https://github.com/nfour/serverless-build-plugin)
* [serverless-scriptable](https://github.com/wei-xu-myob/serverless-scriptable-plugin)
* [serverless-plugin-stage-variables](https://github.com/svdgraaf/serverless-plugin-stage-variables)
* [serverless-dynamodb-local](https://github.com/99xt/serverless-dynamodb-local/tree/v1)
* [serverless-wsgi](https://github.com/logandk/serverless-wsgi) - Deploy Python WSGI applications (Flask/Django etc.)
* [serverless-command-line-event-args](https://github.com/horike37/serverless-command-line-event-args) - Event json passes to your Lambda function in commandline

## <a name="v1-projects"></a>Example Projects (V1.0)

* [serverless-examples](https://github.com/andymac4182/serverless_example)
* [serverless-npm-registry](https://github.com/craftship/yith)
* [serverless-pokego](https://github.com/jch254/pokego-serverless)
* [serverless-pocket-app](https://github.com/s0enke/weekly2pocket)
* [serverless-quotebot](https://github.com/pmuens/quotebot)
* [serverless-slackbot](https://github.com/conveyal/trevorbot)
* [serverless-garden-aid](https://github.com/garden-aid/web-bff)
* [serverless-react-boilerplate](https://github.com/99xt/serverless-react-boilerplate)
* [serverless-delivery-framework](https://github.com/99xt/serverless-delivery-framework)

## <a name="why-serverless"></a>Why Serverless?

We want to make sure that you and your team don't have to manage or think about Servers in your day to day development. Through AWS Lambda and similar Function as a Service providers you can focus on building your business code without having to worry about operations. While there are of course still servers running, you don't have to think about them. This turns you into a Serverless Team and thats why we think Serverless is a fitting name.

## <a name="contributing"></a>Contributing
We love our contributors! Please read our [Contributing Document](CONTRIBUTING.md) to learn how you can start working on the Framework yourself.

Check out our [help-wanted](https://github.com/serverless/serverless/labels/help-wanted) or [help-wanted-easy](https://github.com/serverless/serverless/labels/help-wanted-easy) labels to find issues we want to move forward on with your help.

## <a name="community"></a>Community

* [Email Updates](http://eepurl.com/b8dv4P)
* [Serverless Forum](http://forum.serverless.com)
* [Gitter Chatroom](https://gitter.im/serverless/serverless)
* [Serverless Meetups](http://www.meetup.com/serverless/)
* [Stackoverflow](http://stackoverflow.com/questions/tagged/serverless-framework)
* [Facebook](https://www.facebook.com/serverless)
* [Twitter](https://twitter.com/goserverless)
* [Contact Us](mailto:hello@serverless.com)

## <a name="consultants"></a>Consultants
These consultants use the Serverless Framework and can help you build your serverless projects.
* [Trek10](https://www.trek10.com/)
* [Parallax](https://parall.ax/) – they also built the [David Guetta Campaign](https://serverlesscode.com/post/david-guetta-online-recording-with-lambda/)
* [SC5 Online](https://sc5.io)
* [Carrot Creative](https://carrot.is)
* [microapps](http://microapps.com)
* [Apiwise](http://www.apiwise.nl)
* [Useful IO](http://useful.io) - and [Hail Messaging](http://hail.io)
* [WhaleTech](https://whaletech.co/)
* [Hop Labs](http://www.hoplabs.com)
* [Webscale](https://webscale.fi/briefly-in-english/)
* [API talent](http://www.apitalent.co.nz) - who also run [Serverless-Auckland Meetup](http://www.meetup.com/Serverless-Auckland)
* [Branded Crate](https://www.brandedcrate.com/)
* [cloudonaut](https://cloudonaut.io/serverless-consulting/)
* [PromptWorks](https://www.promptworks.com/serverless/)
* [Craftship](https://craftship.io)
* [EPX Labs](http://www.epxlabs.com/) - runs [Serverless NYC Meetup](https://www.meetup.com/Serverless-NYC/)

----

# <a name="v.5"></a>Previous Serverless Version 0.5.x

Below are projects and plugins relating to version 0.5 and below. Note that these are not compatible with v1.0 but we are working diligently on updating them. [Guide on building v1.0 plugins](./docs/04-extending-serverless/01-creating-plugins.md)

You can read the v0.5.x documentation at [readme.io](https://serverless.readme.io/v0.5.0/docs).

## Projects (v0.5.x)
Serverless Projects are shareable and installable.  You can publish them to npm and install them via the Serverless Framework CLI by using `$ serverless project install <project-name>`
* [serverless-graphql](https://github.com/serverless/serverless-graphql) - Official Serverless boilerplate to kick start your project
* [serverless-starter](https://github.com/serverless/serverless-starter) - A simple boilerplate for new projects (JavaScript) with a few architectural options
* [serverless-starter-python](https://github.com/alexcasalboni/serverless-starter-python) - A simple boilerplate for new projects (Python) with a few architectural options
* [serverless-graphql-blog](https://github.com/serverless/serverless-graphql-blog) - A blog boilerplate that leverages GraphQL in front of DynamoDB to offer a minimal REST API featuring only 1 endpoint
* [serverless-authentication-boilerplate](https://github.com/laardee/serverless-authentication-boilerplate) - A generic authentication boilerplate for Serverless framework
* [sc5-serverless-boilerplate](https://github.com/SC5/sc5-serverless-boilerplate) - A boilerplate for test driven development of REST endpoints
* [MoonMail] (https://github.com/microapps/MoonMail) - Build your own email marketing infrastructure using Lambda + SES

## Plugins (v0.5.x)
Serverless is composed of Plugins.  A group of default Plugins ship with the Framework, and here are some others you can add to improve/help your workflow:
* [Meta Sync](https://github.com/serverless/serverless-meta-sync) - Securely sync your the variables in your project's `_meta/variables` across your team.
* [Hook Scripts](https://github.com/kennu/serverless-plugin-hookscripts) - Easily create shell script hooks that are run whenever Serverless actions are executed.
* [CORS](https://github.com/joostfarla/serverless-cors-plugin) - Adds support for CORS (Cross-origin resource sharing).
* [Serve](https://github.com/Nopik/serverless-serve) - Simulate API Gateway locally, so all function calls can be run via localhost.
* [Webpack](https://github.com/asprouse/serverless-webpack-plugin) - Use Webpack to optimize your Serverless Node.js Functions.
* [Serverless Client](https://github.com/serverless/serverless-client-s3) - Deploy and config a web client for your Serverless project to S3.
* [Alerting](https://github.com/martinlindenberg/serverless-plugin-alerting) - This Plugin adds Cloudwatch Alarms with SNS notifications for your Lambda functions.
* [Optimizer](https://github.com/serverless/serverless-optimizer-plugin) - Optimizes your code for performance in Lambda. Supports coffeeify, babelify and other transforms
* [CloudFormation Validator](https://github.com/tmilewski/serverless-resources-validation-plugin) - Adds support for validating your CloudFormation template.
* [Prune](https://github.com/Nopik/serverless-lambda-prune-plugin) - Delete old versions of AWS lambdas from your account so that you don't exceed the code storage limit.
* [Base-Path](https://github.com/daffinity/serverless-base-path-plugin) - Sets a base path for all API Gateway endpoints in a Component.
* [Test](https://github.com/arabold/serverless-test-plugin) - A Simple Integration Test Framework for Serverless.
* [SNS Subscribe](https://github.com/martinlindenberg/serverless-plugin-sns) - This plugin easily subscribes your lambda functions to SNS notifications.
* [JSHint](https://github.com/joostfarla/serverless-jshint-plugin) - Detect errors and potential problems in your Lambda functions.
* [ESLint](https://github.com/nishantjain91/serverless-eslint-plugin) - Detect errors and potential problems in your Lambda functions using eslint.
* [Mocha](https://github.com/SC5/serverless-mocha-plugin) - Enable test driven development by creating test cases when creating new functions
* [Function-Package](https://github.com/HyperBrain/serverless-package-plugin) - Package your lambdas without deploying to AWS.
* [Sentry](https://github.com/arabold/serverless-sentry-plugin) - Automatically send errors and exceptions to [Sentry](https://getsentry.com).
* [Auto-Prune](https://github.com/arabold/serverless-autoprune-plugin) - Delete old AWS Lambda versions.
* [Serverless Secrets](https://github.com/trek10inc/serverless-secrets) - Easily encrypt and decrypt secrets in your Serverless projects
* [Serverless DynamoDB Local](https://github.com/99xt/serverless-dynamodb-local) - Simulate DynamoDB instance locally.
* [Serverless Dependency Install](https://github.com/99xt/serverless-dependency-install) - Manage node, serverless dependencies easily within the project.
* [Serverless Header Function](https://github.com/blackevil245/serverless-header-function) - Automatically run a javascript script on every Serverless action hooks.
