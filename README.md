![Serverless Application Framework AWS Lambda API Gateway](https://s3.amazonaws.com/serverless-images/frameworkv1_readme_v2.gif)

[Website](http://www.serverless.com) • [Email Updates](http://eepurl.com/b8dv4P) • [Gitter (1,000+)](https://gitter.im/serverless/serverless) • [Forum](http://forum.serverless.com) • [Meetups (7+)](https://github.com/serverless-meetups/main) • [Twitter](https://twitter.com/goserverless) • [Facebook](https://www.facebook.com/serverless) • [Contact Us](mailto:hello@serverless.com)

**The Serverless Framework** – Build applications comprised of microservices that run in response to events, auto-scale for you, and only charge you when they run.  This lowers the total cost of maintaining your apps, enabling you to build more logic, faster.

The Framework uses new event-driven compute services, like AWS Lambda, Google CloudFunctions, and more.  It's a command line tool, providing scaffolding, workflow automation and best practices for developing and deploying your serverless architecture. It's also completely extensible via plugins.

Serverless is an MIT open-source project, actively maintained by a full-time, venture-backed team.  Get started quickly by following the [Quickstart commands](#quick-start) or reading our [Guide to Serverless](./docs/01-guide/README.md)

## Links



* [Guide to Serverless](./docs/01-guide/README.md)
* [Features](#features)
* [Documentation v.1](./docs/README.md) / [v.0](http://serverless.readme.io)
* [Road Map](https://github.com/serverless/serverless/milestones)
* [Contributing](#contributing)
* [Community](#community)
* [Changelog](https://github.com/serverless/serverless/releases)
* [Fill out the 'State of Serverless Community Survey'](https://docs.google.com/forms/d/e/1FAIpQLSf-lMDMR22Bg56zUh71MJ9aH8N0In3s2PdZFrGRJzwZ0ul7rA/viewform)

## <a name="quick-start"></a>Quick Start

Below is a quick list of commands to set up a new project. For a more in-depth look at Serverless check out the [Guide in our docs](./docs/01-guide/README.md).

[Watch the video guide here](https://youtu.be/weOsx5rLWX0) or follow the steps below to create and deploy your first serverless microservice in minutes.

| **Step** | **Command** |**Description**|
|---|-------|------|
|  1.  | `npm install -g serverless` | Install Serverless CLI  |
|  3.  | [Set up your Provider credentials](./docs/02-providers/aws/01-setup.md) | Connect Serverless with your provider |
|  4.  | `serverless create --template aws-nodejs --path my-service` | Create an AWS Lamdba function in Node.js |
|  5.  | `cd my-service` | Change into your service directory  |
|  6.  | `serverless deploy` | Deploy to your AWS account  |
|  7.  | `serverless invoke --function hello` | Run the function we just deployed  |

Run `serverless remove` to clean up this function from your account.

Check out our in-depth [Guide to Serverless](./docs/01-guide/README.md) for more information.

## <a name="features"></a>Features

* Supports Node.js, Python & Java.
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

Use these plugins to overwrite or extend the Framework's functionality...

* [serverless-webpack](https://github.com/elastic-coders/serverless-webpack) - Bundle your lambdas with Webpack
* [serverless-alexa-plugin](https://github.com/rajington/serverless-alexa-plugin) - Support Alexa Lambda events
* [serverless-run-function](https://github.com/lithin/serverless-run-function-plugin) - Run functions locally
* [serverless-plugin-write-env-vars](https://github.com/silvermine/serverless-plugin-write-env-vars)
* [serverless-plugin-multiple-responses](https://github.com/silvermine/serverless-plugin-multiple-responses)
* [serverless-build](https://github.com/nfour/serverless-build-plugin)
* [serverless-scriptable](https://github.com/wei-xu-myob/serverless-scriptable-plugin)
* [serverless-plugin-stage-variables](https://github.com/svdgraaf/serverless-plugin-stage-variables)

## <a name="v1-services"></a>Services & Projects (V1.0)

Pre-written functions you can use instantly and example implementations...

* [serverless-examples](https://github.com/andymac4182/serverless_example)
* [serverless-npm-registry](https://github.com/craftship/yith)
* [serverless-pokego](https://github.com/jch254/pokego-serverless)
* [serverless-pocket-app](https://github.com/s0enke/weekly2pocket)
* [serverless-quotebot](https://github.com/pmuens/quotebot)
* [serverless-slackbot](https://github.com/conveyal/trevorbot)
* [serverless-garden-aid](https://github.com/garden-aid/web-bff)

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

## Contributors

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
| [<img src="https://avatars.githubusercontent.com/u/2752551?v=3" width="75px;"/><br /><sub>Austen </sub>](http://www.serverless.com)<br /> | [<img src="https://avatars.githubusercontent.com/u/1036546?v=3" width="75px;"/><br /><sub>Ryan Pendergast</sub>](http://rynop.com)<br /> | [<img src="https://avatars.githubusercontent.com/u/2312463?v=3" width="75px;"/><br /><sub>Eslam λ Hefnawy</sub>](http://eahefnawy.com)<br /> | [<img src="https://avatars.githubusercontent.com/u/439309?v=3" width="75px;"/><br /><sub>Egor Kislitsyn</sub>](https://github.com/minibikini)<br /> | [<img src="https://avatars.githubusercontent.com/u/554841?v=3" width="75px;"/><br /><sub>Kamil Burzynski</sub>](http://www.nopik.net)<br /> | [<img src="https://avatars.githubusercontent.com/u/636610?v=3" width="75px;"/><br /><sub>Ryan Brown</sub>](http://rsb.io)<br /> | [<img src="https://avatars.githubusercontent.com/u/571200?v=3" width="75px;"/><br /><sub>Erik Erikson</sub>](https://github.com/erikerikson)<br /> |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| [<img src="https://avatars.githubusercontent.com/u/851863?v=3" width="75px;"/><br /><sub>Joost Farla</sub>](http://www.apiwise.nl)<br /> | [<img src="https://avatars.githubusercontent.com/u/532272?v=3" width="75px;"/><br /><sub>David Wells</sub>](http://davidwells.io)<br /> | [<img src="https://avatars.githubusercontent.com/u/5524702?v=3" width="75px;"/><br /><sub>Frank Schmid</sub>](https://github.com/HyperBrain)<br /> | [<img src="https://avatars.githubusercontent.com/u/27389?v=3" width="75px;"/><br /><sub>Jacob Evans</sub>](www.dekz.net)<br /> | [<img src="https://avatars.githubusercontent.com/u/1606004?v=3" width="75px;"/><br /><sub>Philipp Muens</sub>](http://serverless.com)<br /> | [<img src="https://avatars.githubusercontent.com/u/1689118?v=3" width="75px;"/><br /><sub>Jared Short</sub>](http://jaredshort.com)<br /> | [<img src="https://avatars.githubusercontent.com/u/37931?v=3" width="75px;"/><br /><sub>Jordan Mack</sub>](http://www.glitchbot.com/)<br /> |
| [<img src="https://avatars.githubusercontent.com/u/479049?v=3" width="75px;"/><br /><sub>stevecaldwell77</sub>](https://github.com/stevecaldwell77)<br /> | [<img src="https://avatars.githubusercontent.com/u/101239?v=3" width="75px;"/><br /><sub>Aaron Boushley</sub>](blog.boushley.net)<br /> | [<img src="https://avatars.githubusercontent.com/u/3111541?v=3" width="75px;"/><br /><sub>Michael Haselton</sub>](https://github.com/icereval)<br /> | [<img src="https://avatars.githubusercontent.com/u/4904741?v=3" width="75px;"/><br /><sub>visualasparagus</sub>](https://github.com/visualasparagus)<br /> | [<img src="https://avatars.githubusercontent.com/u/239624?v=3" width="75px;"/><br /><sub>Alexandre Saiz Verdaguer</sub>](http://www.alexsaiz.com)<br /> | [<img src="https://avatars.githubusercontent.com/u/132653?v=3" width="75px;"/><br /><sub>Florian Motlik</sub>](https://github.com/flomotlik)<br /> | [<img src="https://avatars.githubusercontent.com/u/13944?v=3" width="75px;"/><br /><sub>Kenneth Falck</sub>](http://kfalck.net)<br /> |
| [<img src="https://avatars.githubusercontent.com/u/509798?v=3" width="75px;"/><br /><sub>akalra</sub>](https://github.com/akalra)<br /> | [<img src="https://avatars.githubusercontent.com/u/14071524?v=3" width="75px;"/><br /><sub>Martin Lindenberg</sub>](https://github.com/martinlindenberg)<br /> | [<img src="https://avatars.githubusercontent.com/u/26691?v=3" width="75px;"/><br /><sub>Tom Milewski</sub>](http://carrot.is/tom)<br /> | [<img src="https://avatars.githubusercontent.com/u/195210?v=3" width="75px;"/><br /><sub>Antti Ahti</sub>](https://twitter.com/apaatsio)<br /> | [<img src="https://avatars.githubusercontent.com/u/476010?v=3" width="75px;"/><br /><sub>Dan</sub>](https://github.com/BlueBlock)<br /> | [<img src="https://avatars.githubusercontent.com/u/8393068?v=3" width="75px;"/><br /><sub>Mikael Puittinen</sub>](https://github.com/mpuittinen)<br /> | [<img src="https://avatars.githubusercontent.com/u/4513907?v=3" width="75px;"/><br /><sub>Jeremy Wallace</sub>](https://github.com/jerwallace)<br /> |
| [<img src="https://avatars.githubusercontent.com/u/265395?v=3" width="75px;"/><br /><sub>Jonathan Nuñez</sub>](https://twitter.com/jonathan_naguin)<br /> | [<img src="https://avatars.githubusercontent.com/u/195404?v=3" width="75px;"/><br /><sub>Nick den Engelsman</sub>](http://www.codedrops.nl)<br /> | [<img src="https://avatars.githubusercontent.com/u/116057?v=3" width="75px;"/><br /><sub>Kazato Sugimoto</sub>](https://twitter.com/uiureo)<br /> | [<img src="https://avatars.githubusercontent.com/u/1551510?v=3" width="75px;"/><br /><sub>Matthew Chase Whittemore</sub>](https://github.com/mcwhittemore)<br /> | [<img src="https://avatars.githubusercontent.com/u/280997?v=3" width="75px;"/><br /><sub>Joe Turgeon</sub>](https://github.com/arithmetric)<br /> | [<img src="https://avatars.githubusercontent.com/u/4154003?v=3" width="75px;"/><br /><sub>David Hérault</sub>](https://github.com/dherault)<br /> | [<img src="https://avatars.githubusercontent.com/u/1114054?v=3" width="75px;"/><br /><sub>Austin Rivas</sub>](https://github.com/austinrivas)<br /> |
| [<img src="https://avatars.githubusercontent.com/u/15729112?v=3" width="75px;"/><br /><sub>Tomasz Szajna</sub>](https://github.com/tszajna0)<br /> | [<img src="https://avatars.githubusercontent.com/u/446405?v=3" width="75px;"/><br /><sub>Daniel Johnston</sub>](https://github.com/affablebloke)<br /> | [<img src="https://avatars.githubusercontent.com/u/950078?v=3" width="75px;"/><br /><sub>Michael Wittig</sub>](https://michaelwittig.info/)<br /> | [<img src="https://avatars.githubusercontent.com/u/1475986?v=3" width="75px;"/><br /><sub>worldsoup</sub>]()<br /> | [<img src="https://avatars.githubusercontent.com/u/1091399?v=3" width="75px;"/><br /><sub>pwagener</sub>]()<br /> | [<img src="https://avatars.githubusercontent.com/u/125881?v=3" width="75px;"/><br /><sub>Ian Serlin</sub>](http://useful.io)<br /> |
| [<img src="https://avatars.githubusercontent.com/u/2160421?v=3" width="75px;"/><br /><sub>nishantjain91</sub>](https://github.com/nishantjain91)<br /> | [<img src="https://avatars.githubusercontent.com/u/70826?v=3" width="75px;"/><br /><sub>Michael McManus</sub>](https://github.com/michaelorionmcmanus)<br /> | [<img src="https://avatars.githubusercontent.com/u/470292?v=3" width="75px;"/><br /><sub>Kiryl Yermakou</sub>](https://github.com/rma4ok)<br /> | [<img src="https://avatars.githubusercontent.com/u/1669965?v=3" width="75px;"/><br /><sub>Lauri Svan</sub>](http://www.linkedin.com/in/laurisvan)<br /> | [<img src="https://avatars.githubusercontent.com/u/47539?v=3" width="75px;"/><br /><sub>James Hall</sub>](http://parall.ax/)<br /> | [<img src="https://avatars.githubusercontent.com/u/53535?v=3" width="75px;"/><br /><sub>Raj Nigam</sub>](https://github.com/rajington)<br /> | [<img src="https://avatars.githubusercontent.com/u/7740?v=3" width="75px;"/><br /><sub>Moshe Weitzman</sub>](http://weitzman.github.com)<br /> |
| [<img src="https://avatars.githubusercontent.com/u/2035388?v=3" width="75px;"/><br /><sub>Potekhin Kirill</sub>](http://www.easy10.com/)<br /> | [<img src="https://avatars.githubusercontent.com/u/2107342?v=3" width="75px;"/><br /><sub>Brent</sub>](https://github.com/brentax)<br /> | [<img src="https://avatars.githubusercontent.com/u/762414?v=3" width="75px;"/><br /><sub>Ryu Tamaki</sub>](http://ryutamaki.hatenablog.com)<br /> | [<img src="https://avatars.githubusercontent.com/u/172072?v=3" width="75px;"/><br /><sub>Nicolas Grenié</sub>](http://nicolasgrenie.com)<br /> | [<img src="https://avatars.githubusercontent.com/u/72954?v=3" width="75px;"/><br /><sub>Colin Ramsay</sub>](http://colinramsay.co.uk)<br /> | [<img src="https://avatars.githubusercontent.com/u/21967?v=3" width="75px;"/><br /><sub>Kevin Old</sub>](http://www.kevinold.com)<br /> | [<img src="https://avatars.githubusercontent.com/u/6233204?v=3" width="75px;"/><br /><sub>forevermatt</sub>](https://github.com/forevermatt)<br /> |
| [<img src="https://avatars.githubusercontent.com/u/192728?v=3" width="75px;"/><br /><sub>Norm MacLennan</sub>](http://blog.normmaclennan.com)<br /> | [<img src="https://avatars.githubusercontent.com/u/521483?v=3" width="75px;"/><br /><sub>Chris Magee</sub>](http://www.velocity42.com)<br /> | [<img src="https://avatars.githubusercontent.com/u/855022?v=3" width="75px;"/><br /><sub>Ninir</sub>](https://github.com/Ninir)<br /> | [<img src="https://avatars.githubusercontent.com/u/636075?v=3" width="75px;"/><br /><sub>Miguel Parramon</sub>](https://github.com/mparramont)<br /> | [<img src="https://avatars.githubusercontent.com/u/909648?v=3" width="75px;"/><br /><sub>Henri Meltaus</sub>](https://webscale.fi)<br /> | [<img src="https://avatars.githubusercontent.com/u/584675?v=3" width="75px;"/><br /><sub>Thomas Vendetta</sub>](http://vendetta.io)<br /> | [<img src="https://avatars.githubusercontent.com/u/1557716?v=3" width="75px;"/><br /><sub>fuyu</sub>](https://github.com/fuyu)<br /> |
| [<img src="https://avatars.githubusercontent.com/u/2457588?v=3" width="75px;"/><br /><sub>Alex Casalboni</sub>](https://github.com/alexcasalboni)<br /> | [<img src="https://avatars.githubusercontent.com/u/6675751?v=3" width="75px;"/><br /><sub>Marko Grešak</sub>](https://gresak.io)<br /> | [<img src="https://avatars.githubusercontent.com/u/301217?v=3" width="75px;"/><br /><sub>Derek van Vliet</sub>](http://getsetgames.com)<br /> | [<img src="https://avatars.githubusercontent.com/u/126104?v=3" width="75px;"/><br /><sub>Michael Friis</sub>](http://friism.com/)<br /> | [<img src="https://avatars.githubusercontent.com/u/133328?v=3" width="75px;"/><br /><sub>Stephen Crosby</sub>](http://lithostech.com)<br /> |
<!-- ALL-CONTRIBUTORS-LIST:END -->


## Consultants
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

## Badges

[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)
[![npm version](https://badge.fury.io/js/serverless.svg)](https://badge.fury.io/js/serverless)
[![Coverage Status](https://coveralls.io/repos/github/serverless/serverless/badge.svg?branch=master)](https://coveralls.io/github/serverless/serverless?branch=master)
[![gitter](https://img.shields.io/gitter/room/serverless/serverless.svg)](https://gitter.im/serverless/serverless)
[![dependencies](https://img.shields.io/david/serverless/serverless.svg)](https://www.npmjs.com/package/serverless)
[![license](https://img.shields.io/npm/l/serverless.svg)](https://www.npmjs.com/package/serverless)

----

# Previous Serverless Version 0.5.x

Below are projects and plugins relating to version 0.5 and below. Note that these are not compatible with v1.0 but we are working diligently on updating them. [Guide on building v1.0 plugins](./docs/04-extending-serverless/01-creating-plugins.md)

You can read the v0.5.x documentation at [readme.io](https://serverless.readme.io/v0.5.0/docs).

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
* [Serverless DynamoDB Local](https://github.com/99xt/serverless-dynamodb-local) - Simiulate DynamoDB instance locally.
* [Serverless Dependency Install](https://github.com/99xt/serverless-dependency-install) - Manage node, serverless dependencies easily within the project.
