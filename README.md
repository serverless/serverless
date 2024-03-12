[![Serverless Framework AWS Lambda AWS DynamoDB AWS API Gateway](https://github.com/serverless/serverless/assets/2752551/b20dd7e5-0380-492f-9cf2-5fd87a145ebb)](https://serverless.com)

<br/>

<div align="center">
  <a aria-label="Serverless.com" href="https://serverless.com">Website</a>
  &nbsp;•&nbsp;
  <a aria-label="Serverless Framework Documentation" href="https://serverless.com/framework/docs/">Documentation</a>
  &nbsp;•&nbsp;
  <a aria-label="Serverless Inc Twitter" href="https://twitter.com/goserverless">X / Twitter</a>
  &nbsp;•&nbsp;
  <a aria-label="Serverless Framework Community Slack" href="https://serverless.com/slack">Community Slack</a>
  &nbsp;•&nbsp;
  <a aria-label="Serverless Framework Community Forum" href="https://forum.serverless.com">Forum</a>
</div>

<br/>
<br/>

**The Serverless Framework** – Makes it easy to use AWS Lambda and other managed cloud services to build applications that auto-scale, cost nothing when idle, and boast radically low maintenance. 

The Serverless Framework is a command-line tool with approachable YAML syntax to deploy both your code and cloud infrastructure needed to make tons of serverless application use-cases, like APIs, front-ends, data pipelines and scheduled tasks. It's a multi-language framework that supports Node.js, Typescript, Python, Go, Java, and more. It's also completely extensible via over 1,000 plugins which add more serverless use-cases and workflows to the Framework.

Actively maintained by [Serverless Inc](https://www.serverless.com).

<br/>

# Serverless Framework - V.4 - Alpha

This is the Serverless Framework V.4 Alpha release. It includes the following:

* No breaking changes.
* A transition to a binary core, making Node.js not a requirement.
* Support for automatic updates.
* Improved onboarding and set-up assistance.
* Built-in CLI support command.
* Improved support for AWS SSO credentials.
* Authorization with the Serverless Platform.

<br/>

# Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Plugins](https://github.com/serverless/plugins)
- [Community](#community)

<br/>

# <a name="features"></a>Features

* **Build More, Manage Less:** Innovate faster by spending less time on infrastructure management.
* **Maximum Versatility:** Tackle diverse serverless use cases, from APIs and scheduled tasks to web sockets and data pipelines.
* **Automated Deployment:** Streamline development with code and infrastructure deployment handled together.
* **Ease of Use:** Deploy complex applications without deep cloud infrastructure expertise, thanks to simple YAML configuration.
* **Language Agnostic:** Build in your preferred language – Node.js, Python, Java, Go, C#, Ruby, Swift, Kotlin, PHP, Scala, or F#.
* **Complete Lifecycle Management:** Build, deploy, monitor, update, and troubleshoot serverless applications with ease.
* **Scalable Organization:** Structure large projects and teams efficiently with multi-domain support.
* **Effortless Environments:** Seamlessly manage development, staging, and production environments.
* **Customization Ready:** Extend and modify the Framework's functionality with a rich plugin ecosystem.
* **Vibrant Community:** Get support and connect with a passionate community of Serverless developers.

<br/>

# <a name="quick-start"></a>Quick Start

You can also install the Framework via NPM. You will need to have [Node.js](https://nodejs.org) installed.

```bash
npm i @serverlessinc/framework -g
```

The Serverless Framework is packaged as a binary, which can be installed via this CURL script.

```bash
curl -o- -L https://install.serverless.com | bash
```

Run the interactive onboarding via the "serverless" command, to pick a Template and set-up credentials for AWS.

```bash
serverless
```

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

<br/>

# <a name="community"></a>Community

- [X / Twitter](https://twitter.com/goserverless)
- [Community Slack](https://serverless.com/slack)
- [Serverless Meetups](http://www.meetup.com/serverless/)
- [Stackoverflow](http://stackoverflow.com/questions/tagged/serverless-framework)
- [Facebook](https://www.facebook.com/serverless)
- [Contact Us](mailto:hello@serverless.com)
