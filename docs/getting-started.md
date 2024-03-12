<!--
title: Setting Up Serverless Framework With AWS
layout: Doc
-->

# Setting Up Serverless Framework With AWS

Here's how to install the Serverless Framework, set up a project and deploy it to Amazon Web Services.

The Serverless Framework is packaged as a binary, which can be installed via this CURL script.

```bash
curl -o- -L https://install.serverless.com | bash
```

You can also install the Framework via NPM. You will need to have [Node.js](https://nodejs.org) installed.

```bash
npm i serverless -g
```

## Create A Project

Run the interactive onboarding via the "serverless" command, to pick a Template and set-up credentials for AWS.

```bash
serverless
```

During onboarding, you can set up AWS credentials a few ways. You can simply add them as environment variables, which is best if you're using AWS SSO. You can have the Serverless Framework Platform store an AWS IAM Role for you and your team to share and assign to specific Stages, or you can persist long-term credentials to an AWS Profile on your local machine. We recommend the first two options.

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

* **[Serverless Offline](https://github.com/dherault/serverless-offline)** - Emulate AWS Lambda and API Gateway locally when developing your Serverless project.
* **[Serverless ESBuild](https://github.com/floydspace/serverless-esbuild)** - Bundles JavaScript and TypeScript extremely fast via esbuild.
* **[Serverless Domain Manager](https://github.com/amplify-education/serverless-domain-manager)** - Manage custom domains with AWS API Gateways.
* **[Serverless Step Functions](https://github.com/serverless-operations/serverless-step-functions)** - Build AWS Step Functions architectures.
* **[Serverless Python Requirements](https://github.com/serverless/serverless-python-requirements)** - Bundle dependencies from requirements.txt and make them available in your PYTHONPATH.

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
