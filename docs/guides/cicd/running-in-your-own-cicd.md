<!--
title: Serverless Dashboard - Running in your own CI/CD
menuText: Deploy in your own CI/CD
menuOrder: 8
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://serverless.com/framework/docs/guides/cicd/running-in-your-own-cicd/)

<!-- DOCS-SITE-LINK:END -->

# Deploy in your own CI/CD

If you have an existing CI/CD service and you do not wish to use the CI/CD service provided by Serverless, you can still deploy from your existing CI/CD service while using the other features of the Serverless Framework Dashboard.

Configuring your CI/CD pipeline is split between configuring the environment and the build step. Configuring the environment only needs to be performed once across all service deployments while the build step must be configured to run on each deploy.

## Configure the environment

Complete the steps in this guide to install the Serverless Framework open-source CLI and configure authentication.

### Install Node.js and NPM

Your CI/CD environment must have Node.js and NPM installed as they are prerequisites for the Serverless Framework CLI. Follow the instructions below to install Node.js and NPM. You must install **version 6.x or later** of Node.js.

[https://nodejs.org/en/download/package-manager/](https://nodejs.org/en/download/package-manager/)

### Install the Serverless Framework open-source CLI

In your CI/CD environment install Serverless Framework open-source CLI as it is later used to perform the deploy.

```sh
npm install -g serverless
```

### Create an Access Key in the Serverless Framework Dashboard

When using the the Serverless Framework open-source CLI with Serverless Framework Dashboard locally you must first authenticate with the `serverless login` command. The `serverless login` command will open up a browser where you are prompted for your Serverless Framework Dashboard username and password. Since your CI/CD environment is non-interactive, you will need to authenticate the CLI using an access token instead.

Follow these steps to create an access token:

1. Login to the dashboard at https://app.serverless.com/
2. Open the username dropdown in the upper-right corner.
3. Select "personal access keys" from the dropdown.
4. Click “+ add” button.
5. Provide a name and press “Create”
6. You will be presented with the access key on the new page.

**Note**: The access token has permission to the tenant; however, it is associated with your account. If your account is deleted, then the access token will be revoked too.

### Configure environment variables

In the previous step you obtained an access token from the Serverless Framework Dashboard which you will now set in your CI/CD environment so that the Serverless Framework open-source CLI can authenticate with the Serverless Framework Dashboard.

Set the following environment variable in your CI/CD environment:

- `SERVERLESS_ACCESS_KEY`: Your Serverless Framework Dashboard access token from previous step.

## Configure the build step

Your CI/CD pipeline is now ready to deploy the service. This step should be configured to run on every deploy.

```sh
npm install # installs all plugins and packages
serverless deploy # deploys your service
```
