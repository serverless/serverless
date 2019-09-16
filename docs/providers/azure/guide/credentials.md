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

The Serverless Framework needs access to account credentials for your Azure
account so that it can create and manage resources on your behalf.

Here we'll provide setup instructions for both options, just pick the one that
you're using.

---

## Pre-requisite

You'll need an Azure account to continue. Azure provides a hosted serverless computing solution based upon Azure Functions.

### Register with Azure

Here's how to get started…

- Sign up for a free account @ [azure.com](https://azure.microsoft.com/en-us/services/functions/)

Azure comes with a [free trial](https://azure.microsoft.com/en-us/free/) that
includes \$200 of free credit.

---

## Interactive Login

> Note: Interactive login is **CURRENTLY NOT SUPPORTED** for free/trial Azure subscription, thus we recommend you stick with using the [Service Principal](#Using-Service-Principal) method

Upon running `sls deploy`, if you don't already have service principal set in your
environment, you will automatically be prompted to login via your browser.
Simply follow the instructions.

> Note: Once you've authenticated, the credentials will be
> created and cached, allow them to be used for subsequent deployments.
> This prevents you from needing to manually login again.

---

## Using Service Principal

Setting up service principal in your environment is an alternative to using interactive login.

You can do this very simply through the [Azure Portal](https://docs.microsoft.com/en-us/azure/azure-resource-manager/resource-group-create-service-principal-portal),
[PowerShell commandlets](https://docs.microsoft.com/en-us/azure/azure-resource-manager/resource-group-authenticate-service-principal),
or through the Azure CLI, as the instructions below illustrate.

> Note: If you're using non-public Azure, such as national clouds or Azure Stack, be sure
> you set your Azure endpoint before logging in.

### Pre-requisite: Azure-CLI

1. Get the Azure CLI

   Follow the guide on [docs.microsoft.com](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli)
   or use the [Azure Cloud Shell](https://docs.microsoft.com/en-us/azure/cloud-shell/overview).

1. Login to Azure

   ```sh
   az login
   ```

   This will give you a code and prompt you to visit
   [aka.ms/devicelogin](https://aka.ms/devicelogin). Provide the code and then
   login with your Azure identity (this may happen automatically if you're
   already logged in). You'll then be able to access your account via the CLI.

### Generate Service Principal

The rest of the process can be done 2 ways.

#### Easy way

Download this [script](https://github.com/serverless/serverless-azure-functions/blob/master/scripts/generate-service-principal.sh) and run it.

#### Hard way

1. Get your subscription and tenant id

   ```sh
   $ az account list
   {
     "cloudName": "AzureCloud",
     "id": "c6e5c9a2-a4dd-4c05-81b4-6bed04f913ea",
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

   Save the ID of the subscription for a later step.

1. Create a service principal

   ```sh
   $ az ad sp create-for-rbac
   {
     "appId": "19f7b7c1-fc4e-4c92-8aaf-21fffc93b4c9",
     "displayName": "azure-cli-1970-01-01-00-00-00",
     "name": "http://azure-cli-1970-01-01-00-00-00",
     "password": "48d82644-00f2-4e64-80c5-65192f9bb2d0",
     "tenant": "16f63fe8-17db-476f-b2b3-ba3752a03a33"
   }
   ```

   This will return an JSON object containing the other pieces that you need to
   authenticate with Azure.

1. Set up environment variables

   Finally, create environment variables for subscription ID,
   tenant, name, and password.

   ```sh
   # bash
   export AZURE_SUBSCRIPTION_ID='<subscriptionId>'
   export AZURE_TENANT_ID='<tenant>'
   export AZURE_CLIENT_ID='<name>'
   export AZURE_CLIENT_SECRET='<password>'
   ```

   ```powershell
   # PowerShell
   $env:AZURE_SUBSCRIPTION_ID='<subscriptionId>'
   $env:AZURE_TENANT_ID='<tenant>'
   $env:AZURE_CLIENT_ID='<name>'
   $env:AZURE_CLIENT_SECRET='<password>'
   ```
