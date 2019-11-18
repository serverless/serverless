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
4. **Must use the Node runtime**. Currently only Serverless Framework projects using the Node runtime are supported. Other runtimes are coming soon.

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

## Preview Deployment

Preview deployments enable you to deploy on every pull request. As a part of the pull request review process, it is helpful to have an instance of your serverless application deployed. A pull request will trigger the deployment and all subsequent commits on that branch will also be deployed.

### Enabling preview deployments

To enable preview deployments, select "Deploy previews for all branches" or "Deploy previews for individually selected branches". The latter will only deploy a branch from a PR targeting the selected branches.

Each deployment must target a specific stage. You can select a pre-configured stage, or you can select “use branch name as stage”.

Using "use branch name as stage" will cause the deployment to deploy to a stage with the same name as the branch name. The deployment profile associated with the "default" stage in your application will be used.

### Using branch name as stages

As development teams, we often have multiple pull requests and branches open at once. If we deploy those branches to the same stage then the deployments will override each other.

To avoid this collision, you have the convenient option to "use branch name as stage", which ensures that each pull request will deploy to a unique stage. Since the stage is not preconfigured and may not yet exist at the time of deployment, the default deployment profile will be used. In this case, ensure that the default deployment profile is configured with an [AWS Access Role](/framework/docs/dashboard/access-roles/).

If you use the "use branch name as stage", you may also want to reference the branch name in your configuration using [Variables](/framework/docs/providers/aws/guide/variables/). Since the stage name matches the branch name, you can use the `${self:provider.stage}` variable in your `serverless.yml` to reference the stage name, which will match the branch name.

## Running Tests

The Serverless Framework will automatically run tests for each deployment by running `npm test`. The tests must pass, return `0`, before the service is deployed. If the tests fail, then the service will not be deployed.

The tests only run if a `test` script is present in the `package.json` file, like in the example below:

```json
{
  "name": "my-serverless-project",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "author": "",
  "license": "ISC"
}
```

The tests will be skipped if the `npm test` command returns `Error: no test specified`. This is the response from `npm` if no `test` script is defined. It is also the default value of the `test` script when you initialize a new package.json via `npm init`.

### Automatically deleting preview deployments (recommended)

The recommended method for deleting preview service instances is to select "Destroy stage and resources when branch is deleted". If the changes in the PR are accepted then they will be merged and then the branch is deleted. If the changes are rejected the branch is also deleted. Whenever the branch is deleted, Serverless Framework Pro will automatically run `sls remove` on this service instance.

### Manually deleting preview deployments

Alternativley you can delete service via the CLI. To delete the service instance you must run `sls remove` from the CLI in the repository containing the `serverless.yml` file. The `org`, `app`, `stage`, and `region` must all match the service instance you intend to delete.

## Custom scripts

Custom scripts before or after a deployment are planned but not yet supported. If this is a requirement for you, please contact sales or support with your requirement.

Custom scripts before or after a test can be set by wrapping your test command in a new script and configuring the `test` script in `package.json` to use the wrapper script instead.

## Deployment settings

If your services depends on settings which are different for each stage, we recommend using [deployment profiles](/framework/docs/dashboard/profiles/) to set different [parameters](https://serverless.com/framework/docs/dashboard/secrets/) for each stage.
