<!--
title: Serverless CI/CD
description: 'Test and deploy services from GitHub or Bitbucket with Serverless CI/CD, the Dashboard''s managed builds: requirements, setup and build steps.'
short_title: Serverless CI/CD
keywords:
  [
    'Serverless Framework',
    'Serverless CI/CD',
    'Serverless Dashboard',
    'GitHub',
    'Bitbucket',
    'Continuous deployment',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/dashboard/cicd)

<!-- DOCS-SITE-LINK:END -->

# Serverless CI/CD

Serverless CI/CD is the Serverless Framework Dashboard's managed build service: it tests and deploys a service from a GitHub or Bitbucket repository on every push to a mapped branch and, with preview deployments on, for pull requests. It needs no pipeline file in the repository and no build servers. To run the Framework in GitHub Actions, GitLab CI/CD or another CI/CD service instead, see [Deploy from your own CI/CD pipeline](./running-in-your-own-cicd.md).

## Requirements for Serverless CI/CD

A service can use Serverless CI/CD when:

- **The service is in a GitHub or Bitbucket repository**, with its `serverless.yml` at the repository root or in a subdirectory (the base directory).
- **The `service` name in `serverless.yml` matches the service** you configure in the Dashboard.
- **A Dashboard [Provider](../providers.md) supplies the AWS credentials.** The build has no AWS credentials of its own. It uses the Provider linked to the service instance (the stage and Region), else the Provider linked to the service, else the org's default Provider.
- **The service uses the Node.js or Python runtime.** The build installs dependencies with npm and runs the test command before it deploys.

## Set up Serverless CI/CD

1. Create a Provider for your AWS account and link it to the service, or set it as the org default ([Providers](../providers.md)). A Provider with an AWS Access Role gives each deployment short-lived credentials.
2. Sign in to the [Dashboard](https://app.serverless.com/), open the app that contains the service, and choose **settings** from the service's **...** menu.
3. In **connect to git**, choose **connect to Github** or **connect to BitBucket**, and follow the prompts to authorize and install the Serverless app for your account.
4. In **repository settings**, select the repository, and the base directory when the service is in a subdirectory.
5. In **branch deploys**, map a branch to a stage ([Branch deployments](./branch-deployments.md)). Optional: in **preview deploys**, turn on deployments for pull requests ([Preview deployments](./preview-deployments.md)).

The Dashboard saves each setting as you change it. To check the setup, push a commit to a mapped branch and open **deployments** in the Dashboard: the new build appears there with its test results, logs and deployment details.

## What a Serverless CI/CD build runs

Each build clones the repository, checks out the commit, installs dependencies with npm, runs the configured test command ([Run tests in Serverless CI/CD](./running-tests.md)) and runs `serverless deploy` for the mapped stage. When the test step fails, the build stops before the deploy step and the deployed service stays unchanged.

Settings that change a build:

- **Region**: with the `default` setting, the build passes no Region, and the service deploys to the Region its `serverless.yml` resolves.
- **Test command**: the command the test step runs.
- **Trigger Directories**: limit builds to commits that change specific directories ([Mono-repo support](./mono-repo.md)).
- **Parameters**: Dashboard parameters of the service and stage are available to the build as environment variables ([Private packages](./private-packages.md)).

To run your own commands at each step, see [Custom scripts](./custom-scripts.md).

## Serverless CI/CD guides

- [Branch deployments](./branch-deployments.md): deploy a stage on every push to a branch.
- [Preview deployments](./preview-deployments.md): deploy each pull request to its own stage and remove it when the branch goes away.
- [Run tests in Serverless CI/CD](./running-tests.md): the test step, its command and Python dependencies.
- [Custom scripts](./custom-scripts.md): run commands before or after install, test and deploy.
- [Private packages](./private-packages.md): install packages from a private npm registry.
- [Notifications](./notifications.md): get notified when a deployment starts, succeeds or fails.
- [Mono-repo support](./mono-repo.md): deploy several services from one repository with Trigger Directories.
- [Deploy from your own CI/CD pipeline](./running-in-your-own-cicd.md): run the Framework in GitHub Actions or another CI/CD service.
- [Troubleshooting](./troubleshooting.md): reset the GitHub connection.
