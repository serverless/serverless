[![Serverless Framework AWS Lambda AWS DynamoDB AWS API Gateway](https://github.com/serverless/serverless/assets/2752551/66a8c6a9-bc4a-4116-b139-90c12963337e)](https://serverless.com)

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

**The Serverless Framework** – Makes it easy to use AWS Lambda and other managed cloud services to build applications that auto-scale, cost nothing when idle, and overall result in radically low maintenance.

The Serverless Framework is a command-line tool with approachable YAML syntax to deploy both your code and cloud infrastructure needed to make tons of serverless application use-cases, like APIs, front-ends, data pipelines and scheduled tasks. It's a multi-language framework that supports Node.js, Typescript, Python, Go, Java, and more. It's also completely extensible via over 1,000 plugins which add more serverless use-cases and workflows to the Framework.

Actively maintained by [Serverless Inc](https://www.serverless.com).

<br/>

# Serverless Framework - V.4

<div align="center" style="max-width: 500px; margin: auto;">
  <a href="https://www.youtube.com/watch?v=UQL_PPJUFOU" target="_blank">
    <img src="https://github.com/serverless/serverless/assets/2752551/2fc23656-df76-4d8a-b775-f4cc8ed2068d" alt="Serverless Framework V.4 Overview Video" style="width: 100%; max-width: 500px;">
  </a>
</div>

<br/>

**September 24th, 2024** – We have introduced a ton of new features since the release of Serverless Framework V4 GA in May. Check out the list below for everything recently launched. If you are upgrading to V.4, see our [Upgrading to Serverless Framework V4 Documentation](https://www.serverless.com/framework/docs/guides/upgrading-v4). If you need to access documentation for Serverless Framework V.3, you can find it [here](https://github.com/serverless/serverless/tree/v3/docs).

## New Features In V.4

Here's a list of everything that's new in V.4, so far:

- **Support for AWS SAM, AWS Cloudformation, & Traditional Serverless Framework Projects:** Now, you can use one tool to deploy all three of these IaC project files. [More info here](https://www.serverless.com/framework/docs/guides/sam)
- **Native Typescript Support:** You can now use `.ts` handlers in your AWS Lambda functions in `serverless.yml` and have them build automatically upon deploy. [ESBuild](https://esbuild.github.io/) is now included in the Framework which makes this possible. [More info here](https://www.serverless.com/framework/docs/providers/aws/guide/building).
- **The AWS AI Stack:** V.4 is optimized for [the AWS AI Stack](https://github.com/serverless/aws-ai-stack). Deploy a full-stack, serverless, boilerplate for AI applications on AWS, featuring Bedrock LLMs like Claude 3.5 Sonnet and Llama3.1 and much more.
- **New Dev Mode:** Run `serverless dev` to have events from your live architecture routed to your local code, enabling you to make fast changes without deployment. [More info here](https://www.serverless.com/framework/docs/providers/aws/cli-reference/dev).
- **New Stages Property:** Easily organize stage-specific config via `stages` and set `default` config to fallback to.
- **Improved Compose Experience:** Serverless Compose now has a beautiful new CLI experience that better demonstrates what is being deployed. 
- **New Terraform & Vault Integrations:** Pull state outputs from several Terraform state storage solutions, and secrets from Vault. [Terraform Docs](https://www.serverless.com/framework/docs/guides/variables/terraform) [Vault Docs](https://www.serverless.com/framework/docs/guides/variables/vault)
- **Support Command:** Send support requests to our team [directly from the CLI](https://www.serverless.com/framework/docs/providers/aws/cli-reference/support), which auto-include contextual info which you can review before sending.
- **Debug Summary for AI:** When you run into a bug, you can run "serverless support --ai" to generate a concise report detailing your last bug with all necessary context, optimized for pasting into AI tools such as ChatGPT.
- **New AWS Lambda Runtimes:** "python3.12", "dotnet8", and "java21".
- **Advanced Logging Controls for AWS Lambda:** Capture Logs in JSON, increased log granularity, and setting a custom Log Group. Here is the [AWS article](https://aws.amazon.com/blogs/compute/introducing-advanced-logging-controls-for-aws-lambda-functions/). Here is the [YAML implementation](https://github.com/serverless/serverless/blob/v4.0/docs/providers/aws/guide/serverless.yml.md#logs)
- **Axiom Integration:** Integrate with [Axiom's observability solution](https://www.serverless.com/framework/docs/guides/observability/axiom) for a powerful logging, metrics and traces experience, at 3X less than AWS cloudwatch.
- **AWS SSO:** Environment variables, especially ones set by AWS SSO, are prioritized. The Framework and Dashboard no longer interfere with these.
- **Automatic Updates:** These happen by default now. Though, you will be able to control the level of updates you're open to.
- **Improved Onboarding & Set-Up:** The `serverless` command has been re-written to be more helpful when setting up a new or existing project.
- **Updated Custom Resource Handlers:** All custom resource handlers now use `nodejs20.x`.
- **Deprecation Of Non-AWS Providers:** Deprecation of other cloud providers, in favor of handling this better in our upcoming Serverless Framework "Extensions".

## Breaking Changes

We're seeking to avoid breaking changes for the "aws" Provider. However, there are a few large things that are changing to be aware of:

- The V.4 License is changing. See the section below for more information on this.
- Authentication is required within the CLI.
- Non-AWS Providers have been deprecated. We will be introducing new ways in V.4 to use other cloud infrastructure vendors.

If you stumble upon additional breaking changes, please create an issue. To learn more about what's different and potential breaking changes, please see our [Upgrading to Serverless Framework V4 Documentation](https://www.serverless.com/framework/docs/guides/upgrading-v4).

## License Changes in V.4

Please note, the structure and licensing of the V.4 repository differ from the V.4 npm module. The npm module contains some proprietary licensed software, as V.4 transitions to a common SaaS product, [as previously announced](https://www.serverless.com/blog/serverless-framework-v4-a-new-model). The original Serverless Framework source code and more will continue to remain MIT license software, the repository will soon be restructured to clearly distinguish between proprietary and open-source components.

<br/>

# Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Examples](https://github.com/serverless/examples)
- [Plugins](https://github.com/serverless/plugins)
- [Community](#community)

<br/>

# <a name="features"></a>Features

- **Build More, Manage Less:** Innovate faster by spending less time on infrastructure management.
- **Maximum Versatility:** Tackle diverse serverless use cases, from APIs and scheduled tasks to web sockets and data pipelines.
- **Automated Deployment:** Streamline development with code and infrastructure deployment handled together.
- **Local Development:** Route events from AWS to your local AWS Lambda code to develop faster without having to deploy every change.
- **Ease of Use:** Deploy complex applications without deep cloud infrastructure expertise, thanks to simple YAML configuration.
- **Language Agnostic:** Build in your preferred language – Node.js, Python, Java, Go, C#, Ruby, Swift, Kotlin, PHP, Scala, or F#.
- **Complete Lifecycle Management:** Develop, deploy, monitor, update, and troubleshoot serverless applications with ease.
- **Scalable Organization:** Structure large projects and teams efficiently by breaking down large apps into Services to work on individually or together via Serverless Compose.
- **Effortless Environments:** Seamlessly manage development, staging, and production environments.
- **Customization Ready:** Extend and modify the Framework's functionality with a rich plugin ecosystem.
- **Vibrant Community:** Get support and connect with a passionate community of Serverless developers.

<br/>

# <a name="quick-start"></a>Quick Start

Here's how to install the Serverless Framework, set up a project and deploy it to Amazon Web Services on serverless infrastructure like AWS Lambda, AWS DynamoDB, AWS S3 and more.

<br/>

## Install the Serverless Framework via NPM

First, you must have the [Node.js runtime](https://nodejs.org) installed, version 18.20.3 or greater, then you can install the Serverless Framework via NPM.

Open your CLI and run the command below to install the Serverless Framework globally.

```text
npm i serverless -g
```

Run `serverless` to verify your installation is working, and show the current version.

<br/>

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

<br/>

## The `serverless` Command

The Serverless Framework ships with a `serverless` command that walks you through getting a project created and deployed onto AWS. It helps with downloading a Template, setting up AWS Credentials, setting up the Serverless Framework Dashboard, and more, while explaining each concept along the way.

This guide will also walk you through getting started with the Serverless Framework, but please note, simply typing the `serverless` command may be the superior experience.

```text
serverless
```

<br/>

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

<br/>

## Signing In

As of Serverless Framework V.4, if you are using the `serverless` command to set up a Service, it will eventually ask you to log in.

If you need to log in outside of that, run `serverless login`.

Logging in will redirect you to the [Serverless Framework Dashboard](https://app.serverless.com) within your browser. After registering or logging in, go back to your CLI and you will be signed in.

Please note, you can get up and running with the Serverless Framework CLI and Dashboard for free, and the CLI will always be free for small orgs and indiehackers. For more information on pricing, check out our [pricing page](https://serverless.com/pricing).

<br/>

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

<br/>

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

<br/>

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

<br/>

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

<br/>

## Invoking

To invoke your AWS Lambda function on the cloud, you can find URLs for your functions w/ API endpoints in the `serverless deploy` output, or retrieve them via `serverless info`. If your functions do not have API endpoints, you can use the `invoke` command, like this:

```bash
sls invoke -f hello

# Invoke and display logs:
serverless invoke -f hello --log
```

More details on the `invoke` command can be found [here](https://www.serverless.com/framework/docs/providers/aws/cli-reference/invoke).

<br/>

## Deploy Functions

To deploy code changes quickly, you can skip the `serverless deploy` command which is much slower since it triggers a full AWS CloudFormation update, and deploy only code and configuration changes to a specific AWS Lambda function.

To deploy code and configuration changes to individual AWS Lambda functions in seconds, use the `deploy function` command, with `-f [function name in serverless.yml]` set to the function you want to deploy.

```text
serverless deploy function -f my-api
```

More details on the `deploy function` command can be found [here](https://www.serverless.com/framework/docs/providers/aws/cli-reference/deploy-function).

<br/>

## Streaming Logs

You can use Serverless Framework to stream logs from AWS Cloudwatch directly to your terminal. Use the `sls logs` command in a separate terminal window:

```bash
sls logs -f [Function name in serverless.yml] -t
```

Target a specific function via the `-f` option and enable tailing (i.e. streaming) via the `-t` option.

<br/>

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

More details on the **serverless-offline** plugins command can be found [here](https://github.com/dherault/serverless-offline).

<br/>

## Use Plugins

A big benefit of Serverless Framework is within its [Plugin ecosystem](https://serverless.com/plugins).

Plugins extend or overwrite the Serverless Framework, giving it new use-cases or capabilites, and there are hundreds of them.

Some of the most common Plugins are:

- **[Serverless Offline](https://github.com/dherault/serverless-offline)** - Emulate AWS Lambda and API Gateway locally when developing your Serverless project.
- **[Serverless Domain Manager](https://github.com/amplify-education/serverless-domain-manager)** - Manage custom domains with AWS API Gateways.
- **[Serverless Step Functions](https://github.com/serverless-operations/serverless-step-functions)** - Build AWS Step Functions architectures.
- **[Serverless Python Requirements](https://github.com/serverless/serverless-python-requirements)** - Bundle dependencies from requirements.txt and make them available in your PYTHONPATH.

<br/>

## Remove Your Service

If you want to delete your service, run `remove`. This will delete all the AWS resources created by your project and ensure that you don't incur any unexpected charges. It will also remove the service from Serverless Dashboard.

```bash
serverless remove
```

More details on the `remove` command can be found [here](https://www.serverless.com/framework/docs/providers/aws/cli-reference/remove).

<br/>

## Composing Services

Serverless Framework Compose allows you to work with multiple Serverless Framework Services at once, and do the following...

- Deploy multiple services in parallel
- Deploy services in a specific order
- Share outputs from one service to another
- Run commands across multiple services

Here is what a project structure might look like:

```bash
my-app/
  service-a/
    src/
      ...
    serverless.yml
  service-b/
    src/
      ...
    serverless.yml
```

Using Serverless Framework Compose requires a `serverless-compose.yml` file. In it, you specify which Services you wish to deploy. You can also share data from one Service to another, which also creates a deployment order.

```yaml
# serverless-compose.yml

services:
  service-a:
    path: service-a

  service-b:
    path: service-b
    params:
      queueUrl: ${service-a.queueUrl}
```

Currently, outputs to be inherited by another Service must be AWS Cloudformation Outputs.

```yaml
# service-a/serverless.yml

# ...

resources:
  Resources:
    MyQueue:
      Type: AWS::SQS::Queue
      # ...
  Outputs:
    queueUrl:
      Value: !Ref MyQueue
```

The value will be passed to `service-b` [as a parameter](https://www.serverless.com/framework/docs/guides/parameters) named `queueUrl`. Parameters can be referenced in Serverless Framework configuration via the `${param:xxx}` syntax:

```yaml
# service-b/serverless.yml

provider:
  ...
  environment:
    # Here we inject the queue URL as a Lambda environment variable
    SERVICE_A_QUEUE_URL: ${param:queueUrl}
```

More details on Serverless Framework Compose can be found [here](https://www.serverless.com/framework/docs/guides/compose).

<br/>

## Support Command

In Serverless Framework V.4, we've introduced the `serverless support` command, a standout feature that lets you generate issue reports, or directly connect with our support team. It automatically includes relevant context and omits sensitive details like secrets and account information, which you can check before submission. This streamlined process ensures your issues are quickly and securely addressed.

To use this feature, after an error or any command, run:

```bash
sls support
```

After each command, whether it succeeded or not, the context is saved within your current working directory in the `.serverless` folder.

To open a new support ticket, run the `sls support` command and select `Get priority support...`. Optionally you'll be able to review and edit the generated report. Opening support tickets is only available to users who sign up for a Subscription.

You can also generate reports without submitting a new support ticket. This is useful for sharing context with others, opening Github issues, or using it with an AI prompt like ChatGPT. To do this, run the `sls support` command and select `Create a summary report...`, or `Create a comprehensive report..`. You can skip the prompt by running `sls support --summary` or `sls support --all`. This is especially useful for capturing the report into the clipboard (e.g. `sls support --summary | pbcopy`).

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

## Security and Bug Disclosure

We take security seriously. If you discover a security issue, please responsibly disclose it by contacting us at [support@serverless.com](mailto:support@serverless.com). Please do not publicly disclose vulnerabilities until we have addressed them.

For more details, see our [Security Policy](./SECURITY.md).
