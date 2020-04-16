<!--
title: Serverless Framework - Azure Functions Guide - Credentials
menuText: Credentials
menuOrder: 3
description: How to set up the Serverless Framework with your Azure Functions credentials
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/azure/guide/credentials)

<!-- DOCS-SITE-LINK:END -->

# Azure - Credentials

The Serverless Framework needs access to Azure account credentials so that it can create and manage resources on your behalf.

## Create an Azure Account

Azure provides a hosted serverless computing solution based upon [Azure Functions](https://azure.microsoft.com/en-us/services/functions/).

If you don't have an Azure account, get started by [signing up for a free account](https://azure.microsoft.com/en-us/free/), which includes \$200 of free credit

### Interactive Login

Upon running `$ serverless deploy`, you will automatically be prompted to login via your browser. Simply follow the instructions.

### Authenticating with a Service Principal

For anything more than just experimenting with the plugin, it is recommended to use a [service principal](https://docs.microsoft.com/en-us/azure/active-directory/develop/app-objects-and-service-principals). Below are steps on creating one:

> Note: If you're using non-public Azure, such as national clouds or Azure Stack, be sure you set your Azure endpoint before logging in.

##### 1. Download the [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli) or use the [Azure Cloud Shell](https://docs.microsoft.com/en-us/azure/cloud-shell/overview)

##### 2. Login to Azure

```sh
$ az login
```

This will give you a code and prompt you to visit [aka.ms/devicelogin](https://aka.ms/devicelogin).

##### 3. Get your subscription and tenant id

```sh
$ az account list
{
  "cloudName": "AzureCloud",
  "id": "<subscriptionId>",
  "isDefault": true,
  "name": "My Azure Subscription",
  "registeredProviders": [],
  "state": "Enabled",
  "tenantId": "5bc10873-159c-4cbe-a7c9-bce05cb065c1",
  "user": {
    "name": "hello@example.com",
    "type": "user"
  }
}
```

If you have multiple accounts, you can specify the "current" subscription for the session by running

```sh
$ az account set -s <subscriptionId>
```

##### 4. Create a service principal

```sh
$ az ad sp create-for-rbac
```

This will yield something like:

```json
{
  "appId": "19f7b7c1-fc4e-4c92-8aaf-21fffc93b4c9",
  "displayName": "azure-cli-1970-01-01-00-00-00",
  "name": "http://azure-cli-1970-01-01-00-00-00",
  "password": "48d82644-00f2-4e64-80c5-65192f9bb2d0",
  "tenant": "16f63fe8-17db-476f-b2b3-ba3752a03a33"
}
```

Save this somewhere secure.

##### 5. Set up environment variables

Add the following environment variables to the shell session or CI/CD tool that will be used for deployment of your Azure Function App:

```sh
# bash
export AZURE_SUBSCRIPTION_ID='<subscriptionId>' # From step 3
export AZURE_TENANT_ID='<tenant>'
export AZURE_CLIENT_ID='<name>'
export AZURE_CLIENT_SECRET='<password>'
```

```powershell
# PowerShell
$env:AZURE_SUBSCRIPTION_ID='<subscriptionId>' # From step 3
$env:AZURE_TENANT_ID='<tenant>'
$env:AZURE_CLIENT_ID='<name>'
$env:AZURE_CLIENT_SECRET='<password>'
```
