<!--
title: 'Tutorial: Build an HTTP API with Lambda and DynamoDB'
description: 'Create, deploy, test and remove your first service: an HTTP API on AWS Lambda that stores customers in DynamoDB, with Node.js and AWS SDK v3.'
short_title: 'Tutorial: First HTTP API'
keywords:
  [
    'Serverless Framework tutorial',
    'first serverless project',
    'AWS Lambda HTTP API tutorial',
    'Lambda DynamoDB tutorial',
    'API Gateway HTTP API',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/tutorial)

<!-- DOCS-SITE-LINK:END -->

# Tutorial: Build an HTTP API with Lambda and DynamoDB

In this tutorial you create your first Serverless Framework service and deploy it to AWS: an HTTP API with two endpoints backed by AWS Lambda functions and an Amazon DynamoDB table. `POST /customers` stores a customer, and `GET /customers` lists them. At the end you remove everything you deployed.

You will:

1. Create the service from a template with the `serverless` command.
2. Deploy the template and call its endpoint.
3. Add a DynamoDB table and two Node.js functions that use the AWS SDK for JavaScript v3.
4. Deploy again and test the endpoints with `curl`.
5. Remove the service from your AWS account.

For a video walkthrough of creating and deploying a first service, watch the [Serverless Framework Getting Started Tutorial](https://www.youtube.com/watch?v=dMVfqCTzuwk).

::youtube{id="dMVfqCTzuwk"}

## Prerequisites

- An AWS account. To create one, use the [AWS sign-up page](https://portal.aws.amazon.com/billing/signup). The identity you deploy with needs permission to create the resources in this tutorial; [AWS Credentials](./providers/aws/guide/credentials.md) lists the options.
- Node.js 20 or later and npm, to install the Framework and the AWS SDK clients ([install Node.js](https://nodejs.org/en/download)); the AWS SDK clients this tutorial installs require Node.js 20 or later. The AWS SDK for JavaScript v3 [drops support for a Node.js version](https://aws.amazon.com/blogs/developer/aws-sdk-for-javascript-aligns-with-node-js-release-schedule/) some months after that version's end of life; on an older Node.js, npm warns about the clients' supported versions, or refuses to install them when `engine-strict` is set. The Node.js version on your machine doesn't decide the Lambda runtime; `serverless.yml` does.
- A terminal and a web browser on the same machine. Signing in to Serverless Framework and to the AWS Console opens the browser.
- `curl`, to call the API.

## Install the Serverless Framework

Install the CLI globally with npm:

```bash
npm install -g serverless
```

npm 12 prints an `install-scripts` warning that the `serverless` package's install script was blocked. The CLI still works: the first `serverless` command downloads the Framework into `~/.serverless/releases/<version>`.

Check the installation:

```bash
serverless --version
```

The command prints the installed version (on the first run, after `✔ Installed Serverless Framework v4.46.0`):

```text
Serverless ϟ Framework 4.46.0
```

For proxies, firewalls and other installation options, see [Setting up the Serverless Framework](./getting-started.md).

## What is the Serverless Dashboard?

The [Serverless Framework Dashboard](https://app.serverless.com) is the web app that comes with the Framework. Your Serverless Framework account lives there, so the CLI signs you in through it. For a team, it also shows every deployment in one place, stores secrets and parameters, connects AWS accounts as Providers so deploys need no local AWS credentials, and gives metrics, traces, logs and alerts for your functions. This tutorial uses it only to sign in; see [Serverless Framework Dashboard](./guides/dashboard/README.md) for the rest.

## Create the service from a template

The `serverless` command with no arguments creates a service from a template, signs you in and sets up AWS credentials. It prompts for each choice, so it needs an interactive terminal.

1. In a folder without a `serverless.yml` or `serverless-compose.yml` file (in any of their formats, such as `.yaml` or `.ts`), run:

   ```bash
   serverless
   ```

2. At `Select A Template`, choose `AWS / Node.js / HTTP API`.
3. At `Name Your Project`, enter `customers-api`. The CLI downloads the template into a new `customers-api` folder and sets `service: customers-api` in its `serverless.yml`.
4. The CLI needs a Serverless Framework account or a License Key. If you aren't signed in yet, it asks you to choose: pick `Login/Register` (the other choices are `Get A License`, `Enter A License Key` and `Explain Licensing Basics`; see [License keys](./guides/license-keys.md)). Your browser opens the Serverless Framework Dashboard; after you sign in or register, the CLI saves the session in `~/.serverlessrc` (or `~/.config/.serverlessrc` when only that file exists) and continues. It adds an `org` line with your org name to `serverless.yml`.
5. If the CLI asks `Create Or Select An Existing App` (it does when you're signed in with an account, not with a License Key), choose `Skip Adding An App`.
6. If the CLI asks for an `AWS Credentials Set-Up Method`, choose `Sign in with AWS Console (Recommended)` and keep the profile name `default`. Your browser opens the AWS sign-in page; after you sign in, the CLI writes the `default` profile to `~/.aws/config` and caches short-lived credentials in `~/.aws/login/cache`. The CLI skips this step when it already finds AWS credentials on your machine, or when your org has a default Provider in the Dashboard. To use another AWS profile you already have, add `--aws-profile PROFILE_NAME` to each later `serverless` command; [Which credentials a deploy uses](./providers/aws/guide/credentials.md#which-credentials-a-deploy-uses) lists every source in order, including the ones that take precedence over `--aws-profile`.

The CLI ends with the next steps:

```text
Your new Service "customers-api" is ready. Here are next steps:

• Open Service Directory: cd customers-api
• Install Dependencies: npm install (or use another package manager)
• Deploy Your Service: serverless deploy
```

The template has no `package.json`, so skip `npm install` for now. The `customers-api` folder includes `serverless.yml` and a `handler.js` file with one function, `hello`.

**Without an interactive terminal** (CI, an AI agent), the `serverless` command can't prompt. Create the `customers-api` folder yourself, write the files from [Add a DynamoDB table and two functions](#add-a-dynamodb-table-and-two-functions), and provide the Serverless Framework and AWS credentials as described in [Non-interactive use: CI and AI agents](./providers/aws/cli-reference/README.md#non-interactive-use-ci-and-ai-agents).

## Deploy the template service

Go into the service folder and deploy:

```bash
cd customers-api
serverless deploy
```

The Framework packages the code, creates an AWS CloudFormation stack named `customers-api-dev` and prints the endpoint of the HTTP API. The template sets no stage or Region, so without a `--stage` or `--region` option the Framework deploys to the `dev` stage in `us-east-1`:

```text
Deploying "customers-api" to stage "dev" (us-east-1)

✔ Service deployed to stack customers-api-dev (45s)

endpoint: GET - https://abc123def4.execute-api.us-east-1.amazonaws.com/
functions:
  hello: customers-api-dev-hello (1.6 kB)
```

When the AWS credentials come from a Dashboard Provider, the first line also names the Provider.

To deploy to another stage or Region, add `--stage` and `--region`, for example `serverless deploy --stage staging --region eu-west-1`. The stack is then `customers-api-staging`. Pass the same options to every later command in this tutorial (`serverless deploy`, `serverless logs`, `serverless remove`); without them, those commands target the `dev` stage in `us-east-1`.

Call the endpoint from the output:

```bash
curl https://abc123def4.execute-api.us-east-1.amazonaws.com/
```

The `hello` function answers:

```json
{ "message": "Go Serverless v4! Your function executed successfully!" }
```

## Add a DynamoDB table and two functions

In the `customers-api` folder, you replace the template's function with two functions that read and write a DynamoDB table.

1. Delete the template's `handler.js` file:

   ```bash
   rm handler.js
   ```

2. Create `createCustomer.mjs`. The function reads a JSON body with `name` and `email` and stores it in the table:

   ```javascript
   import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
   import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'

   const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))

   export const handler = async (event) => {
     const body = event.isBase64Encoded
       ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
       : (event.body ?? '')

     let customer
     try {
       customer = JSON.parse(body)
     } catch {
       return {
         statusCode: 400,
         body: JSON.stringify({ error: 'Body must be JSON' }),
       }
     }

     if (
       typeof customer?.name !== 'string' ||
       typeof customer?.email !== 'string' ||
       !customer.name ||
       !customer.email
     ) {
       return {
         statusCode: 400,
         body: JSON.stringify({ error: 'name and email are required' }),
       }
     }

     await ddb.send(
       new PutCommand({
         TableName: process.env.CUSTOMERS_TABLE,
         Item: { email: customer.email, name: customer.name },
       }),
     )

     return {
       statusCode: 201,
       body: JSON.stringify({ name: customer.name, email: customer.email }),
     }
   }
   ```

   HTTP API passes the request body as a string, base64-encoded when `isBase64Encoded` is `true`, so the function decodes it only in that case. The table name comes from the `CUSTOMERS_TABLE` environment variable, which `serverless.yml` sets in step 5.

3. Create `getCustomers.mjs`. The function returns the customers stored in the table:

   ```javascript
   import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
   import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb'

   const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))

   export const handler = async () => {
     const result = await ddb.send(
       new ScanCommand({
         TableName: process.env.CUSTOMERS_TABLE,
         ConsistentRead: true,
       }),
     )

     return {
       statusCode: 200,
       body: JSON.stringify({
         total: result.Count,
         items: result.Items.map(({ name, email }) => ({ name, email })),
       }),
     }
   }
   ```

   `ConsistentRead: true` makes the scan include every write that finished before it, such as a customer added just before. A `Scan` returns at most 1 MB of items per call, and this function returns only that first page, so `total` and `items` cover that page; that holds every customer in this tutorial. For large tables, query by key instead, or read the next pages with `LastEvaluatedKey` ([Scanning tables in DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Scan.html#Scan.Pagination)).

4. Create a `package.json` in the `customers-api` folder and install the AWS SDK v3 clients:

   ```bash
   npm init -y
   npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
   ```

   Without its own `package.json`, the folder isn't a project for npm: when a parent folder has a `package.json` or `node_modules`, `npm install` installs the clients there instead, outside the service.

   The Framework packages `node_modules` with your functions, so they run the client versions pinned in `package.json`.

5. In `serverless.yml`, keep the `org` line the `serverless` command added at the top (and the `app` line, if there is one), and replace everything below it with:

   ```yaml
   service: customers-api

   provider:
     name: aws
     runtime: nodejs24.x
     architecture: arm64
     environment:
       CUSTOMERS_TABLE: ${self:service}-customers-${sls:stage}
     iam:
       role:
         statements:
           - Effect: Allow
             Action:
               - dynamodb:PutItem
               - dynamodb:Scan
             Resource: !GetAtt CustomersTable.Arn

   functions:
     createCustomer:
       handler: createCustomer.handler
       events:
         - httpApi:
             path: /customers
             method: post
     getCustomers:
       handler: getCustomers.handler
       events:
         - httpApi:
             path: /customers
             method: get

   resources:
     Resources:
       CustomersTable:
         Type: AWS::DynamoDB::Table
         Properties:
           TableName: ${self:service}-customers-${sls:stage}
           BillingMode: PAY_PER_REQUEST
           AttributeDefinitions:
             - AttributeName: email
               AttributeType: S
           KeySchema:
             - AttributeName: email
               KeyType: HASH
   ```

The new `serverless.yml` sets up the following:

- `provider.environment` sets `CUSTOMERS_TABLE` on every function in the service. `${self:service}` and `${sls:stage}` make the name `customers-api-customers-dev` for the `dev` stage, so each stage gets its own table.
- `provider.iam.role.statements` adds a policy statement to the IAM role the Framework creates for the service's functions: `PutItem` and `Scan` on this table only. See [IAM permissions for functions](./providers/aws/guide/iam.md).
- `functions` maps each function to its file and exported `handler` (`createCustomer.handler` is the `handler` export of `createCustomer.mjs`), and each `httpApi` event adds a route to the service's HTTP API. See [HTTP API events](./providers/aws/events/http-api.md).
- `resources` adds the DynamoDB table to the CloudFormation stack, with on-demand billing and `email` as the partition key. See [AWS infrastructure resources](./providers/aws/guide/resources.md).

To check the file before deploying, run `serverless print`. It prints the configuration with variables resolved, and a warning if a Framework property is misspelled; properties under `custom` and the CloudFormation properties under `resources` aren't checked this way ([configuration validation](./configuration-validation.md)).

## Deploy and test the API

Deploy the changes:

```bash
serverless deploy
```

The Framework updates the `customers-api-dev` stack: it removes the `hello` function, and adds the table, the two functions and their routes:

```text
Deploying "customers-api" to stage "dev" (us-east-1)

✔ Service deployed to stack customers-api-dev (60s)

endpoints:
  POST - https://abc123def4.execute-api.us-east-1.amazonaws.com/customers
  GET - https://abc123def4.execute-api.us-east-1.amazonaws.com/customers
functions:
  createCustomer: customers-api-dev-createCustomer (2.8 MB)
  getCustomers: customers-api-dev-getCustomers (2.8 MB)
```

Both functions share one deployment package, so they show the same size. Replace the URL in the following commands with the one from your output.

The two routes have no authorization: anyone with the URL can add and list customers, so store only test data in this API. To restrict who can call the routes, add an authorizer, such as a [JWT authorizer](./providers/aws/events/http-api.md#jwt-authorizers).

Add a customer:

```bash
curl -X POST https://abc123def4.execute-api.us-east-1.amazonaws.com/customers \
  -H 'Content-Type: application/json' \
  -d '{"name":"Jane Doe","email":"jane@example.com"}'
```

The `createCustomer` function returns the stored customer with status 201:

```json
{ "name": "Jane Doe", "email": "jane@example.com" }
```

List the customers:

```bash
curl https://abc123def4.execute-api.us-east-1.amazonaws.com/customers
```

The `getCustomers` function returns the table's items:

```json
{ "total": 1, "items": [{ "name": "Jane Doe", "email": "jane@example.com" }] }
```

To see a function's logs, run `serverless logs --function createCustomer`. Each later `serverless deploy` updates the same stack; when nothing changed, the Framework prints `No changes to deploy. Deployment skipped.`

## Remove the service

**Warning:** `serverless remove` deletes the `customers-api-dev` stack, including the DynamoDB table and every customer stored in it.

```bash
serverless remove
```

The Framework deletes the stack and the service's deployment files:

```text
Removing "customers-api" from stage "dev" (us-east-1)

✔ Service customers-api has been successfully removed (30s)
```

The AWS credentials profile, your Serverless Framework sign-in and the local `customers-api` folder stay. The shared S3 bucket the Framework uploads deployment files to stays in your account for other services; see [Deployment bucket](./guides/deployment-bucket.md).

## Next steps

You built an HTTP API with two Lambda functions and a DynamoDB table, deployed it, tested it and removed it. To continue:

- [Serverless Framework concepts](./providers/aws/guide/intro.md): services, functions, events and resources.
- [Dev Mode](./providers/aws/guide/dev-mode.md): run your functions locally against live AWS events.
- [Deploying](./providers/aws/guide/deploying.md): stages, Regions and what a deploy does.
- [Examples and tutorials](./examples-and-tutorials.md): more templates and examples to start from.
