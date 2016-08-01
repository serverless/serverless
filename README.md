![Serverless Application Framework AWS Lambda API Gateway](other/img/readme_serverless_framework_v1.gif)

Serverless Framework v.1.0
=================================
[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)
[![npm version](https://badge.fury.io/js/serverless.svg)](https://badge.fury.io/js/serverless)
[![Coverage Status](https://coveralls.io/repos/github/serverless/serverless/badge.svg?branch=v1.0)](https://coveralls.io/github/serverless/serverless?branch=dev)
[![gitter](https://img.shields.io/gitter/room/serverless/serverless.svg)](https://gitter.im/serverless/serverless)
[![dependencies](https://img.shields.io/david/serverless/serverless.svg)](https://www.npmjs.com/package/serverless)
[![license](https://img.shields.io/npm/l/serverless.svg)](https://www.npmjs.com/package/serverless)

Serverless computing is quickly becoming a defacto way to build highly scalable fault tolerant systems.

The Serverless Framework is the application framework for building web, mobile and IoT applications on serverless, event-driven compute services.

We currently support [AWS Lambda](https://aws.amazon.com/lambda/) and are adding support for [Google CloudFunctions](https://cloud.google.com/functions/), [Azure Functions](https://azure.microsoft.com/en-us/services/functions/) and more.

The Serverless command line interface provides scaffolding, automation and best practices for developing and deploying your serverless architecture.

Designed from the ground up to be extendable via plugins, It's easy to extend functionality to fit your unique needs.

This project is maintained by a full-time, venture-backed team.

For updates, join our [mailing list](http://github.us11.list-manage1.com/subscribe?u=b4fad36768cab222f88338995&id=5f8407dded).

For help, join our [gitter chatroom](https://gitter.im/serverless/serverless).

Also, [we're hiring](mailto:jobs@serverless.com) :)

## Quick start

Follow these simple steps to install serverless.

Create and deploy your first service in under 5 minutes.

| **Step** | **Command** |**Description**|
|----------|-------|---|
|  1.  | `npm install -g serverless@beta` | Install Serverless CLI  |
|  2.  | ``mkdir my-first-service && cd my-first-service` | Create the project directory |
|  3.  | `serverless create --template aws-nodejs` | Create an AWS node lamdba function  |
|  4.  | `serverless deploy` | Deploy to live AWS account  |
|  5.  | ``serverless invoke --function hello` | run the live API endpoint  |

Run `serverless remove` to clean up this function from your account.

## Links

* [Documentation v1.0](/docs)
* [Road Map](https://github.com/serverless/serverless/milestones)
* [Changelog](https://github.com/serverless/serverless/releases)
* [Email Updates](http://eepurl.com/b8dv4P)
* [Gitter Chatroom](https://gitter.im/serverless/serverless) - We are in here all day long!
* [Stackoverflow](http://stackoverflow.com/questions/tagged/serverless-framework)
* [Facebook](https://www.facebook.com/serverless)
* [Twitter](https://twitter.com/goserverless)
* [Serverless Meetups](http://www.meetup.com/serverless/)
* [Contact Us](mailto:team@serverless.com)

## Features

* Manage the lifecycle of your serverless architecture (build, deploy, update, delete)
* Group functions into services for easy management of code, resources & processes across large projects and teams
* Support for AWS Lambda, Azure Functions, Google CloudFunctions & more
* Safely, easily deploy functions, events and their required resources
* Minimal configuration and scaffolding
* Built-in support for multiple stages
* Optimized for CI/CD workflows
* Loaded with automation, optimization and best practices
* 100% Extensible: Extend or modify the Framework and its operations via Plugins
* An ecosystem of serverless services and plugins
* A fantastic and welcoming community!

## Contributing
We love our contributors! If you'd like to contribute to the project, feel free to submit a PR. But please keep in mind the following guidelines:

* Propose your changes before you start working on a PR. You can reach us by submitting a Github issue, or discuss it in the [Gitter Chatroom](https://gitter.im/serverless/serverless). This is just to make sure that no one else is working on the same change, and to figure out the best way to solve the issue.
* If you're out of ideas, but still want to contribute, check out our [Road Map](https://github.com/serverless/serverless/milestones). There's a lot we want to get done, and we'd love your help!
* Contributions are not just PRs! We'd be grateful for having you in our community, and if you could provide some support for new comers, that be great! You can also do that by answering [Serverless related questions on Stackoverflow](http://stackoverflow.com/questions/tagged/serverless-framework).
* You can also contribute by writing. Feel free to let us know if you want to publish a useful original guide in our docs (attributed to you, thank you!) that you feel will help the community.

## [Documentation](/docs)

Take a look at our [documentation](/docs) to get started with Serverless and understand how it works behind the scenes.

- [Understanding Serverless and its configuration files](understanding-serverless)
  - [Serverless services and functions](docs/understanding-serverless/services-and-functions.md)
  - [serverless.yml](docs/understanding-serverless/serverless-yml.md)
  - [serverless.env.yml](docs/understanding-serverless/serverless-env-yml.md)
- [How to build your Serverless services](docs/guide)
  - [Installing Serverless](docs/guide/installation.md)
  - [Provider account setup](docs/guide/provider-account-setup.md)
  - [Creating a service](docs/guide/creating-a-service.md)
  - [Deploying your service](docs/guide/deploying-a-service.md)
  - [Invoking your functions](docs/guide/invoking-a-function.md)
  - [Adding additional event sources](docs/guide/event-sources.md)
  - [Overview of available event sources](docs/guide/overview-of-event-sources.md)
  - [Managing custom provider resources](docs/guide/custom-provider-resources.md)
  - [Removing your service](docs/guide/removing-a-service.md)
- [Using plugins](docs/using-plugins)
  - [How to use additional plugins in your service](docs/using-plugins/adding-custom-plugins.md)
  - [Plugins provided by Serverless](docs/using-plugins/core-plugins.md)
- [Building plugins](docs/developing-plugins)
  - [How to build your own plugin](docs/developing-plugins/building-plugins.md)
  - [How to build provider integration with your plugin](docs/developing-plugins/building-provider-integrations.md)
- [Service templates](docs/service-templates)
- [Usage tracking](docs/usage-tracking)
  - [Detailed information regarding usage tracking](docs/usage-tracking/usage-tracking.md)

## Contribute

Please read our [Contributing Document](CONTRIBUTING.md) to learn more how you can start working on the Framework yourself.

## Community

Some of the awesome people who contribute to Serverless. [Join the community](CONTRIBUTING.md)

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
| [<img src="https://avatars.githubusercontent.com/u/2752551?v=3" width="75px;"/><br /><sub>Austen </sub>](http://www.serverless.com)<br /> | [<img src="https://avatars.githubusercontent.com/u/1036546?v=3" width="75px;"/><br /><sub>Ryan Pendergast</sub>](http://rynop.com)<br /> | [<img src="https://avatars.githubusercontent.com/u/2312463?v=3" width="75px;"/><br /><sub>Eslam λ Hefnawy</sub>](http://eahefnawy.com)<br /> | [<img src="https://avatars.githubusercontent.com/u/439309?v=3" width="75px;"/><br /><sub>Egor Kislitsyn</sub>](https://github.com/minibikini)<br /> | [<img src="https://avatars.githubusercontent.com/u/554841?v=3" width="75px;"/><br /><sub>Kamil Burzynski</sub>](http://www.nopik.net)<br /> | [<img src="https://avatars.githubusercontent.com/u/636610?v=3" width="75px;"/><br /><sub>Ryan Brown</sub>](http://rsb.io)<br /> | [<img src="https://avatars.githubusercontent.com/u/571200?v=3" width="75px;"/><br /><sub>Erik Erikson</sub>](https://github.com/erikerikson)<br /> |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| [<img src="https://avatars.githubusercontent.com/u/851863?v=3" width="75px;"/><br /><sub>Joost Farla</sub>](http://www.apiwise.nl)<br /> | [<img src="https://avatars.githubusercontent.com/u/532272?v=3" width="75px;"/><br /><sub>David Wells</sub>](http://davidwells.io)<br /> | [<img src="https://avatars.githubusercontent.com/u/5524702?v=3" width="75px;"/><br /><sub>Frank Schmid</sub>](https://github.com/HyperBrain)<br /> | [<img src="https://avatars.githubusercontent.com/u/27389?v=3" width="75px;"/><br /><sub>Jacob Evans</sub>](www.dekz.net)<br /> | [<img src="https://avatars.githubusercontent.com/u/1606004?v=3" width="75px;"/><br /><sub>Philipp Muens</sub>](http://serverless.com)<br /> | [<img src="https://avatars.githubusercontent.com/u/1689118?v=3" width="75px;"/><br /><sub>Jared Short</sub>](http://jaredshort.com)<br /> | [<img src="https://avatars.githubusercontent.com/u/37931?v=3" width="75px;"/><br /><sub>Jordan Mack</sub>](http://www.glitchbot.com/)<br /> |
| [<img src="https://avatars.githubusercontent.com/u/479049?v=3" width="75px;"/><br /><sub>stevecaldwell77</sub>](https://github.com/stevecaldwell77)<br /> | [<img src="https://avatars.githubusercontent.com/u/101239?v=3" width="75px;"/><br /><sub>Aaron Boushley</sub>](blog.boushley.net)<br /> | [<img src="https://avatars.githubusercontent.com/u/3111541?v=3" width="75px;"/><br /><sub>Michael Haselton</sub>](https://github.com/icereval)<br /> | [<img src="https://avatars.githubusercontent.com/u/4904741?v=3" width="75px;"/><br /><sub>visualasparagus</sub>](https://github.com/visualasparagus)<br /> | [<img src="https://avatars.githubusercontent.com/u/239624?v=3" width="75px;"/><br /><sub>Alexandre Saiz Verdaguer</sub>](http://www.alexsaiz.com)<br /> | [<img src="https://avatars.githubusercontent.com/u/132653?v=3" width="75px;"/><br /><sub>Florian Motlik</sub>](https://github.com/flomotlik)<br /> | [<img src="https://avatars.githubusercontent.com/u/13944?v=3" width="75px;"/><br /><sub>Kenneth Falck</sub>](http://kfalck.net)<br /> |
| [<img src="https://avatars.githubusercontent.com/u/509798?v=3" width="75px;"/><br /><sub>akalra</sub>](https://github.com/akalra)<br /> | [<img src="https://avatars.githubusercontent.com/u/14071524?v=3" width="75px;"/><br /><sub>Martin Lindenberg</sub>](https://github.com/martinlindenberg)<br /> | [<img src="https://avatars.githubusercontent.com/u/26691?v=3" width="75px;"/><br /><sub>Tom Milewski</sub>](http://carrot.is/tom)<br /> | [<img src="https://avatars.githubusercontent.com/u/195210?v=3" width="75px;"/><br /><sub>Antti Ahti</sub>](https://twitter.com/apaatsio)<br /> | [<img src="https://avatars.githubusercontent.com/u/476010?v=3" width="75px;"/><br /><sub>Dan</sub>](https://github.com/BlueBlock)<br /> | [<img src="https://avatars.githubusercontent.com/u/8393068?v=3" width="75px;"/><br /><sub>Mikael Puittinen</sub>](https://github.com/mpuittinen)<br /> | [<img src="https://avatars.githubusercontent.com/u/4513907?v=3" width="75px;"/><br /><sub>Jeremy Wallace</sub>](https://github.com/jerwallace)<br /> |
| [<img src="https://avatars.githubusercontent.com/u/265395?v=3" width="75px;"/><br /><sub>Jonathan Nuñez</sub>](https://twitter.com/jonathan_naguin)<br /> | [<img src="https://avatars.githubusercontent.com/u/195404?v=3" width="75px;"/><br /><sub>Nick den Engelsman</sub>](http://www.codedrops.nl)<br /> | [<img src="https://avatars.githubusercontent.com/u/116057?v=3" width="75px;"/><br /><sub>Kazato Sugimoto</sub>](https://twitter.com/uiureo)<br /> | [<img src="https://avatars.githubusercontent.com/u/1551510?v=3" width="75px;"/><br /><sub>Matthew Chase Whittemore</sub>](https://github.com/mcwhittemore)<br /> | [<img src="https://avatars.githubusercontent.com/u/280997?v=3" width="75px;"/><br /><sub>Joe Turgeon</sub>](https://github.com/arithmetric)<br /> | [<img src="https://avatars.githubusercontent.com/u/4154003?v=3" width="75px;"/><br /><sub>David Hérault</sub>](https://github.com/dherault)<br /> | [<img src="https://avatars.githubusercontent.com/u/1114054?v=3" width="75px;"/><br /><sub>Austin Rivas</sub>](https://github.com/austinrivas)<br /> |
| [<img src="https://avatars.githubusercontent.com/u/15729112?v=3" width="75px;"/><br /><sub>Tomasz Szajna</sub>](https://github.com/tszajna0)<br /> | [<img src="https://avatars.githubusercontent.com/u/446405?v=3" width="75px;"/><br /><sub>Daniel Johnston</sub>](https://github.com/affablebloke)<br /> | [<img src="https://avatars.githubusercontent.com/u/950078?v=3" width="75px;"/><br /><sub>Michael Wittig</sub>](https://michaelwittig.info/)<br /> | [<img src="" width="75px;"/><br /><sub>pwagener</sub>]()<br /> | [<img src="" width="75px;"/><br /><sub>ianserlin</sub>]()<br /> | [<img src="" width="75px;"/><br /><sub>nishantjain91</sub>]()<br /> | [<img src="" width="75px;"/><br /><sub>michaelorionmcmanus</sub>]()<br /> |
| [<img src="" width="75px;"/><br /><sub>rma4ok</sub>]()<br /> | [<img src="" width="75px;"/><br /><sub>laurisvan</sub>]()<br /> | [<img src="" width="75px;"/><br /><sub>MrRio</sub>]()<br /> | [<img src="" width="75px;"/><br /><sub>rajington</sub>]()<br /> | [<img src="" width="75px;"/><br /><sub>weitzman</sub>]()<br /> | [<img src="" width="75px;"/><br /><sub>kpotehin</sub>]()<br /> | [<img src="" width="75px;"/><br /><sub>brentax</sub>]()<br /> |
| [<img src="" width="75px;"/><br /><sub>ryutamaki</sub>]()<br /> | [<img src="" width="75px;"/><br /><sub>picsoung</sub>]()<br /> | [<img src="" width="75px;"/><br /><sub>colinramsay</sub>]()<br /> | [<img src="" width="75px;"/><br /><sub>kevinold</sub>]()<br /> | [<img src="" width="75px;"/><br /><sub>forevermatt</sub>]()<br /> | [<img src="" width="75px;"/><br /><sub>maclennann</sub>]()<br /> | [<img src="" width="75px;"/><br /><sub>InvertedAcceleration</sub>]()<br /> |
| [<img src="" width="75px;"/><br /><sub>Ninir</sub>]()<br /> | [<img src="" width="75px;"/><br /><sub>mparramont</sub>]()<br /> | [<img src="" width="75px;"/><br /><sub>hmeltaus</sub>]()<br /> | [<img src="" width="75px;"/><br /><sub>thomasv314</sub>]()<br /> | [<img src="" width="75px;"/><br /><sub>fuyu</sub>]()<br /> | [<img src="" width="75px;"/><br /><sub>alexcasalboni</sub>]()<br /> | [<img src="" width="75px;"/><br /><sub>markogresak</sub>]()<br /> |
| [<img src="" width="75px;"/><br /><sub>derekvanvliet</sub>]()<br /> | [<img src="" width="75px;"/><br /><sub>friism</sub>]()<br /> | [<img src="" width="75px;"/><br /><sub>stevecrozz</sub>]()<br /> | [<img src="" width="75px;"/><br /><sub>worldsoup</sub>]()<br /> |
<!-- ALL-CONTRIBUTORS-LIST:END -->


## Consultants
These consultants use the Serverless Framework and can help you build your serverless projects.
* [Trek10](https://www.trek10.com/)
* [Parallax](https://parall.ax/) – they also built the [David Guetta Campaign](https://serverlesscode.com/post/david-guetta-online-recording-with-lambda/)
* [Just Serverless](http://justserverless.com)
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

----

# Version 0.5.x

Below are projects and plugins relating to version 0.5 and below. Note that these are not compatible with v1.0 but we are working diligently on updating them.

## v0.5.x Projects
Serverless Projects are shareable and installable.  You can publish them to npm and install them via the Serverless Framework CLI by using `$ serverless project install <project-name>`
* [serverless-graphql](https://github.com/serverless/serverless-graphql) - Official Serverless boilerplate to kick start your project
* [serverless-starter](https://github.com/serverless/serverless-starter) - A simple boilerplate for new projects (JavaScript) with a few architectural options
* [serverless-starter-python](https://github.com/alexcasalboni/serverless-starter-python) - A simple boilerplate for new projects (Python) with a few architectural options
* [serverless-graphql-blog](https://github.com/serverless/serverless-graphql-blog) - A blog boilerplate that leverages GraphQL in front of DynamoDB to offer a minimal REST API featuring only 1 endpoint
* [serverless-authentication-boilerplate](https://github.com/laardee/serverless-authentication-boilerplate) - A generic authentication boilerplate for Serverless framework
* [sc5-serverless-boilerplate](https://github.com/SC5/sc5-serverless-boilerplate) - A boilerplate for test driven development of REST endpoints
* [MoonMail] (https://github.com/microapps/MoonMail) - Build your own email marketing infrastructure using Lambda + SES

## v0.5.x Plugins
Serverless is composed of Plugins.  A group of default Plugins ship with the Framework, and here are some others you can add to improve/help your workflow:
* [Meta Sync](https://github.com/serverless/serverless-meta-sync) - Securely sync your the variables in your project's `_meta/variables` across your team.
* [Offline](https://github.com/dherault/serverless-offline) - Emulate AWS Lambda and Api Gateway locally to speed up your development cycles.
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
