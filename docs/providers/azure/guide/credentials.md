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

## Register with Azure

Azure provides a hosted serverless computing solution based upon Azure Functions.

Here's how to get started…

- Sign up for a free account @ [azure.com](https://azure.microsoft.com/en-us/services/functions/)

Azure comes with a [free trial](https://azure.microsoft.com/en-us/free/) that
includes $200 of free credit.

### Interactive Login

Upon running `$ serverless deploy`, you will automatically be prompted to login
via your browser. Simply follow the instructions.

> Note: Once you've authenticated, a new Azure "service principal" will be
created, and used for subsequent deployments. This prevents you from needing to
manually login again.

### Azure Account Credentials

Every Azure subscription comes with a free default directory. To use the
`serverless-azure-functions` plugin, you'll need to set up a service principal.
You can do this very simply through the [Azure Portal](https://docs.microsoft.com/en-us/azure/azure-resource-manager/resource-group-create-service-principal-portal),
[PowerShell commandlets](https://docs.microsoft.com/en-us/azure/azure-resource-manager/resource-group-authenticate-service-principal),
or through the Azure CLI, as the instructions below illustrate.

If you're using non-public Azure, such as national clouds or Azure Stack, be sure
you set your Azure endpoint before logging in.

1. Get the Azure CLI

    Follow the guide on [docs.microsoft.com](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli)
    or use the [Azure Cloud Shell](https://docs.microsoft.com/en-us/azure/cloud-shell/overview).

2. Login to Azure

    ```sh
    $ az login
    ```

    This will give you a code and prompt you to visit
    [aka.ms/devicelogin](https://aka.ms/devicelogin). Provide the code and then
    login with your Azure identity (this may happen automatically if you're
    already logged in). You'll then be able to access your account via the CLI.

3. Get your subscription and tenant id

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

    Save the ID of the subscription for step 5.

4. Create a service principal

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

5. Set up environment variables

    Finally, create environment variables for subscription ID (from step 3),
    tenant, name, and password.

    ```sh
    # bash
    export azureSubId='<subscriptionId>' # From step 3
    export azureServicePrincipalTenantId='<tenant>'
    export azureServicePrincipalClientId='<name>'
    export azureServicePrincipalPassword='<password>'
    ```

    ```powershell
    # PowerShell
    $env:azureSubId='<subscriptionId>' # From step 3
    $env:azureServicePrincipalTenantId='<tenant>'
    $env:azureServicePrincipalClientId='<name>'
    $env:azureServicePrincipalPassword='<password>'
    ```
