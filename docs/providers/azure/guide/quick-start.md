<!--
title: Serverless Framework - Azure Functions Guide - Quick Start
menuText: Quick Start
menuOrder: 1
description: Getting started with the Serverless Framework on Azure Functions
layout: Doc
-->

# Azure Functions - Quickstart

We try to keep this page up to date, but the **most** up to date documentation can be found in our [README](https://github.com/serverless/serverless-azure-functions#azure-functions-serverless-plugin)

### Pre-requisites

1. Node.js 8.x or above
2. Serverless CLI `v1.9.0+`. You can run `npm i -g serverless` if you don't already have it.
3. An Azure account. If you don't already have one, you can sign up for a [free trial](https://azure.microsoft.com/en-us/free/) that includes \$200 of free credit.

### Create a new Azure Function App

```bash
# Create Azure Function App from template
# Templates include: azure-nodejs, azure-python, azure-dotnet
$ sls create -t azure-nodejs -p <appName>
# Move into project directory
$ cd <appName>
# Install dependencies (including this plugin)
$ npm install
```

The `serverless.yml` file contains the configuration for your service. For more details on its configuration, see [the docs](https://github.com/serverless/serverless-azure-functions/blob/master/docs/CONFIG.md).

### Running Function App Locally (`offline` plugin)

At the root of your project directory, run:

```bash
# Builds necessary function bindings files and starts the function app
$ sls offline
```

The `offline` process will generate a directory for each of your functions, which will contain a file titled `function.json`. This will contain a relative reference to your handler file & exported function from that file as long as they are referenced correctly in `serverless.yml`.

After the necessary files are generated, it will start the function app from within the same shell. For HTTP functions, the local URLs will be displayed in the console when the function app is initialized.

To build the files _without_ spawning the process to start the function app, run:

```bash
$ sls offline build
```

To simply start the function app _without_ building the files, run:

```bash
$ sls offline start
```

To clean up files generated from the build, run:

```bash
$ sls offline cleanup
```

To pass additional arguments to the spawned `func host start` process, add them as the option `spawnargs` (shortcut `a`). Example:

```bash
$ sls offline -a "--cors *"
```

This works for `sls offline` or `sls offline start`

### Dry-Run Deployment

Before you deploy your new function app, you may want to double check the resources that will be created, their generated names and other basic configuration info. You can run:

```bash
# -d is short for --dryrun
$ sls deploy --dryrun
```

This will print out a basic summary of what your deployed service will look like.

For a more detailed look into the generated ARM template for your resource group, add the `--arm` (or `-a`) flag:

```bash
$ sls deploy --dryrun --arm
```

### Deploy Your Function App

Deploy your new service to Azure! The first time you do this, you will be asked to authenticate with your Azure account, so the `serverless` CLI can manage Functions on your behalf. Simply follow the provided instructions, and the deployment will continue as soon as the authentication process is completed.

```bash
$ sls deploy
```

For more advanced deployment scenarios, see our [deployment docs](https://github.com/serverless/serverless-azure-functions/blob/master/docs/DEPLOY.md)

### Get a Summary of Your Deployed Function App

To see a basic summary of your application (same format as the dry-run summary above), run:

```bash
$ sls info
```

To look at the ARM template for the last successful deployment, add the `--arm` (or `-a`) flag:

```bash
$ sls info --arm
```

You can also get information services with different stages, regions or resource groups by passing any of those flags. Example:

```bash
$ sls info --stage prod --region westus2
```

### Test Your Function App

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
$ sls invoke -f hello -d '{"name": "Azure"}'
```

If you have a JSON object in a file, you could run

```bash
$ sls invoke -f hello -p data.json
```

If you have your service running locally (in another terminal), you can run:

```bash
$ sls invoke local -f hello -p data.json
```

If you configured your function app to [run with APIM](./docs/examples/apim.md), you can run:

```bash
$ sls invoke apim -f hello -p data.json
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

For more details, check out our [rollback docs](https://github.com/serverless/serverless-azure-functions/blob/master/docs/ROLLBACK.md).

### Deleting Your Function App

If at any point you no longer need your service, you can run the following command to delete the resource group containing your Azure Function App and other depoloyed resources using:

```bash
$ sls remove
```

You will then be prompted to enter the full name of the resource group as an extra safety before deleting the entire resource group.

You can bypass this check by running:

```bash
$ sls remove --force
```

### Creating or removing Azure Functions

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

### Advanced Authentication

The getting started walkthrough illustrates the interactive login experience, which is recommended when getting started. However, for more robust use, a [service principal](https://docs.microsoft.com/en-us/azure/active-directory/develop/app-objects-and-service-principals) is recommended for authentication.

##### Creating a Service Principal

1. [Install the Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest)
2. Login via Azure CLI and set subscription
   ```bash
   # Login to Azure
   $ az login
   # Set Azure Subscription for which to create Service Principal
   $ az account set -s <subscription-id>
   ```
3. Generate Service Principal for Azure Subscription
   ```bash
   # Create SP with unique name
   $ az ad sp create-for-rbac --name <my-unique-name>
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
4. Set environment variables **with values from above service principal**

   **Bash**

   ```bash
   $ export AZURE_SUBSCRIPTION_ID='<subscriptionId (see above, step 2)>'
   $ export AZURE_TENANT_ID='<tenantId>'
   $ export AZURE_CLIENT_ID='<servicePrincipalId>'
   $ export AZURE_CLIENT_SECRET='<password>'
   ```

   **Powershell**

   ```powershell
   $env:AZURE_SUBSCRIPTION_ID='<subscriptionId (see above, step 2)>'
   $env:AZURE_TENANT_ID='<tenantId>'
   $env:AZURE_CLIENT_ID='<servicePrincipalId>'
   $env:AZURE_CLIENT_SECRET='<password>'
   ```

### Example Usage

- **[Visit our sample repos](https://github.com/serverless/serverless-azure-functions/blob/master/docs/examples/samples.md) for full projects with different use cases**
- Check out our [integration test configurations](https://github.com/serverless/serverless-azure-functions/tree/master/integrationTests/configurations). We use these to validate that we can package, deploy, invoke and remove function apps of all the major runtime configurations that we support, so these are a pretty good example of things that should work
- [Configuring API Management](https://github.com/serverless/serverless-azure-functions/blob/master/docs/examples/apim.md) that sits in front of function app

### Logging Verbosity

You can set the logging verbosity with the `--verbose` flag. If the `--verbose` flag is set with no value, logging will be as verbose as possible (debug mode). You can also provide a value with the flag to set the verbosity to a specific level:

- `--verbose error` - Only error messages printed
- `--verbose warn` - Only error and warning messages printed
- `--verbose info` - Only error, warning and info messages printed
- `--verbose debug` - All messages printed
