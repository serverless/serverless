<!--
title: Serverless Framework Commands - AWS Lambda - Dev
description: The dev command enables real-time, local development and testing of AWS Lambda functions without frequent redeployments or the need for emulation.
short_title: Commands - Dev
keywords:
  [
    'Serverless',
    'Framework',
    'AWS',
    'Lambda',
    'Dev',
    'Local Development',
    'Serverless CLI',
    'AWS Lambda Testing',
    'AWS IoT Core',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/dev)

<!-- DOCS-SITE-LINK:END -->

# AWS - Dev

This command activates a development session on the specified stage and region. This allows you to run, develop, and test your functions locally while they are being invoked in real-time remotely on AWS Lambda. It establishes a long-running CLI session that connects directly to your Lambda functions, waiting for events to invoke them. This method significantly simplifies the development of your functions locally, eliminating the need for deployment after every change, and allows you to work with real infrastructure without any emulation.

```bash
serverless dev
```

## Options

- `--stage` or `-s` The stage in your service that you want to activate a development session for.
- `--region` or `-r` The region in that stage that you want to active a development session for.
- `--aws-profile` The AWS profile you want to use.

**Note:** While it is possible, we do not recommend activating a development session in your `prod` stage.

## Supported runtimes

- Node.js (JS & TS)
- Python (coming soon)
- Go (coming soon)
- Ruby (coming soon)
- Java (coming soon)

## How it works

To establish a secure connection between your AWS Lambda functions and your local machine, we initiate a WebSocket connection through AWS IoT Core. Each AWS account is equipped with a unique, secure IoT Core endpoint available for immediate use, eliminating the need for deploying any additional infrastructure—unlike WebSocket solutions that rely on AWS API Gateway. Thus, when you execute sls dev, the CLI incorporates a shim into all your lambda functions, routing all events via this WebSocket connection to your local machine. To facilitate this, we must also update the permissions for all lambda functions to access AWS IoT Core by adding the following IAM statement:

```
Effect: 'Allow',
Action: ['iot:*'],
Resource: '*'
```

Subsequently, we deploy your service similarly to executing sls deploy, albeit without your service code and with modified configurations. The CLI then maintains a long-running session, awaiting invocation events.

To finalize development and save your changes, you must exit the development session and perform a standard `sls deploy`.

## Environment

When a development session is active, it's set up to listen for invocation events from your functions. Upon receiving such an event, the CLI creates a new child process that closely replicates the environment of the Lambda function that was invoked. This replication includes the same environment variables, IAM permissions, context, and the event itself. The child process then executes your handlers with this comprehensive dataset, outputs all your function logs directly to the local terminal, and sends the response back to Lambda, along with any errors that might have occurred.

### Examples

Activate a quick development session in the default `dev` stage...

```bash
serverless dev
```

Activate a development session in the dev stage, but in the `us-east-2` region...

```bash
serverless dev --stage dev --region us-east-2

```

Activate a development session in your own personal stage...

```bash
serverless dev --stage austen

```

Activate a development session in a stage called "local"...

```bash
serverless dev --stage local
```

Maintaining a dedicated local stage is beneficial for quickly activating a development session without needing to modify your infrastructure each time you execute the command.

## Troubleshooting

### Typescript isn't working for me.

Under the hood Serverless uses `ts-node` for invoking your functions locally, and does require a `tsconfig.json` file. Make sure you have a valid config file and try again.

### Lambda functions inside a VPC aren't working for me

The `dev` command does not work out-of-the-box with AWS Lambda functions running inside a VPC. To enable it, you can either temporarily remove the VPC configuration or update your VPC setup to allow connectivity with AWS IoT Core. For detailed instructions, refer to [the official AWS documentation on using AWS IoT Core with interface VPC endpoints](https://docs.aws.amazon.com/vpc/latest/privatelink/create-interface-endpoint.html).
