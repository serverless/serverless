<!--
title: Serverless Framework Guide - AWS Lambda - Workflow
menuText: Workflow
menuOrder: 13
description: A guide and cheatsheet containing CLI commands and workflow recommendations.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/workflow)
<!-- DOCS-SITE-LINK:END -->

# Workflow

## Process
Quick recommendations and tips for various processes.
### Development
* Write your functions
* Use `serverless deploy` only when you've made changes to `serverless.yml` and in CI/CD systems.
* Use `serverless deploy function -f myFunction -l` to rapidly deploy changes when you are working on a specific AWS Lambda Function.
* Use `serverless invoke -f myFunction -l` to test your AWS Lambda Functions on AWS.
* Open up a separate tab in your console and stream logs in there via `serverless logs -f myFunction -t`.
* Write tests to run locally.
### Stages
* At the very least, use a `dev` and `production` stage.
* Use different AWS accounts for stages.
* In larger teams, each member should use a separate AWS account and their own stage for development.
### Larger Projects
* Break your application/project into multiple Serverless Services.
* Model your Serverless Services around Data Models or Workflows.
* Keep the Functions and Resources in your Serverless Services to a minimum.

## Cheat Sheet
A handy list of commands to use when developing with the Serverless Framework.

##### Create A Service:
Creates a new Service
```
serverless create -p [SERVICE NAME] -t aws-nodejs
```

##### Install A Service
This is a convenience method to install a pre-made Serverless Service locally by downloading the Github repo and unzipping it.
```
serverless install -u [GITHUB URL OF SERVICE]
```

##### Deploy All
Use this when you have made changes to your Functions, Events or Resources in `serverless.yml` or you simply want to deploy all changes within your Service at the same time.
```
serverless deploy -s [STAGE NAME] -r [REGION NAME] -v
```

##### Deploy Function
Use this to quickly overwrite your AWS Lambda code on AWS, allowing you to develop faster.
```
serverless deploy function -f [FUNCTION NAME] -s [STAGE NAME] -r [REGION NAME]
```

##### Invoke Function
Invokes an AWS Lambda Function on AWS and returns logs.
```
serverless deploy function -f [FUNCTION NAME] -s [STAGE NAME] -r [REGION NAME] -l
```

##### Streaming Logs
Open up a separate tab in your console and stream all logs for a specific Function using this command.
```
serverless logs -f [FUNCTION NAME] -s [STAGE NAME] -r [REGION NAME]
```