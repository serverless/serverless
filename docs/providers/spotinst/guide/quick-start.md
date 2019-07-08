<!--
title: Serverless Framework - Spotinst Guide - Quick Start
menuText: Quick Start
menuOrder: 2
description: Getting started with the Serverless Framework on AWS Lambda
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://serverless.com/framework/docs/providers/spotinst/guide/quick-start/)

<!-- DOCS-SITE-LINK:END -->

# Spotinst - Quick Start

Here is a quick guide on how to create a new serverless project using the Spotinst NodeJS template. For more detailed instruction please check out the other reference material provided.

## Install Serverless Framework

First you will need to have the serverless framework installed. To do this you will have to run the command:

```bash
npm install -g serverless

```

## Set Up Credentials

To set up your Spotinst Credentials you will have to have the Spotinst Serverless Plugin installed inside a new Serverless project. The first thing you will need to do is create a new template project and enter the new project directory by entering into the terminal:

```bash
serverless create --template spotinst-nodejs --path new-service
cd new-service
```

Once you are in the project directory you will have to install the plugin but entering:

```bash
npm install
```

After the installation is completed you can then configure your credentials. Before you do this you will want to have your Spotinst account ID number and Spotinst API token ready to go. Those both can be found in the Spotinst Console under settings. Once you have those you will enter:

```bash
serverless config credentials --provider spotinst --token {Your Spotinst API Token} --account {Your Spotinst Account ID}
```

To check to see that your credentials have been set up properly you can check the credentials files by entering:

```bash
cat ~/.spotinst/credentials
```

Here you should see the account ID and Token that are linked to your account.

**Note:** Once you have set up your Spotinst Credentials you will not need to do this again for each project

For more help please refer to the [Credentials](./credentials.md) link provided

## Create a New Project From a Template

_You can skip this step if you have already done this step in configuring your credentials_

Create a new service using the Node.js template, specifying a unique name and an optional path for your service.

```bash
serverless create --template spotinst-nodejs --path new-service
cd new-service
```

## Install Spotinst Serverless Functions Plugin

_You can skip this step if you have already done this step in configuring your credentials_

You will first need to install the Spotinst Functions plugin before you are able to deploy your function. Once this has been done you do not need to do it again for this project.

```bash
npm install
```

## Deploying and Updating the Function

Deploying a project is how you launch the project into production. Once it has been deployed, you will be able to see and edit it in the Spotinst Console.

Before you deploy you will need to add in the environment ID into the `serverless.yml` file. The environment ID can be found on the Spotinst console under Functions. In this menu you will be able to add applications, environments and functions. An application is able to hold many environments and environments can hold many functions. They are mostly used for organization purposes and are at your descretion to manipulate as you like. To deploy your function you will need to select an application and environment and copy/paste the environment ID into the `serverless.yml` file under the environment tag.

1. **Deploying the Service**

Use this when you have made changes to your Functions, Events or Resources in `serverless.yml` or you simply want to deploy all changes within your Service at the same time.

```bash
serverless deploy
```

2. **Deploy the Function**

Use this to quickly upload and overwrite your function code, allowing you to develop faster.

```bash
serverless deploy function -f hello
```

3. **Updating the Function**

Use this to update your function after you have made updates that you want to push to production.

```bash
serverless deploy
```

## Invoke the Function

Invoking a function simply means to run it. There are many event triggers that will invoke a function depending on your needs. All functions are assigned a unique URL that is initially set to private in the `serverless.yml` file but if set to public can trigger an invocation from a web browser. Also you are able to set up a cron function in the `serverless.yml` file to run at regular intervals and invoke the function on a timer. If you simply want to test the function you can invoke from the console. Under the function name there is a Test tab you can select and run a test. Otherwise you are able to test from the terminal as shown below.

Invokes a Function

```bash
serverless invoke -f hello
```

## Cleanup

If at any point, you no longer need your service, you can run the following command to remove the Functions, Events and Resources that were created, and ensure that you don't incur any unexpected charges.

```bash
serverless remove
```
