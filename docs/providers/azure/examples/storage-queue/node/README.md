# Azure Functions

## Pre-requisites

1. Node.js v6.5.0+ _(this is the runtime version supported by Azure Functions)_
2. Serverless CLI `v1.9.0+`. You can run `npm i -g serverless` if you don't already have it.
3. An Azure account. If you don't already have one, you can sign up for a [free trial](https://azure.microsoft.com/en-us/free/) that includes \$200 of free credit.

## Create a new Azure Function App

```bash
# Create Azure Function App from template
sls create -t azure-nodejs -p <appName>
# Move into project directory
cd <appName>
# Install dependencies (including this plugin)
npm install
```

### Note

1. If `--name/-n` is not specified, the path name will be use as the service name.
1. If `--path/-p` is not specified, a folder will not be created and all files will be generated into the current working directory.
1. If `--path/-p` and `--name/-n` are not specified, the current folder name will be use as the service name.

## Running Function App Locally (`offline` plugin)

Offline support is built into the plugin. All you have to do
is run the following command in the root directory.

```bash
# Builds necessary function bindings files and starts the function app
$ sls offline
```

The `offline` process will

- generate a directory for each of your functions, which will contain a file titled `function.json`. This will contain a relative reference to your handler file & exported function from that file as long as they are referenced correctly in `serverless.yml`.

- After the necessary files are generated, it will start the function app from within the same shell. For HTTP functions, the local URLs will be displayed in the console when the function app is initialized.
- generate a `local.settings.json` file if it does not exist
- clean up all the generated `function.json` files when you exit

### Additonal commands

To simply start the function app _without_ building the files, run:

```bash
sls offline start
```

To build the files _without_ spawning the process to start the function app, run:

```bash
sls offline build
```

To clean up files generated from the build, run:

```bash
sls offline cleanup
```

## Deploy Your Function App

Deploy your new service to Azure! The first time you do this, you will be asked to authenticate with your Azure account, so the `serverless` CLI can manage Functions on your behalf. Simply follow the provided instructions, and the deployment will continue as soon as the authentication process is completed.

```bash
sls deploy
```

For more advanced deployment scenarios, see [deployment docs](https://github.com/serverless/serverless-azure-functions)

## Test Your Function App

Invoke your HTTP functions without ever leaving the CLI using:

```bash
sls invoke -f <functionName>
```

### Invoke Options

- `-f` or `--function` - Function to Invoke
- `-d` or `--data` - Stringified JSON data to use as either query params or request body
- `-p` or `--path` - Path to JSON file to use as either query params or request body
- `-m` or `--method` - HTTP method for request

#### Example

After deploying template function app, run

```bash
sls invoke -f hello '{"name": "Azure"}'
```

## Roll Back Your Function App

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

For more details, check out our [rollback docs](docs/ROLLBACK.md).

## Deleting Your Function App

**DANGEROUS:** If at any point you no longer need your service, you can run the following command to delete the resource group containing your Azure Function App and other depoloyed resources using:

```bash
sls remove
```

## Creating or removing Azure Functions

To create a new Azure Function within your function app, run the following command from within your app's directory:

```bash
# -n or --name for name of new function
sls func add -n {functionName}
```

This will create a new handler file at the root of your project with the title `{functionName}.js`. It will also update `serverless.yml` to contain the new function.

To remove an existing Azure Function from your function app, run the following command from within your app's directory:

```bash
# -n or --name for name of function to remove
sls func remove -n {functionName}
```

This will remove the `{functionName}.js` handler and remove the function from `serverless.yml`

> Note:
> Add & remove currently only support HTTP triggered functions. For other triggers, you will need to update `serverless.yml` manually

## Advanced Authentication

The getting started walkthrough illustrates the interactive login experience, which is recommended when getting started. However, for more robust use, a [service principal](https://docs.microsoft.com/en-us/azure/active-directory/develop/app-objects-and-service-principals) is recommended for authentication.

### Creating a Service Principal

1. [Install the Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest)
1. Login via Azure CLI and set subscription

   ```bash
   # Login to Azure
   $ az login
   # Set Azure Subscription for which to create Service Principal
   $ az account set -s <subscription-id>
   ```

1. Generate Service Principal for Azure Subscription

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

1. Set environment variables

   **Bash**

   ```bash
   export azureSubId='<subscriptionId>'
   export azureServicePrincipalTenantId='<tenantId>'
   export azureServicePrincipalClientId='<servicePrincipalId>'
   export azureServicePrincipalPassword='<password>'
   ```

   **Powershell**

   ```powershell
   $env:azureSubId='<subscriptionId>'
   $env:azureServicePrincipalTenantId='<tenantId>'
   $env:azureServicePrincipalClientId='<servicePrincipalName>'
   $env:azureServicePrincipalPassword='<password>'
   ```
