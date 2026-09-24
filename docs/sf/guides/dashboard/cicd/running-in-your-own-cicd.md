<!--
title: Serverless Dashboard - Running in your own CI/CD
description: Learn how to deploy your Serverless Framework services using your own CI/CD service while leveraging Serverless Framework Dashboard features.
short_title: Serverless Dashboard - Running your own CI/CD
keywords:
  [
    'Serverless Framework',
    'CI/CD',
    'Custom CI/CD',
    'Deployment',
    'Serverless Dashboard',
    'Node.js',
    'NPM',
    'Authentication',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://serverless.com/framework/docs/guides/cicd/running-in-your-own-cicd/)

<!-- DOCS-SITE-LINK:END -->

# Deploy in your own CI/CD

You can deploy from any CI/CD service, such as GitHub Actions, GitLab CI or CircleCI, while still using the Serverless Framework Dashboard. A pipeline needs three things: the CLI, a way to sign in to Serverless without a browser, and AWS credentials.

## Configure the environment

### Install Node.js and the CLI

The CLI runs on Node.js 18 or later; use a current LTS release. Install the CLI as a step of the pipeline:

```sh
npm install -g serverless
```

npm 12 prints a warning that it blocked the package's install script. The CLI still works: it downloads what it needs on its first run.

### Sign in to Serverless

`serverless login` opens a browser, which a pipeline doesn't have. Give the pipeline a key in an environment variable instead, stored as a secret of your CI/CD service:

- `SERVERLESS_ACCESS_KEY`: an Access Key. Create one in the Dashboard under Settings > Access Keys (https://app.serverless.com/settings/accessKeys). The key is scoped to your user and the org, and stops working as soon as you leave the org.
- `SERVERLESS_LICENSE_KEY`: a [License Key](../../license-keys.md), for a key that is not tied to a user.

Which one to use:

- An Access Key belongs to one user, so create one just for the pipeline and label it (for example `github-ci`) rather than reusing your own. A personal key stops working in CI when you leave the org or delete the key.
- A License Key isn't tied to a user and doesn't expire. It needs an active subscription, and it turns off the Dashboard for the deploys that use it (see [License Keys](../../license-keys.md)).

### Provide AWS credentials

A deploy takes its AWS credentials the same way as on your machine (see [which credentials a deploy uses](../../../providers/aws/guide/credentials.md#which-credentials-a-deploy-uses)). In a pipeline, prefer short-lived credentials:

- **An IAM role the pipeline assumes through OpenID Connect (OIDC).** No AWS keys are stored in the CI/CD service. GitHub Actions, GitLab and CircleCI all support it: register the provider's OIDC issuer as an identity provider in IAM, and create a role that trusts it, limited to your repository and branch. The role needs permission to deploy the service's stack.
- **Access keys** of an IAM user in `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, stored as secrets.
- **The org's [Serverless Dashboard Provider](../providers.md)**, when the service uses one.

## Configure the build step

Run this on every deploy:

```sh
npm ci # installs the service's plugins and packages
serverless deploy --stage <stage>
```

`npm ci` installs exactly what `package-lock.json` lists, so commit the lockfile (`npm install` writes it). A service with no npm dependencies can leave the `npm ci` step out.

## Example: GitHub Actions

This workflow deploys the `dev` stage on every push to `main`, with an IAM role assumed through OIDC. It expects:

- an IAM identity provider for `https://token.actions.githubusercontent.com` with the audience `sts.amazonaws.com`, and a role that trusts it for this repository (see the [configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials#configuring-iam-to-trust-github) README for the trust policy);
- the role's ARN in a repository variable named `AWS_DEPLOY_ROLE_ARN`;
- an Access Key in a repository secret named `SERVERLESS_ACCESS_KEY`.

```yaml
# .github/workflows/deploy-dev.yml
name: Deploy dev

on:
  push:
    branches: [main]

permissions:
  contents: read
  id-token: write # lets the job request the OIDC token for AWS

concurrency:
  group: deploy-dev
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm install -g serverless
      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: us-east-1
      - run: serverless deploy --stage dev
        env:
          SERVERLESS_ACCESS_KEY: ${{ secrets.SERVERLESS_ACCESS_KEY }}
```

GitHub reads workflows only from `.github/workflows` at the root of the repository. When the service lives in a subdirectory, keep the workflow at the root and set `defaults.run.working-directory` to the service directory.

`cache: npm` and `npm ci` both need the committed `package-lock.json`. Without npm dependencies, remove `cache: npm` and the `npm ci` step.

## Deploying a Compose project

For a [Serverless Compose](../../compose.md) project, run `serverless deploy --stage <stage>` in the directory that holds `serverless-compose.yml`. It deploys every service, in the order their dependencies set. Compose deploys each service as it is on disk, so first install dependencies in each service directory that has a `package.json`. In the GitHub Actions example, that means one `npm ci` step per service:

```yaml
- run: npm ci
  working-directory: users-db
- run: npm ci
  working-directory: api
```

If the services are npm workspaces of the root `package.json`, a single `npm ci` at the root installs them all.
