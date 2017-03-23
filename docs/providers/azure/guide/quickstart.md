<!--
title: Serverless Framework - Azure Functions Guide - Quickstart
menuText: Quickstart
menuOrder: 2
description: Get started with Azure Functions in 5 minutes or less
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/azure/guide/intro)
<!-- DOCS-SITE-LINK:END -->

# Quickstart

This guide is designed to help you get started as quick as possible.

## 1. Set up boilerplate

To setup the boilerplate, follow these instructions:

1. Install the boilerplate

    ```bash
    serverless create -t azure-nodejs --path <my-app>
    ```

2. Install the dependencies

    ```bash
    cd <my-app>
    npm install
    ```

## 2. Set up credentials

We'll set up an Azure Subscription and our service principal. You can learn more in the [credentials doc](./credentials.md).

1. Set up an Azure Subscription

    Sign up for a free account @ [https://azure.com](https://azure.microsoft.com/en-us/services/functions/).

    Azure comes with a [free trial](https://azure.microsoft.com/en-us/free/) that includes $200 of free credit.


2. . Get the Azure CLI

    ```
    npm i -g azure-cli
    ```

3. Login to Azure

    ```
    azure login
    ```

    This will give you a code and prompt you to visit [aka.ms/devicelogin](https://aka.ms/devicelogin). Provide the code and then login with your Azure identity (this may happen automatically if you're already logged in). You'll then be able to access your account via the CLI.

4. Get your subcription and tenant id

    ```
    azure account show
    ```

    Save the subcription and tenant id for later

5. Create a service principal for a given `<name>` and `<password>`

    ```
    azure ad sp create -n <name> -p <password>
    ```

    This should return an object which has the `servicePrincipalNames` property on it. Save one of the names in the array and the password you provided for later. If you need to look up your service principal later, you can use `azure ad sp -c <name>` where `<name>` is the name provided originally. Note that the `<name>` you provided is not the name you'll provide later, it is a name in the `servicePrincipalNames` array.

6. Set up environment variables

     You need to set up environment variables for your subscription id, tenant id, service principal name, and password.

    ```bash
    # bash
    export azureSubId='<subscriptionId>'
    export azureServicePrincipalTenantId='<tenantId>'
    export azureServicePrincipalClientId='<servicePrincipalName>'
    export azureServicePrincipalPassword='<password>'
    ```

    ```powershell
    # PowerShell
    $env:azureSubId='<subscriptionId>'
    $env:azureServicePrincipalTenantId='<tenantId>'
    $env:azureServicePrincipalClientId='<servicePrincipalName>'
    $env:azureServicePrincipalPassword='<password>'
    ```

# 3. Deploy to Azure

Run the [deploy command](../cli-reference/deploy.md)

```bash
serverless deploy
```

# 4. Test

Run the [invoke command](../cli-reference/invoke.md)

```bash
serverless invoke -f hello
```
