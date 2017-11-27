<!--
title: Serverless Framework - Spotinst Guide - Quick Start
menuText: Quick Start
menuOrder: 2
description: Getting started with the Serverless Framework on AWS Lambda
layout: Doc
-->

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

  For more help please refer to the [Credentials](../credentials.md) link provided 

## Create a New Service
  *You can skip this step if you have already done this step in configuring your credentials*	
  
  Create a new service using the Node.js template, specifying a unique name and an optional path for your service.

```bash
serverless create --template spotinst-nodejs --path new-service
cd new-service
```

## Install Spotinst Serverless Functions Plugin
  *You can skip this step if you have already done this step in configuring your credentials*	

  You will first need to install the Spotinst Functions plugin before you are able to deploy your function. Once this has been done you do not need to do it again for this project. 

```bash
npm install
```

## Deploying and Updating the Function
  
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

  Invokes a Function

```bash
serverless invoke -f hello
```

## Cleanup

If at any point, you no longer need your service, you can run the following command to remove the Functions, Events and Resources that were created, and ensure that you don't incur any unexpected charges.

```bash
serverless remove
```
