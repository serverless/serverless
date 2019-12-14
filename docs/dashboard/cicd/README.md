<!--
title: Serverless Dashboard - CI/CD
menuText: CI/CD
menuOrder: 7
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/dashboard/cicd/)

<!-- DOCS-SITE-LINK:END -->

# CI/CD

Serverless CI/CD enables you to automatically test and deploy services from Github.

## Requirements

Before you setup your CI/CD workflow, make sure you meet the following requirements:

1. **Deployment Profile must include an AWS Access Role**. When Serverless automatically deploys your service, it must be granted permission to your AWS account. This permission is granted by deploying to a stage which has an AWS Access Role configured in it’s deployment profile. This enables Serverless to automatically generate short-lived AWS Access Keys used to authenticate during the deployment. [Learn how to setup the AWS Access Role](/framework/docs/dashboard/access-roles/).
2. **Must have your Serverless Framework project checked into Github**. Currently only Github is supported as a VCS provider. Your project, including the serverless.yml file, must be checked into the repo.
3. **Must be deployed on AWS**. The dashboard currently only supports AWS as a cloud service provider. Other cloud service providers are a work in progress.
4. **Must use the Node or Python runtime**. Currently only Serverless Framework projects using the Node or Python runtimes are supported. Other runtimes are coming soon.

## Connect to Github

1. Select your application from the main dashboard.
2. Select the service you want to deploy or create a new one.
3. Select the “ci/cd settings” tab from the application page.
4. Select the service from the left-hand menu.
5. Click the "connect github repository" button to grant the Serverless Dashboard access to the repository.
6. After authenticate with Github you'll be asked to install the Serverless application in your Github organizations. In the "Repository access" section, ensure you select "All repositories", or that the intended repository is included if you select "Only select repositories".

## Configure the build settings

1. Select the Github repository from the "repository" dropdown. This must be a repository that contains one or more `serverless.yml` files.
2. Select the "base directory" containing the `serverless.yml` file. The repository must contain at least one `serverless.yml` and `service` value must match the current service in the dashboard.
3. Select the “region” for the deployments. Only regions supported by the Serverless Dashboard are currently listed. If you plan to deploy to another region, please reach out sales or support to request support for a new region.

## Branch Deployments

Branch deployments enable you to automatically deploy a service to a stage from a branch in your Github repository. Every commit to this branch is automatically deployed.

### Adding a branch deployment

To add a new branch deployment, select the Github branch containing the `serverless.yml` and the target stage and click "Add". You must click "save settings" at the bottom of the form before the branch deployment is enabled.

### Add a stage to a branch deployment

If you are a first time user, the stage list may be empty. You must first [create a new deployment profile](/framework/docs/dashboard/profiles#creating-a-new-deployment-profile), and [add the deployment profile to a stage in your application](/framework/docs/dashboard/profiles#add-a-deployment-profile-to-your-application-and-stage). As mentioned in the requirements section, the deployment profile must also have an [AWS Access Role](/framework/docs/dashboard/access-roles/).


Your service will now deploy from the master branch and you’ll see all the test results, logs, safeguard pass/fail
status, and deployment details.


## Deployment settings

If your services depends on settings which are different for each stage, we recommend using [deployment profiles](/framework/docs/dashboard/profiles/) to set different [parameters](https://serverless.com/framework/docs/dashboard/secrets/) for each stage.
