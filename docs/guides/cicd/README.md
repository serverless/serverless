<!--
title: Serverless Dashboard - CI/CD
menuText: CI/CD
menuOrder: 5
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://serverless.com/framework/docs/guides/cicd/)

<!-- DOCS-SITE-LINK:END -->

# CI/CD

Serverless CI/CD enables you to automatically test and deploy services from Github.

## Requirements

Before you setup your CI/CD workflow, make sure you meet the following requirements:

1. **Must have your Serverless Framework project checked into Github**. Currently Github and BitBucket are supported as a VCS providers. Your project, including the serverless.yml file, must be checked into a repo.
2. **Must be deployed on AWS**. The dashboard currently only supports AWS as a cloud service provider. Other cloud service providers are a work in progress.
3. **Must use the Node or Python runtime**. Currently only Serverless Framework projects using the Node or Python runtimes are supported. Other runtimes may work but are not officially supported.

## Getting Started in 3 steps

### Step 1: Link your AWS Account

As is the case with deployments from the Serverless Framework CLI, Serverless CI/CD requires access to your AWS Account in order to deploy your services. To make this process as secure as possible, Serverless CI/CD will generate short-lived credentials to your AWS account on each deployment. This is done by creating an AWS Access Role in your AWS account and associating it with a Provider in the Serverless Framework Dashboard.

If you’ve already setup an AWS Access Role with a Provider you can skip this step. Otherwise, please go through the instructions on our Provider documentation page to help set one up: https://www.serverless.com/framework/docs/guides/providers#adding-providers-in-the-dashboard

### Step 2: Connect to Github

1. Login to [https://app.serverless.com/](https://app.serverless.com/).
2. Navigate to the app which contains the service you want to deploy and click the menu icon (...) on the right hand side and choose "settings"
3. In the “connect to git” section, click “connect to Github” or "connect to BitBucket" and follow the instructions to authenticate and install the Serverless Framework app.
4. In the “repository settings” section, select the repository and base directory if needed containing your service. The service name specified in the serverless.yml must match the service you are configuring.
5. In the "branch deploys" section, you can choose to map a specific branch in your repo to the correct stage. When code is merged to that branch it then deploys using that stage and its associated Provider (and parameters).
6. Changes will be automatically saved when you make them

That’s it! You do not have to create any configuration files in your repository or define your test commands or your
deployment commands.

Your service will now deploy from the master branch and you’ll see all the test results, logs, safeguard pass/fail
status, and deployment details.

### Step 3: Deploy from a Github branch

Now that you are setup to deploy all changes to the master branch to the dev stage for your service, go ahead and make a
commit and navigate to “deployments” in the dashboard. You will be able to see the new test and deployment.
