<!--
title: Serverless Dashboard - CI/CD
menuText: CI/CD
menuOrder: 3
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://serverless.com/framework/docs/guides/cicd/)

<!-- DOCS-SITE-LINK:END -->

# CI/CD

Serverless CI/CD enables you to automatically test and deploy services from Github.

## Requirements

Before you setup your CI/CD workflow, make sure you meet the following requirements:

1. **Must have your Serverless Framework project checked into Github**. Currently only Github is supported as a VCS provider. Your project, including the serverless.yml file, must be checked into the repo.
2. **Must be deployed on AWS**. The dashboard currently only supports AWS as a cloud service provider. Other cloud service providers are a work in progress.
3. **Must use the Node or Python runtime**. Currently only Serverless Framework projects using the Node or Python runtimes are supported. Other runtimes are coming soon.

## Getting Started in 3 steps

### Step 1: Link your AWS Account

As is the case with deployments from the Serverless Framework CLI, Serverless CI/CD requires access to your AWS Account in order to deploy your services. To make this process as secure as possible, Serverless CI/CD will generate short-lived credentials to your AWS account on each deployment. This is done by creating an AWS Access Role in your AWS account and associating it with a Profile in the Serverless Framework Pro Dashboard.

If you’ve already setup an AWS Access Role in a Profile you can skip this step.

1. To setup the AWS Access Role, login to [https://app.serverless.com/](https://app.serverless.com/) and navigate to the “profiles” tab.
2. Select the “default” profile, and go to the “AWS Access Role” tab.
3. Follow the provided instructions, supply the AWS Access Role ARN, and save your changes.

Serverless Framework Pro associates each deployment Profile, and therefore AWS Access Role and account, with individual stages in your application. Before we setup CI/CD, we also have to create the stages in your application and add the deployment Profile.

1. Go to the app list in the dashboard and select your app
2. Navigate to the “app settings” tab, and go to “stages”
3. Add a new stage, name it “dev” and select the “default” profile.

You can add more stages and profiles later.

### Step 2: Connect to Github

1. Login to [https://app.serverless.com/](https://app.serverless.com/).
2. Navigate to the app which contains the service you want to deploy.
3. Next to the service name, you’ll see the status “Automatic deployments are disabled”; click “enable”.
4. In the “repository connection” section, click “connect to Github” and follow the instructions to authenticate with Github and install the Serverless Framework app.
5. In the “build settings” section, select the repository and base directory containing your service. The service name specified in the serverless.yml must match the service you are configuring.
6. By default the CI/CD settings will be configured to deploy changes from the default branch (usually master) to the dev stage. You can revisit this later and modify your branch deployments to deploy from any branch to any stage, or add preview deployments to deploy from pull requests.
7. Now click “Save”

That’s it! You do not have to create any configuration files in your repository or define your test commands or your
deployment commands.

Your service will now deploy from the master branch and you’ll see all the test results, logs, safeguard pass/fail
status, and deployment details.

### Step 3: Deploy from a Github branch

Now that you are setup to deploy all changes to the master branch to the dev stage for your service, go ahead and make a
commit and navigate to “deployments” in the dashboard. You will be able to see the new test and deployment.
