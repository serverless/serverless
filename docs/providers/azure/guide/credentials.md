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

# Credentials

The Serverless Framework needs access to account credentials for your Azure account so that it can create and manage resources on your behalf. 

Here we'll provide setup instructions for both options, just pick the one that you're using. 

## Register with Azure

Azure provides a hosted serverless computing solution based upon Azure Functions.

Here's how to get started… 

- Sign up for a free account @ [https://azure.com](https://azure.microsoft.com/en-us/services/functions/)

Azure comes with a [free trial](https://azure.microsoft.com/en-us/free/) that includes $200 of free credit. 

### Azure Account Credentials

Every Azure subscription comes with a free default directory. To use the `serverless-azure-functions` plugin, you'll need to set up a service principal. You can do this very simply through the [Azure Portal](https://docs.microsoft.com/en-us/azure/azure-resource-manager/resource-group-create-service-principal-portal), [PowerShell commandlets](https://docs.microsoft.com/en-us/azure/azure-resource-manager/resource-group-authenticate-service-principal), or through the Azure CLI, as the instructions below illustrate.

If you're using non-public Azure, such as national clouds or Azure Stack, be sure you set your Azure endpoint before logging in.

1. Get the Azure CLI

    ```
    npm i -g azure-cli
    ```

2. Login to Azure

    ```
    azure login
    ```

    This will give you a code and prompt you to visit [aka.ms/devicelogin](https://aka.ms/devicelogin). Provide the code and then login with your Azure identity (this may happen automatically if you're already logged in). You'll then be able to access your account via the CLI.

3. Get your subcription and tenant id

    ```
    azure account show
    ```

    Save the subcription and tenant id for later

4. Create a service principal for a given `<name>` and `<password>` and add contributor role.

    ```
    azure ad sp create -n <name> -p <password>
    ```

    This should return an object which has the `servicePrincipalNames` property on it and an ObjectId. Save the Object Id and one of the names in the array and the password you provided for later. If you need to look up your service principal later, you can use `azure ad sp -c <name>` where `<name>` is the name provided originally. Note that the `<name>` you provided is not the name you'll provide later, it is a name in the `servicePrincipalNames` array.

    Then grant the SP contributor access with the ObjectId

    ```bash
    azure role assignment create --objectId <objectIDFromCreateStep> -o Contributor
    ```

5. Set up environment variables

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
