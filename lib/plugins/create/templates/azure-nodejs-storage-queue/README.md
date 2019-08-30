# Azure Functions - Quick Start

## Pre-requisites

1. Node.js `v6.5.0` or later. _(v6.5.0 is the minimum runtime version supported by Azure Functions)_
2. Serverless CLI `v1.9.0` or later. You can run
   `npm install -g serverless` to install it.
3. Azure plugin that allows you to work with Azure Functions `npm install -g serverless-azure-functions`
4. An Azure account. If you don't already have one, you can sign up for a [free trial](https://azure.microsoft.com/en-us/free/) that includes \$200 of free credit.
5. **Set-up your [Provider Credentials](./credentials.md)**.

## Create a new service

Create a new service using the Node.js template, specifying a unique name and an
optional path for your service. Make sure you enter a globally unique name for the `--name` argument.

```bash
$ serverless create --template azure-nodejs --path my-service --name my-unique-name
$ cd my-service
$ npm install
```

Note: This template contains **two** Azure functions to demonstrate how that would be configured within `serverless.yml`.

Note: The `serverless.yml` file supports **inbound** and **outbound** function bindings by specifying the `direction` property.

## Running Locally

In order to run & test your Azure Function(s) locally, run a one-time install of the Azure Functions Core Tools:

```bash
npm install azure-functions-core-tools -g
```

From there, run the start script:

```bash
# Start Function app
npm start
```

You will be provided with local URLs for each function for testing.

Note: The file `{function name}/function.json` is included in the template for the quickstart, but this will be replaced by a generated file from the `serverless-azure-functions` plugin at deployment. There will soon be an option in the plugin for generating this file before deployment for local testing, but that scenario is not currently supported. If you want to test different function bindings locally before deploying, make the changes manually in `function.json` and update the `serverless.yml` to reflect the same.

## Deploy and test

1. **Deploy the Service:**

Deploy your new service to Azure! The first time you do this, you will be asked
to authenticate with your Azure account, so the `serverless` CLI can manage
Functions on your behalf. Simply follow the provided instructions, and the
deployment will continue as soon as the authentication process is completed.

```bash
serverless deploy
```

> Note: Once you've authenticated, a new Azure "service principal" will be
> created, and used for subsequent deployments. This prevents you from needing to
> manually login again. See [below](#advanced-authentication) if you'd prefer to
> use a custom service principal instead.

2. **Deploy the Function**

Use this to quickly upload and overwrite your function code,allowing you to
develop faster. If you're working on a single function, you can simply deploy
the specified function instead of the entire service.

```bash
serverless deploy function -f hello
```

3. **Invoke the Function**

Invoke a function, in order to test that it works:

```bash
serverless invoke -f hello
```

4. **Fetch the Function Logs**

Open up a separate tab in your console and stream all logs for a specific
Function using this command.

```bash
serverless logs -f hello -t
```

## Cleanup

If at any point, you no longer need your service, you can run the following
command to remove the Functions, Events and Resources that were created, and
ensure that you don't incur any unexpected charges.

```bash
serverless remove
```

Check out the [Serverless Framework Guide](./README.md) for more information.

## Advanced Authentication

The getting started walkthrough illustrates the interactive login experience,
which is recommended for most users. However, if you'd prefer to create an Azure
["service principal"](http://bit.ly/2wLVE7k)
yourself, you can indicate that this plugin should use its credentials instead,
by setting the following environment variables:

**Bash**

```bash
export azureSubId='<subscriptionId>'
export azureServicePrincipalTenantId='<tenantId>'
export azureServicePrincipalClientId='<servicePrincipalName>'
export azureServicePrincipalPassword='<password>'
```

**Powershell**

```powershell
$env:azureSubId='<subscriptionId>'
$env:azureServicePrincipalTenantId='<tenantId>'
$env:azureServicePrincipalClientId='<servicePrincipalName>'
$env:azureServicePrincipalPassword='<password>'
```

## Issues / Feedback / Feature Requests?

If you have any issues, comments or want to see new features, please file an issue in the project repository:

https://github.com/serverless/serverless-azure-functions
