<!--
title: Deploy from Your Own CI/CD Pipeline
description: Run serverless deploy in GitHub Actions or any CI/CD service, with an Access Key or License Key, AWS OIDC credentials and the right variables.
short_title: Deploy in your own CI/CD
keywords:
  [
    'Serverless Framework',
    'GitHub Actions',
    'CI/CD',
    'SERVERLESS_ACCESS_KEY',
    'SERVERLESS_LICENSE_KEY',
    'OIDC',
    'configure-aws-credentials',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/dashboard/cicd/running-in-your-own-cicd)

<!-- DOCS-SITE-LINK:END -->

# Deploy from your own CI/CD pipeline

Run `serverless deploy` from any CI/CD service, such as GitHub Actions, GitLab CI/CD, CircleCI, Jenkins or Bitbucket Pipelines, instead of the Dashboard's managed [Serverless CI/CD](./README.md). A pipeline needs three things: Node.js and the CLI, a Serverless Access Key or License Key in an environment variable (a pipeline can't complete the browser sign-in of `serverless login`), and AWS credentials.

## Deploy with GitHub Actions

This workflow deploys the `dev` stage on every push to `main`. It assumes an IAM role through OpenID Connect (OIDC), so no AWS keys are stored in GitHub. Before you add it, set up:

- an IAM role that GitHub Actions can assume ([Set up AWS OIDC for GitHub Actions](#set-up-aws-oidc-for-github-actions)), with its ARN in a repository variable named `AWS_DEPLOY_ROLE_ARN`;
- an Access Key in a repository secret named `SERVERLESS_ACCESS_KEY` ([Sign in to Serverless without a browser](#sign-in-to-serverless-without-a-browser));
- a committed `package-lock.json`, when the service has npm dependencies.

Save the workflow as `.github/workflows/deploy-dev.yml` at the root of the repository:

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

A successful run ends with the deploy step's summary:

```text
Deploying "my-service" to stage "dev" (us-east-1)

✔ Service deployed to stack my-service-dev (48s)
```

What the workflow does, and what to change:

- `id-token: write` lets `configure-aws-credentials` exchange the job's OIDC token for temporary credentials of the role. The step exports them as `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN`, plus `AWS_REGION`.
- The `concurrency` group lets one run deploy at a time. A newer run waits for the running one and replaces an older run that is still waiting, so the latest commit deploys and two runs of this workflow never update the stack at once.
- `npm ci` installs the plugins and packages that `package-lock.json` lists. `cache: npm` caches npm's download cache keyed on that file. Without npm dependencies, remove both.
- Set `provider.region` in `serverless.yml`, or pass `--region`. The deploy falls back to the `AWS_REGION` that `aws-region` exports only when neither is set, and the Dashboard Provider and parameter lookup doesn't read `AWS_REGION` at all ([AWS credentials in a pipeline](#aws-credentials-in-a-pipeline)).
- A service in a subdirectory: keep the workflow at the root (GitHub reads workflows only from `.github/workflows`), and set `defaults.run.working-directory` to the service directory, plus `cache-dependency-path` to its `package-lock.json`.
- To sign in with a License Key instead, store it as `SERVERLESS_LICENSE_KEY` and pass that variable to the deploy step.
- When the packaged service matches the last deploy, a re-run prints `No changes to deploy. Deployment skipped.` and leaves the stack as it is. `serverless deploy --force` deploys anyway.

The workflow uses the current major versions of [actions/checkout](https://github.com/actions/checkout), [actions/setup-node](https://github.com/actions/setup-node) and [aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials).

## Set up AWS OIDC for GitHub Actions

GitHub Actions gets short-lived AWS credentials by assuming an IAM role through OpenID Connect. Set it up once per AWS account:

1. Create the IAM OIDC identity provider for GitHub, with the provider URL `https://token.actions.githubusercontent.com` and the audience `sts.amazonaws.com`. With the AWS CLI:

   ```bash
   aws iam create-open-id-connect-provider \
     --url https://token.actions.githubusercontent.com \
     --client-id-list sts.amazonaws.com
   ```

2. Create an IAM role with a trust policy that lets only your repository's workflow assume it:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": {
           "Federated": "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
         },
         "Action": "sts:AssumeRoleWithWebIdentity",
         "Condition": {
           "StringEquals": {
             "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
             "token.actions.githubusercontent.com:sub": "repo:GITHUB_OWNER/GITHUB_REPO:ref:refs/heads/main"
           }
         }
       }
     ]
   }
   ```

   Replace `123456789012` with your AWS account ID and `GITHUB_OWNER/GITHUB_REPO` with your repository. The `sub` value depends on the trigger and the repository: a `pull_request` run sends `repo:GITHUB_OWNER/GITHUB_REPO:pull_request`, a job with an `environment` sends `repo:GITHUB_OWNER/GITHUB_REPO:environment:NAME`, and repositories that use GitHub's immutable subject claims add IDs (`repo:GITHUB_OWNER@OWNER_ID/GITHUB_REPO@REPO_ID:...`). GitHub's [OIDC reference](https://docs.github.com/en/actions/reference/security/oidc) lists every form.

3. Attach a policy that lets the role deploy the service: CloudFormation, the deployment bucket in S3, IAM roles for the functions, Lambda and the services your functions use. The [sample policy for a custom IAM role](../providers.md#use-a-custom-iam-role-and-policy) is a starting point.
4. Store the role's ARN in the repository variable `AWS_DEPLOY_ROLE_ARN`.

For other CI/CD services, see [Create an OpenID Connect identity provider in IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html) and your service's OIDC documentation.

## Deploy a stage per pull request with GitHub Actions

To review each pull request on its own deployment, deploy a stage named after the pull request number and remove it when the pull request closes. This workflow deploys `pr-<number>` on every push to a pull request and runs `serverless remove` for that stage when the pull request is merged or closed:

```yaml
# .github/workflows/preview.yml
name: Preview

on:
  pull_request:
    types: [opened, synchronize, reopened, closed]

permissions:
  contents: read
  id-token: write

concurrency:
  group: preview-${{ github.event.pull_request.number }}
  cancel-in-progress: false

env:
  STAGE: pr-${{ github.event.pull_request.number }}
  SERVERLESS_ACCESS_KEY: ${{ secrets.SERVERLESS_ACCESS_KEY }}

jobs:
  deploy:
    if: github.event.action != 'closed'
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
          role-to-assume: ${{ vars.AWS_PREVIEW_ROLE_ARN }}
          aws-region: us-east-1
      - run: serverless deploy --stage "$STAGE"

  remove:
    if: github.event.action == 'closed'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          ref: ${{ github.event.pull_request.head.sha }}
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm install -g serverless
      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: ${{ vars.AWS_PREVIEW_ROLE_ARN }}
          aws-region: us-east-1
      - run: serverless remove --stage "$STAGE"
```

What to know about the pull request workflow:

- The preview role's ARN goes in the repository variable `AWS_PREVIEW_ROLE_ARN`, and the role must trust the `sub` value `repo:GITHUB_OWNER/GITHUB_REPO:pull_request`. A separate role, ideally in a separate AWS account, keeps preview deploys away from production.
- With `org`, `app` and `service` in `serverless.yml` and an Access Key, each `pr-<number>` stage is a new service instance with no Provider of its own, so a Provider linked to the service, or else the org default, deploys it instead of the preview role. To deploy preview stages with the preview role, add an `aws` resolver with `dashboard: false`, or link Providers only to the instances that need them, with no service Provider and no org default.
- The stage becomes part of the CloudFormation stack name (`my-service-pr-12`), which allows only letters, digits and hyphens, so the workflow uses `pr-<number>` rather than the branch name.
- GitHub doesn't pass repository secrets to workflows triggered by pull requests from forks, and treats Dependabot pull requests the same way, so this workflow deploys pull requests from branches of the same repository.
- The `remove` job checks out the pull request's last commit, because `serverless remove` reads `serverless.yml` and loads its plugins.

## Sign in to Serverless without a browser

`serverless deploy` and the other service commands need a Serverless sign-in. In a pipeline, set one of these keys as a secret environment variable of the CI/CD service:

- `SERVERLESS_ACCESS_KEY`: an Access Key, created in the Dashboard under Settings > Access Keys (`https://app.serverless.com/settings/accessKeys`). The key belongs to the user who created it and to one org. Create a key for the pipeline and label it (for example `github-ci`) rather than reusing your own: deleting a key stops every pipeline that uses it.
- `SERVERLESS_LICENSE_KEY`: a [License Key](../../license-keys.md), created under Settings > License Keys (`https://app.serverless.com/settings/licenseKeys`). A License Key isn't tied to a user and needs an active subscription. Dashboard features are unavailable with it, so a service with `org` and `app` in `serverless.yml` (in a [Serverless Compose](../../compose.md) project, `app` alone) stops with an error when it is deployed with a License Key.

The CLI reads the key from the environment on every command and doesn't save it to `~/.serverlessrc`. When several sign-ins are present, the CLI uses the first of these:

1. `SERVERLESS_ACCESS_KEY` (alias `SERVERLESS_USER_ACCESS_KEY`).
2. A user session saved by `serverless login` in `~/.serverlessrc`.
3. `SERVERLESS_LICENSE_KEY` (alias `SERVERLESS_ORG_ACCESS_KEY`), else `licenseKey` in `serverless.yml`.
4. A License Key saved in `~/.serverlessrc`.
5. The `/serverless-framework/license-key` SSM parameter in the AWS account and Region of the deploy, read only when none of the preceding sign-ins exists.

The key decides the org. When the first of `--org`, `org` in `serverless.yml` and `SERVERLESS_ORG_NAME` names another org, the command stops with an error (see [Troubleshooting](#the-provided-access-key-is-not-for-the-org)).

## AWS credentials in a pipeline

A deploy in a pipeline takes its AWS credentials the same way as on your machine ([Which credentials a deploy uses](../../../providers/aws/guide/credentials.md#which-credentials-a-deploy-uses)). Choose one of:

- **An IAM role assumed through OIDC.** No AWS keys are stored in the CI/CD service. GitHub Actions, GitLab CI/CD and CircleCI all issue OIDC tokens that a job exchanges for the role's temporary credentials.
- **Access keys of an IAM user** in `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, stored as secrets of the CI/CD service.
- **A Serverless Dashboard [Provider](../providers.md)**, which needs no AWS credentials in the pipeline at all.

A Dashboard Provider takes precedence over the credentials the pipeline sets. It applies when all of these hold: `serverless.yml` sets `org`, `app` and `service` (in a Serverless Compose project, `app` and `service`, with the org of the sign-in); the CLI signs in with an Access Key or a saved `serverless login` session, not a License Key; and the Dashboard has a Provider linked to the service instance, the service, or set as the org default. To deploy with the pipeline's credentials anyway, add an `aws` resolver with `dashboard: false` ([Dashboard Providers with resolvers](../../../providers/aws/guide/credentials.md#using-serverless-dashboard-providers-with-resolvers)).

The deploy Region is the first of: `--region`, the `region` of the `aws` resolver that supplies the credentials, `provider.region`, the `AWS_REGION` environment variable, and `us-east-1`.

The Dashboard Provider and the Dashboard parameters are looked up for the service instance: the stage and Region of the command. That lookup takes the Region from `--region`, else `provider.region`, else `us-east-1`; it doesn't read `AWS_REGION` or a resolver's `region`. To deploy to `eu-west-1` with the `eu-west-1` instance's Provider and parameters, set `provider.region: eu-west-1` or pass `--region eu-west-1`, not only `aws-region` in the workflow.

## Environment variables the CLI reads in CI

The CLI reads these variables in a pipeline:

| Variable                                                                                   | Effect                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SERVERLESS_ACCESS_KEY`                                                                    | Signs in with an Access Key. Takes precedence over every other sign-in. Alias: `SERVERLESS_USER_ACCESS_KEY`.                                                                                                                                              |
| `SERVERLESS_LICENSE_KEY`                                                                   | Signs in with a License Key when no Access Key and no saved `serverless login` session exist. Takes precedence over `licenseKey` in `serverless.yml`. Alias: `SERVERLESS_ORG_ACCESS_KEY`.                                                                 |
| `SERVERLESS_ORG_NAME`                                                                      | The org, when neither `--org` nor `org` in `serverless.yml` names one.                                                                                                                                                                                    |
| `CI`                                                                                       | Any value, including an empty one, makes the run non-interactive ([Run the CLI without a terminal](#run-the-cli-without-a-terminal)).                                                                                                                     |
| `GITHUB_ACTIONS`, `GITLAB_CI`, `CIRCLECI` and the other CI markers listed after this table | Mark a CI environment.                                                                                                                                                                                                                                    |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_PROFILE`           | AWS credentials from the AWS SDK's default chain, used when no Dashboard Provider, `aws` resolver, `--aws-profile` or `provider.profile` supplies them. With `AWS_PROFILE` set, the SDK uses that profile and skips the key variables.                    |
| `AWS_REGION`                                                                               | The deploy Region when neither `--region`, an `aws` resolver's `region`, nor `provider.region` sets one.                                                                                                                                                  |
| `HTTPS_PROXY`, `NO_PROXY`, `NODE_EXTRA_CA_CERTS`                                           | Proxy and certificate settings ([Installing behind a proxy or firewall](../../../getting-started.md#installing-behind-a-proxy-or-firewall)).                                                                                                              |
| `SERVERLESS_FRAMEWORK_FORCE_UPDATE`                                                        | Set to any value, refreshes the list of releases before the command runs and installs a newer release that matches `frameworkVersion`, like `serverless update` ([Update Serverless Framework](../../../getting-started.md#update-serverless-framework)). |

In a CI environment, `serverless login` with no existing sign-in stops with an error instead of printing a sign-in URL and waiting, and the CLI doesn't update installed Agent Skills. Any of these variables, set to any value, marks one: `CI`, `CONTINUOUS_INTEGRATION`, `BUILD_ID`, `BUILD_NUMBER`, `TEAMCITY_VERSION`, `TRAVIS`, `CIRCLECI`, `JENKINS_URL`, `GITLAB_CI`, `GITHUB_ACTIONS`, `BITBUCKET_BUILD_NUMBER`, `BUILDKITE`, `NOW_BUILDER` and `APPVEYOR`.

## Run the CLI without a terminal

The CLI treats a run as non-interactive when the `CI` variable is set, when stdin or stdout isn't a terminal, or when stdout or stderr is a terminal that reports a width of zero. [`SLS_INTERACTIVE_SETUP_ENABLE`](../../../providers/aws/cli-reference/README.md#non-interactive-use-ci-and-ai-agents), set to a non-empty value, overrides `CI` and a missing terminal, but not a width of zero. A non-interactive run prints progress as plain lines instead of a spinner, and the Serverless sign-in doesn't offer its login menu: without a key or a saved session, the command stops with the `You must sign in or use a License Key` error ([Troubleshooting](#troubleshooting)). An AWS profile that requires an MFA code still asks for the code, so give a pipeline credentials that need no MFA.

Pass every value a deploy needs on the command line or in `serverless.yml`: `--stage`, `--region`, `--org`, `--app` and `--param "key=value"`. The [deploy command reference](../../../providers/aws/cli-reference/deploy.md) lists the deploy flags.

## Install the CLI in a pipeline

The `serverless` npm package needs Node.js 18.17.0 or later and `npm` on the `PATH`; use a current LTS release, such as Node.js 24. Install it as a step of the job:

```bash
npm install -g serverless
```

On its first run, the CLI downloads the Framework release into `~/.serverless/releases`. With npm 12 and later, npm skips the package's install script unless you allow it, and prints an `npm warn install-scripts` line; the CLI then downloads its binary on the first `serverless` command instead. To run a known version in every pipeline run, set `frameworkVersion` in `serverless.yml` ([Pinning to a specific version](../../../getting-started.md#pinning-to-a-specific-version)).

## Deploy a Serverless Compose project

For a [Serverless Compose](../../compose.md) project, run `serverless deploy --stage <stage>` in the directory that holds `serverless-compose.yml`. It deploys every service, in the order their dependencies set. Compose deploys each service as it is on disk, so first install dependencies in each service directory that has a `package.json`. In a GitHub Actions job, that means one `npm ci` step per service:

```yaml
- run: npm ci
  working-directory: users-db
- run: npm ci
  working-directory: api
```

If the services are npm workspaces of the root `package.json`, a single `npm ci` at the root installs them all.

## Deployment records in the Dashboard

A deploy from your own pipeline appears in the Dashboard like a deploy from a laptop: when `serverless.yml` sets `org`, `app` and `service` and the CLI signs in with an Access Key, `serverless deploy` and `serverless remove` record a deployment, successful or not, with its stage, Region, stack outputs and the git branch and commit of the checkout.

## Troubleshooting

### `You must sign in or use a License Key with Serverless Framework V.4 and later versions: ...`

```text
You must sign in or use a License Key with Serverless Framework V.4 and later versions: if the user is at the keyboard, run "serverless login" (without a terminal it prints a sign-in URL for them to open and waits up to 10 minutes); for unattended runs, set SERVERLESS_ACCESS_KEY (create one at https://app.serverless.com/settings/accessKeys) or SERVERLESS_LICENSE_KEY (create one at https://app.serverless.com/settings/licenseKeys).
```

**Cause:** the command found no Serverless sign-in and can't prompt. In GitHub Actions, a secret that isn't passed to the step's `env`, or a run from a fork, leaves the variable unset.

**Fix:** set `SERVERLESS_ACCESS_KEY` or `SERVERLESS_LICENSE_KEY` in the environment of the step that runs `serverless`.

### `The provided Access Key is not for the Org`

```text
The provided Access Key is not for the Org "myorg". Please provide an Access Key for the "myorg" Org.
```

With a License Key, the message starts with `The provided License Key is not for the Org`.

**Cause:** `--org`, `org` in `serverless.yml` or `SERVERLESS_ORG_NAME` names an org other than the key's org.

**Fix:** use a key created in that org, or correct the org name.

### `This Service is enabled for Serverless Framework Dashboard because the "app" property is set. ...`

```text
This Service is enabled for Serverless Framework Dashboard because the "app" property is set. However, you are using a License Key and Dashboard features are not available when using License Keys. Please remove "app" and any other Dashboard features to continue using this Service.
```

**Cause:** the pipeline signs in with a License Key, and `serverless.yml` sets `org` and `app` (in a Serverless Compose project, `app` alone).

**Fix:** sign in with `SERVERLESS_ACCESS_KEY`, or remove `app` from `serverless.yml`.

## Related

- [Serverless CI/CD](./README.md): the Dashboard's managed builds, an alternative to running your own pipeline.
- [AWS credentials](../../../providers/aws/guide/credentials.md): resolvers, profiles and Dashboard Providers.
- [License Keys](../../license-keys.md): create, store and rotate License Keys.
- [Login command](../../../providers/aws/cli-reference/login.md#non-interactive-shells): `serverless login` without a terminal.
