<!--
title: 'Examples and Tutorials'
description: 'Start a Serverless Framework service from a built-in template or an example service, and find the step-by-step tutorials.'
short_title: 'Examples & Tutorials'
keywords:
  [
    'Serverless Framework examples',
    'Serverless Framework templates',
    'Serverless tutorials',
    'AWS Lambda examples',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/examples-and-tutorials)

<!-- DOCS-SITE-LINK:END -->

# Examples and tutorials

Start a new service from a built-in template, copy an example service that already does what you need, or follow a tutorial step by step. Templates and examples both come from the [serverless/examples](https://github.com/serverless/examples) repository on GitHub.

## Create a service from a template

To create a service from a built-in template, run `serverless` with no arguments in a folder without a `serverless.yml` or `serverless-compose.yml` file (in any of their formats, such as `.yaml` or `.ts`):

```bash
serverless
```

In a folder that has one of those files, the command sets up that service or Compose project instead of creating a new one. Otherwise it prompts for a template and a project name, downloads the template from the `v4` branch of serverless/examples into a new folder named after the project, and then helps you sign in and set up AWS credentials. It needs an interactive terminal. The templates it offers:

| Template                                          | Folder in serverless/examples   |
| ------------------------------------------------- | ------------------------------- |
| AWS / Node.js / HTTP API                          | `aws-node-http-api`             |
| AWS / Node.js / Express API                       | `aws-node-express-api`          |
| AWS / Node.js / Express API with DynamoDB         | `aws-node-express-dynamodb-api` |
| AWS / Node.js / Scheduled Task                    | `aws-node-scheduled-cron`       |
| AWS / Node.js / Simple Function                   | `aws-node`                      |
| AWS / Python / HTTP API                           | `aws-python-http-api`           |
| AWS / Python / Flask API                          | `aws-python-flask-api`          |
| AWS / Python / Flask API with DynamoDB            | `aws-python-flask-dynamodb-api` |
| AWS / Python / Scheduled Task                     | `aws-python-scheduled-cron`     |
| AWS / Python / Simple Function                    | `aws-python`                    |
| AWS / Compose / Serverless + Cloudformation + SAM | `compose-multiframework`        |

For the full walkthrough of the command, see [Setting up the Serverless Framework](./getting-started.md).

## Use an example service

The [Serverless Framework examples](https://www.serverless.com/examples) page lists the official and community examples, and the [serverless/examples](https://github.com/serverless/examples) repository holds the official ones, one folder per example. Each folder has a `README.md` that explains what the example deploys and how to run it.

To deploy an official example, clone the repository and deploy from the example's folder:

```bash
git clone https://github.com/serverless/examples
cd examples/aws-node-http-api
serverless deploy
```

Install the example's dependencies first when its `README.md` says so (for example `npm install` for a folder with a `package.json`).

## Tutorials

- [Tutorial: Build an HTTP API with Lambda and DynamoDB](./tutorial.md): create, deploy, test and remove a first service with two Node.js functions and a DynamoDB table.
- [Setting up the Serverless Framework](./getting-started.md): install the CLI, sign in, set up AWS credentials and deploy a template.
- [Serverless blog](https://www.serverless.com/blog): articles on building with the Framework.

## Contribute an example

To share an example, open a pull request on [serverless/examples](https://github.com/serverless/examples). The repository's `README.md` describes how to add example code and how to list a community example that lives in your own repository.
