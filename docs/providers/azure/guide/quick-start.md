<!--
title: Serverless Framework - Azure Functions Guide - Quick Start
menuText: Quick Start
menuOrder: 1
description: Getting started with the Serverless Framework on Azure Functions
layout: Doc
-->

# Azure Functions - Quickstart

## Pre-requisites

1. Node.js v6.5.0+ _(this is the runtime version supported by Azure Functions)_
2. Serverless CLI `v1.9.0+`. You can run `npm i -g serverless` if you don't already have it.
3. An Azure account. If you don't already have one, you can sign up for a [free trial](https://azure.microsoft.com/en-us/free/) that includes \$200 of free credit.

## Create a new Azure Function App

```bash
# Create Azure Function App from template
$ sls create -t azure-nodejs -p <appName>
# Move into project directory
$ cd <appName>
# Install dependencies (including this plugin)
$ npm install
```

## Running Function App Locally (`offline` plugin)

In order to run a Azure Function App locally, the `azure-functions-core-tools` package needs to be installed from NPM. Since it is only used for local development, we did not include it in the `devDependencies` of `package.json`. To install globally, run:

```bash
$ npm i azure-functions-core-tools -g
```

Then, at the root of your project directory, run:

```bash
# Builds necessary function bindings files
$ sls offline
# Starts the function app
$ npm start
```

The `offline` process will generate a directory for each of your functions, which will contain a file titled `function.json`. This will contain a relative reference to your handler file & exported function from that file as long as they are referenced correctly in `serverless.yml`.

The `npm start` script just runs `func host start`, but we included the `npm` script for ease of use.

To clean up files generated from the build, you can simply run:

```bash
sls offline cleanup
```

## Deploy Your Function App

Deploy your new service to Azure! The first time you do this, you will be asked to authenticate with your Azure account, so the `serverless` CLI can manage Functions on your behalf. Simply follow the provided instructions, and the deployment will continue as soon as the authentication process is completed.

```bash
$ sls deploy
```

For more advanced deployment scenarios, see our [deployment docs](https://github.com/serverless/serverless-azure-functions/blob/master/docs/DEPLOY.md)

## Test Your Function App

Invoke your HTTP functions without ever leaving the CLI using:

```bash
$ sls invoke -f <functionName>
```

##### Invoke Options

- `-f` or `--function` - Function to Invoke
- `-d` or `--data` - Stringified JSON data to use as either query params or request body
- `-p` or `--path` - Path to JSON file to use as either query params or request body
- `-m` or `--method` - HTTP method for request

##### Example

After deploying template function app, run

```bash
$ sls invoke -f hello '{"name": "Azure"}'
```

### Roll Back Your Function App

To roll back your function app to a previous deployment, simply select a timestamp of a previous deployment and use `rollback` command.

```bash
# List all deployments to know the timestamp for rollback
$ sls deploy list
Serverless:
-----------
Name: myFunctionApp-t1561479533
Timestamp: 1561479533
Datetime: 2019-06-25T16:18:53+00:00
-----------
Name: myFunctionApp-t1561479506
Timestamp: 1561479506
Datetime: 2019-06-25T16:18:26+00:00
-----------
Name: myFunctionApp-t1561479444
Timestamp: 1561479444
Datetime: 2019-06-25T16:17:24+00:00
-----------

# Rollback Function App to timestamp
$ sls rollback -t 1561479506
```

This will update the app code and infrastructure to the selected previous deployment.

For more details, check out our [rollback docs](https://github.com/serverless/serverless-azure-functions/blob/dev/docs/DEPLOY.md).

## Deleting Your Function App

If at any point you no longer need your service, you can run the following command to delete the resource group containing your Azure Function App and other depoloyed resources using:

```bash
$ sls remove
```

## Creating or removing Azure Functions

To create a new Azure Function within your function app, run the following command from within your app's directory:

```bash
# -n or --name for name of new function
$ sls func add -n {functionName}
```

This will create a new handler file at the root of your project with the title `{functionName}.js`. It will also update `serverless.yml` to contain the new function.

To remove an existing Azure Function from your function app, run the following command from within your app's directory:

```bash
# -n or --name for name of function to remove
$ sls func remove -n {functionName}
```

This will remove the `{functionName}.js` handler and remove the function from `serverless.yml`

\*Note: Add & remove currently only support HTTP triggered functions. For other triggers, you will need to update `serverless.yml` manually

## Advanced Authentication

The getting started walkthrough illustrates the interactive login experience, which is recommended when getting started. However, for more robust use, a [service principal](https://docs.microsoft.com/en-us/azure/active-directory/develop/app-objects-and-service-principals) is recommended for authentication.

##### Creating a Service Principal

1. [Install the Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest)
2. Login via Azure CLI and set subscription
   ```bash
   # Login to Azure
   $ az login
   ```
   This will yield something like:
   ```json
   [
     {
       "cloudName": "<cloudName>",
       "id": "<subscription-id>",
       "isDefault": true,
       "name": "<name>",
       "state": "<state>",
       "tenantId": "<tenantId>",
       "user": {
         "name": "<name>",
         "type": "<user>"
       }
     }
   ]
   ```
3. Set Azure Subscription for which to create Service Principal
   ```bash
   $ az account set -s <subscription-id>
   ```
4. Generate Service Principal for Azure Subscription
   ```bash
   # Create SP with unique name
   $ az ad sp create-for-rbac --name <name>
   ```
   This will yield something like:
   ```json
   {
     "appId": "<servicePrincipalId>",
     "displayName": "<name>",
     "name": "<name>",
     "password": "<password>",
     "tenant": "<tenantId>"
   }
   ```
5. Set environment variables

   **Bash**

   ```bash
   $ export AZURE_SUBSCRIPTION_ID='<subscriptionId>'
   $ export AZURE_TENANT_ID='<tenantId>'
   $ export AZURE_CLIENT_ID='<servicePrincipalId>'
   $ export AZURE_CLIENT_SECRET='<password>'
   ```

   **Powershell**

   ```powershell
   $env:AZURE_SUBSCRIPTION_ID='<subscriptionId>'
   $env:AZURE_TENANT_ID='<tenantId>'
   $env:AZURE_CLIENT_ID='<servicePrincipalName>'
   $env:AZURE_CLIENT_SECRET='<password>'
   ```
