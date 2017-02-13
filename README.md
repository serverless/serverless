[![Serverless Application Framework AWS Lambda API Gateway](https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/images/serverless_framework_v1_d.gif)](http://serverless.com)

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
* [Examples](https://github.com/serverless/examples)
* [Services](#services)
* [Features](#features)
* [Plugins](#v1-plugins)
* [Example Projects](#v1-projects)
* [Contributing](#contributing)
* [Community](#community)
* [Consultants](#consultants)
* [Previous Version 0.5.x](#v.5)

## <a name="quick-start"></a>Quick Start

[Watch the video guide here](https://serverless.com/framework/) or follow the steps below to create and deploy your first serverless microservice in minutes.

1. **Install via npm:**
  ```bash
  npm install -g serverless
  ```

2. **Set-up your [Provider Credentials](./docs/providers/aws/guide/credentials.md)**

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

6. **Invoke the Function:**

  Invokes an AWS Lambda Function on AWS and returns logs.
  ```bash
  serverless invoke -f hello -l
  ```

7. **Fetch the Function Logs:**

  Open up a separate tab in your console and stream all logs for a specific Function using this command.
  ```bash
  serverless logs -f hello -t
  ```

8. **Remove the Service:**

  Removes all Functions, Events and Resources from your AWS account.
  ```bash
  serverless remove
  ```

### How to Install a Service:

This is a convenience method to install a pre-made Serverless Service locally by downloading the Github repo and unzipping it.  Services are listed below.

```bash
serverless install -u https://github.com/your-url-to-the-serverless-service
```

Check out the [Serverless Framework Guide](./docs/providers/aws/guide/README.md) for more information.

## <a name="services"></a>Services (V1.0)

The following are services you can instantly install and use by running `serverless install --url <service-github-url>`

* [serverless-examples](https://github.com/serverless/examples)
* [CRUD](https://github.com/pmuens/serverless-crud) - CRUD service, [Scala Port](https://github.com/jahangirmohammed/serverless-crud-scala)
* [CRUD with FaunaDB](https://github.com/faunadb/serverless-crud) - CRUD service using FaunaDB
* [CRUD with S3](https://github.com/tscanlin/serverless-s3-crud) - CRUD service using S3
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
* [PHP](https://github.com/ZeroSharp/serverless-php) - Call a PHP function from your lambda
* [Slack App](https://github.com/johnagan/serverless-slack-app) - Slack App Boilerplate with OAuth and Bot actions
* [Swift](https://github.com/choefele/swift-lambda-app) - Full-featured project template to develop Lambda functions in Swift

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

Use these plugins to extend or overwrite the Framework's functionality...

<!-- AUTO-GENERATED-CONTENT:START (GENERATE_SERVERLESS_PLUGIN_TABLE)
This table is generated from https://github.com/serverless/plugins/blob/master/plugins.json please make additions there
-->
| Plugin | Author |
|:-------|:------:|
| **[Raml Serverless](https://github.com/andrewcurioso/raml-serverless)** <br/> Serverless plugin to work with RAML API spec documents | [andrewcurioso](http://github.com/andrewcurioso) | 
| **[Serverless Alexa Plugin](https://github.com/rajington/serverless-alexa-plugin)** <br/> Serverless plugin to support Alexa Lambda events | [rajington](http://github.com/rajington) | 
| **[Serverless Aws Documentation](https://github.com/9cookies/serverless-aws-documentation)** <br/> Serverless plugin to add documentation and models to the serverless generated API Gateway | [9cookies](http://github.com/9cookies) | 
| **[Serverless Build Plugin](https://github.com/nfour/serverless-build-plugin)** <br/> A Node.js focused build plugin for serverless. | [nfour](http://github.com/nfour) | 
| **[Serverless Coffeescript](https://github.com/duanefields/serverless-coffeescript)** <br/> A Serverless plugin to compile your CoffeeScript into JavaScript at deployment | [duanefields](http://github.com/duanefields) | 
| **[Serverless Command Line Event Args](https://github.com/horike37/serverless-command-line-event-args)** <br/> This module is Serverless Framework plugin. Event JSON passes to your Lambda function in commandline. | [horike37](http://github.com/horike37) | 
| **[Serverless Crypt](https://github.com/marcy-terui/serverless-crypt)** <br/> Securing the secrets on Serverless Framework by AWS KMS encryption. | [marcy-terui](http://github.com/marcy-terui) | 
| **[Serverless Dotnet](https://github.com/fruffin/serverless-dotnet)** <br/> A serverless plugin to run 'dotnet' commands as part of the deploy process | [fruffin](http://github.com/fruffin) | 
| **[Serverless Dynamodb Local](https://github.com/99xt/serverless-dynamodb-local)** <br/> Serverless Dynamodb Local Plugin - Allows to run dynamodb locally for serverless | [99xt](http://github.com/99xt) | 
| **[Serverless Enable Api Logs](https://github.com/paulSambolin/serverless-enable-api-logs)** <br/> Enables Cloudwatch logging for API Gateway events | [paulSambolin](http://github.com/paulSambolin) | 
| **[Serverless Event Constant Inputs](https://github.com/dittto/serverless-event-constant-inputs)** <br/> Allows you to add constant inputs to events in Serverless 1.0. For more info see [constant values in Cloudwatch](https://aws.amazon.com/blogs/compute/simply-serverless-use-constant-values-in-cloudwatch-event-triggered-lambda-functions/) | [dittto](http://github.com/dittto) | 
| **[Serverless Jest Plugin](https://github.com/SC5/serverless-jest-plugin)** <br/> A Serverless Plugin for the Serverless Framework which adds support for test-driven development using Jest | [SC5](http://github.com/SC5) | 
| **[Serverless Mocha Plugin](https://github.com/SC5/serverless-mocha-plugin)** <br/> A Serverless Plugin for the Serverless Framework which adds support for test-driven development using Mocha | [SC5](http://github.com/SC5) | 
| **[Serverless Offline](https://github.com/dherault/serverless-offline)** <br/> Emulate AWS λ and API Gateway locally when developing your Serverless project | [dherault](http://github.com/dherault) | 
| **[Serverless Plugin Aws Alerts](https://github.com/ACloudGuru/serverless-plugin-aws-alerts)** <br/> A Serverless plugin to easily add CloudWatch alarms to functions | [ACloudGuru](http://github.com/ACloudGuru) | 
| **[Serverless Plugin Bind Deployment Id](https://github.com/jacob-meacham/serverless-plugin-bind-deployment-id)** <br/> A Serverless plugin to bind the randomly generated deployment resource to your custom resources | [jacob-meacham](http://github.com/jacob-meacham) | 
| **[Serverless Plugin Browserify](https://github.com/doapp-ryanp/serverless-plugin-browserify)** <br/> Speed up your node based lambda's | [doapp-ryanp](http://github.com/doapp-ryanp) | 
| **[Serverless Plugin Cfauthorizer](https://github.com/SC5/serverless-plugin-cfauthorizer)** <br/> This plugin allows you to define your own API Gateway Authorizers as the Serverless CloudFormation resources and apply them to HTTP endpoints. | [SC5](http://github.com/SC5) | 
| **[Serverless Plugin Cloudwatch Sumologic](https://github.com/ACloudGuru/serverless-plugin-cloudwatch-sumologic)** <br/> Plugin which auto-subscribes a log delivery lambda function to lambda log groups created by serverless | [ACloudGuru](http://github.com/ACloudGuru) | 
| **[Serverless Plugin Diff](https://github.com/nicka/serverless-plugin-diff)** <br/> Compares your local AWS CloudFormation templates against deployed ones. | [nicka](http://github.com/nicka) | 
| **[Serverless Plugin External Sns Events](https://github.com/silvermine/serverless-plugin-external-sns-events)** <br/> Add ability for functions to use existing or external SNS topics as an event source | [silvermine](http://github.com/silvermine) | 
| **[Serverless Plugin Graphiql](https://github.com/bencooling/serverless-plugin-graphiql)** <br/> A Serverless plugin to run a local http server for graphiql and your graphql handler | [bencooling](http://github.com/bencooling) | 
| **[Serverless Plugin Include Dependencies](https://github.com/dougmoscrop/serverless-plugin-include-dependencies)** <br/> This is a Serverless plugin that should make your deployed functions smaller. | [dougmoscrop](http://github.com/dougmoscrop) | 
| **[Serverless Plugin Multiple Responses](https://github.com/silvermine/serverless-plugin-multiple-responses)** <br/> Enable multiple content-types for Response template  | [silvermine](http://github.com/silvermine) | 
| **[Serverless Plugin Optimize](https://github.com/FidelLimited/serverless-plugin-optimize)** <br/> Bundle with Browserify, transpile with Babel to ES5 and minify with Uglify your Serverless functions. | [FidelLimited](http://github.com/FidelLimited) | 
| **[Serverless Plugin Package Dotenv File](https://github.com/ACloudGuru/serverless-plugin-package-dotenv-file)** <br/> A Serverless plugin to copy a .env file into the serverless package | [ACloudGuru](http://github.com/ACloudGuru) | 
| **[Serverless Plugin Scripts](https://github.com/mvila/serverless-plugin-scripts)** <br/> Add scripting capabilities to the Serverless Framework | [mvila](http://github.com/mvila) | 
| **[Serverless Plugin Stack Outputs](https://github.com/svdgraaf/serverless-plugin-stack-outputs)** <br/> Displays stack outputs for your serverless stacks when `sls info` is ran | [svdgraaf](http://github.com/svdgraaf) | 
| **[Serverless Plugin Stage Variables](https://github.com/svdgraaf/serverless-plugin-stage-variables)** <br/> Add stage variables for Serverless 1.x to ApiGateway, so you can use variables in your Lambda's | [svdgraaf](http://github.com/svdgraaf) | 
| **[Serverless Plugin Subscription Filter](https://github.com/tsub/serverless-plugin-subscription-filter)** <br/> A serverless plugin to register AWS CloudWatchLogs subscription filter | [tsub](http://github.com/tsub) | 
| **[Serverless Plugin Write Env Vars](https://github.com/silvermine/serverless-plugin-write-env-vars)** <br/> Write environment variables out to a file that is compatible with dotenv | [silvermine](http://github.com/silvermine) | 
| **[Serverless Python Individually](https://github.com/cfchou/serverless-python-individually)** <br/> A serverless framework plugin to install multiple lambda functions written in python | [cfchou](http://github.com/cfchou) | 
| **[Serverless Python Requirements](https://github.com/UnitedIncome/serverless-python-requirements)** <br/> Serverless plugin to bundle Python packages | [UnitedIncome](http://github.com/UnitedIncome) | 
| **[Serverless Resources Env](https://github.com/rurri/serverless-resources-env)** <br/> After Deploy, this plugin fetches cloudformation resource identifiers and sets them on AWS lambdas, and creates local .<state>-env file | [rurri](http://github.com/rurri) | 
| **[Serverless Run Function Plugin](https://github.com/lithin/serverless-run-function-plugin)** <br/> Run serverless function locally | [lithin](http://github.com/lithin) | 
| **[Serverless Scriptable Plugin](https://github.com/wei-xu-myob/serverless-scriptable-plugin)** <br/> Customize Serverless behavior without writing a plugin. | [wei-xu-myob](http://github.com/wei-xu-myob) | 
| **[Serverless Step Functions](https://github.com/horike37/serverless-step-functions)** <br/> AWS Step Functions with Serverless Framework. | [horike37](http://github.com/horike37) | 
| **[Serverless Subscription Filter](https://github.com/blackevil245/serverless-subscription-filter)** <br/> Serverless plugin to register subscription filter for Lambda logs. Register and pipe the logs of one lambda to another to process. | [blackevil245](http://github.com/blackevil245) | 
| **[Serverless Webpack](https://github.com/elastic-coders/serverless-webpack)** <br/> Serverless plugin to bundle your lambdas with Webpack | [elastic-coders](http://github.com/elastic-coders) | 
| **[Serverless Wsgi](https://github.com/logandk/serverless-wsgi)** <br/> Serverless plugin to deploy WSGI applications (Flask/Django/Pyramid etc.) and bundle Python packages | [logandk](http://github.com/logandk) |
<!-- AUTO-GENERATED-CONTENT:END This table is generated from https://github.com/serverless/plugins/blob/master/plugins.json please make additions there -->

[Add a plugin to this list](https://github.com/serverless/community-plugins/blob/master/plugins.json)

## <a name="v1-projects"></a>Example Projects (V1.0)

<!-- AUTO-GENERATED-CONTENT:START (GENERATE_SERVERLESS_EXAMPLES_TABLE)
This table is generated from https://github.com/serverless/examples/blob/master/community-examples.json please make additions there
-->
| Project Name | Author |
|:-------------|:------:|
| **[Serverless Screenshot](https://github.com/svdgraaf/serverless-screenshot)** <br/> Serverless Screenshot Service using PhantomJS | [svdgraaf](http://github.com/svdgraaf) | 
| **[Serverless Postgraphql](https://github.com/rentrop/serverless-postgraphql)** <br/> GraphQL endpoint for PostgreSQL using postgraphql | [rentrop](http://github.com/rentrop) | 
| **[Serverless Messenger Boilerplate](https://github.com/SC5/serverless-messenger-boilerplate)** <br/> Serverless messenger bot boilerplate | [SC5](http://github.com/SC5) | 
| **[Serverless Npm Registry](https://github.com/craftship/yith)** <br/> Serverless private npm registry, proxy and cache. | [craftship](http://github.com/craftship) | 
| **[Serverless Pokego](https://github.com/jch254/pokego-serverless)** <br/> Serverless-powered API to fetch nearby Pokemon Go data | [jch254](http://github.com/jch254) | 
| **[Serverless Weekly2pocket App](https://github.com/s0enke/weekly2pocket)** <br/> Serverless-powered API for sending posts to pocket app | [s0enke](http://github.com/s0enke) | 
| **[Serverless Facebook Quotebot](https://github.com/pmuens/quotebot)** <br/> 100% Serverless Facebook messenger chatbot which will respond with inspiring quotes | [pmuens](http://github.com/pmuens) | 
| **[Serverless Slack Trevorbot](https://github.com/conveyal/trevorbot)** <br/> Slack bot for info on where in the world is Trevor Gerhardt? | [conveyal](http://github.com/conveyal) | 
| **[Serverless Garden Aid](https://github.com/garden-aid/web-bff)** <br/> IoT Garden Aid Backend | [garden-aid](http://github.com/garden-aid) | 
| **[Serverless React Boilerplate](https://github.com/99xt/serverless-react-boilerplate)** <br/> A serverless react boilerplate for offline development | [99xt](http://github.com/99xt) | 
| **[Serverless Delivery Framework](https://github.com/99xt/serverless-delivery-framework)** <br/> This is a boilerplate for version release pipeline with serverless framework | [99xt](http://github.com/99xt) | 
| **[Serverless Mailgun Slack](https://github.com/Marcus-L/serverless-mailgun-slack)** <br/> A Serverless function for posting to a Slack Webhook in response to a Mailgun route | [Marcus-L](http://github.com/Marcus-L) | 
| **[Pfs Email Serverless](https://github.com/SCPR/pfs-email-serverless)** <br/> This is a lambda function created by the serverless framework. It searches through members in our mongodb who have not been sent emails and sends them an email with their custom token to unlock the pledge free stream. It then marks those members off as already receiving the email. | [SCPR](http://github.com/SCPR) | 
| **[Plaid Cashburndown Service](https://github.com/cplee/cashburndown-service)** <br/> Service for calculating cash burndown with plaid. Frontend code can be found here: https://github.com/cplee/cashburndown-site | [cplee](http://github.com/cplee) | 
| **[Cordis Serverless](https://github.com/marzeelabs/cordis-serverless)** <br/> A serverless API for EU Cordis data | [marzeelabs](http://github.com/marzeelabs) | 
| **[Serverless Newsletter Signup](https://github.com/ivanderbu2/serverless-newsletter-signup)** <br/> Saves user details into DynamoDB table. Required values are email, first_name and last_name. | [ivanderbu2](http://github.com/ivanderbu2) | 
| **[Serverless Slack Cron](https://github.com/ivanderbu2/serverless-slack-cron)** <br/> Lambda function which sends messages to Slack channel in regular intervals via cron trigger. | [ivanderbu2](http://github.com/ivanderbu2) | 
| **[Giphy Bot](https://github.com/tywong/lambda-workshop-2016/tree/master/giphy-bot)** <br/> giphy-bot for Facebook chat | [tywong](http://github.com/tywong) | 
| **[Jwt Lambda Python](https://github.com/mikaelmork/jwt-auth.serverless)** <br/> Minimal proof-of-concept implementation of JWT with Serverless / AWS Lambda | [mikaelmork](http://github.com/mikaelmork) | 
| **[Sls Access Counter](https://github.com/takahashim/sls-access-counter)** <br/> Site visitor counter | [takahashim](http://github.com/takahashim) | 
| **[Sls Form Mail](https://github.com/takahashim/sls-form-mail)** <br/> Send SNS email from form data | [takahashim](http://github.com/takahashim) | 
| **[Serverless Python Sample](https://github.com/bennybauer/serverless-python-sample)** <br/> A simple serverless python sample with REST API endpoints and dependencies | [bennybauer](http://github.com/bennybauer) | 
| **[Serverless Msg Gateway](https://github.com/yonahforst/msg-gateway)** <br/> A messaging aggregator for kik, skype, twilio, telegram, & messenger. Send and receive messages in a standard format. | [yonahforst](http://github.com/yonahforst) | 
| **[Serverless Aws Rekognition Finpics](https://github.com/rgfindl/finpics)** <br/> Use AWS Rekognition to provide a faces search of finpics.com | [rgfindl](http://github.com/rgfindl) | 
| **[Serverless Slack Emojibot](https://github.com/markhobson/emojibot)** <br/> Serverless slack bot for emoji | [markhobson](http://github.com/markhobson) | 
| **[Keboola Developer Portal](https://github.com/keboola/developer-portal)** <br/> Keboola developer portal built with Serverless | [keboola](http://github.com/keboola) | 
| **[Serverless Cloudwatch Rds Custom Metrics](https://github.com/AndrewFarley/serverless-cloudwatch-rds-custom-metrics)** <br/> A NodeJS-based MySQL RDS Data Collection script to push Custom Metrics to Cloudwatch with Serverless | [AndrewFarley](http://github.com/AndrewFarley) | 
| **[Jrestless Examples](https://github.com/bbilger/jrestless-examples)** <br/> [JRestless](https://github.com/bbilger/jrestless) (Java / JAX-RS) examples for [API Gateway Functions](https://github.com/bbilger/jrestless-examples/tree/master/aws/gateway) ([plain JAX-RS](https://github.com/bbilger/jrestless-examples/blob/master/aws/gateway/aws-gateway-showcase), [Spring](https://github.com/bbilger/jrestless-examples/blob/master/aws/gateway/aws-gateway-spring), [binary data requests/responses](https://github.com/bbilger/jrestless-examples/blob/master/aws/gateway/aws-gateway-binary), [custom authorizers](https://github.com/bbilger/jrestless-examples/blob/master/aws/gateway/aws-gateway-security-custom-authorizer) and [Cognito User Pool authorizers](https://github.com/bbilger/jrestless-examples/blob/master/aws/gateway/aws-gateway-security-cognito-authorizer)), [SNS Functions](https://github.com/bbilger/jrestless-examples/blob/master/aws/sns/aws-sns-usage-example) (asynchronous communication between functions) and [Service Functions](https://github.com/bbilger/jrestless-examples/blob/master/aws/service/aws-service-usage-example) (synchronous HTTP-like communication between functions - transparent through Feign) | [bbilger](http://github.com/bbilger) | 
| **[Sc5 Serverless Boilerplate](https://github.com/SC5/sc5-serverless-boilerplate)** <br/> A boilerplate that contains setup for test-driven development | [SC5](http://github.com/SC5) | 
| **[Serverless Blog To Podcast](https://github.com/SC5/serverless-blog-to-podcast)** <br/> Service that reads RSS feed and converts the entries to a podcast feed and audio files using Amazon Polly | [SC5](http://github.com/SC5) |
<!-- AUTO-GENERATED-CONTENT:END This table is generated from https://github.com/serverless/examples/blob/master/community-examples.json please make additions there -->

## <a name="contributing"></a>Contributing
We love our contributors! Please read our [Contributing Document](CONTRIBUTING.md) to learn how you can start working on the Framework yourself.

Check out our [exp/beginner](https://github.com/serverless/serverless/labels/exp/beginner), [exp/intermediate](https://github.com/serverless/serverless/labels/exp/intermediate) or [exp/expert](https://github.com/serverless/serverless/labels/exp/expert) labels to find issues we want to move forward on with your help.

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
* [Red Badger](https://red-badger.com)

----

# <a name="v.5"></a>Previous Serverless Version 0.5.x

You can find projects and plugins relating to version 0.5 [here](./0.5.x-RESOURCES.md). Note that these are not compatible with v1.0 but we are working diligently on updating them. [Guide on building v1.0 plugins](./docs/providers/aws/guide/plugins.md).

You can read the v0.5.x documentation at [readme.io](https://serverless.readme.io/v0.5.0/docs).
