<!--
title: Serverless Framework - AWS Lambda Guide - Deploying
menuText: Deploying
menuOrder: 8
description: How to deploy your AWS Lambda functions and their required infrastructure
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/deploying)
<!-- DOCS-SITE-LINK:END -->

# Deploying

The Serverless Framework was designed to provision your AWS Lambda Functions, Events and infrastructure Resources safely and quickly.  It does this via a couple of methods designed for different types of deployments.

## Deploy All

This is the main method for doing deployments with the Serverless Framework:

```bash
serverless deploy
```

Use this method when you have updated your Function, Event or Resource configuration in `serverless.yml` and you want to deploy that change (or multiple changes at the same time) to Amazon Web Services.

### How It Works

The Serverless Framework translates all syntax in `serverless.yml` to a single AWS CloudFormation template.  By depending on CloudFormation for deployments, users of the Serverless Framework get the safety and reliability of CloudFormation.

* An AWS CloudFormation template is created from your `serverless.yml`.
* If a Stack has not yet been created, then it is created with no resources except for an S3 Bucket, which will store zip files of your Function code.
* The code of your Functions is then packaged into zip files.
* Zip files of your Functions' code are uploaded to your Code S3 Bucket.
* Any IAM Roles, Functions, Events and Resources are added to the AWS CloudFormation template.
* The CloudFormation Stack is updated with the new CloudFormation template.

### Tips

* Use this in your CI/CD systems, as it is the safest method of deployment.
* You can print the progress during the deployment if you use `verbose` mode, like this:
  ```
  serverless deploy --verbose
  ```
* This method uses the AWS CloudFormation Stack Update method.  CloudFormation is slow, so this method is slower.  If you want to develop more quickly, use the `serverless deploy function` command (described below)

* This method defaults to `dev` stage and `us-east-1` region.  You can change the default stage and region in your `serverless.yml` file by setting the `stage` and `region` properties inside a `provider` object as the following example shows:
  ```yml
  # serverless.yml

  service: service-name
  provider:
    name: aws
    stage: beta
    region: us-west-2
  ```

* You can also deploy to different stages and regions by passing in flags to the command:
  ```
  serverless deploy --stage production --region eu-central-1
  ```

Check out the [deploy command docs](../cli-reference/deploy) for all details and options.

## Deploy Function

This deployment method does not touch your AWS CloudFormation Stack.  Instead, it simply overwrites the zip file of the current function on AWS.  This method is much faster, since it does not rely on CloudFormation.

```bash
serverless deploy function --function myFunction
```

### How It Works

* The Framework packages up the targeted AWS Lambda Function into a zip file.
* That zip file is uplaoded to your S3 bucket using the same name as the previous function, which the CloudFormation stack is pointing to.

### Tips

* Use this when you are developing and want to test on AWS because it's much faster.
* During development, people will often run this command several times, as opposed to `serverless deploy` which is only run when larger infrastructure provisioning is required.

Check out the [deploy command docs](../cli-reference/deploy.md) for all details and options.
