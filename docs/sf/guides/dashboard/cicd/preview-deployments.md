<!--
title: Preview Deployments for Pull Requests
description: Deploy every pull request to its own stage with Serverless CI/CD preview deployments, and remove the stage when the branch is merged or deleted.
short_title: Preview Deployments
keywords:
  [
    'Serverless Framework',
    'Serverless CI/CD',
    'Preview deployments',
    'Pull requests',
    'Ephemeral stages',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/dashboard/cicd/preview-deployments)

<!-- DOCS-SITE-LINK:END -->

# Preview deployments for pull requests

A preview deployment in [Serverless CI/CD](./README.md) deploys a service for each pull request, so reviewers can try the change before it is merged. Opening a pull request starts a build, every later commit to the pull request's branch deploys again, and the stage can be removed automatically when the branch is merged or deleted. For a fixed branch-to-stage mapping, use [branch deployments](./branch-deployments.md).

## Turn on preview deployments

To deploy pull requests:

1. In the Dashboard, open the service's CI/CD settings (the service's **...** menu, then **settings**).
2. In **preview deploys**, check **Enable preview deploys**.
3. Select the **target pull request branch**. Only pull requests into this branch of the GitHub or Bitbucket repository are deployed.
4. Optional: check **Destroy stage and resources when branch is deleted** ([Remove preview deployments](#remove-preview-deployments)).

## Stage name for each pull request

The **stage** option, under **advanced settings** in **preview deploys**, sets the stage that preview builds deploy to:

- **use branch name as stage** (default): each pull request deploys to a stage named after its branch, so pull requests from branches with different stage names don't overwrite each other.
- A specific stage: every pull request deploys to that one stage, and each preview build replaces the previous pull request's deployment.

A stage name can contain only letters, digits and hyphens, so Serverless CI/CD replaces the other characters of a branch name with `-`. The branch `feature/ph-api` deploys to the stage `feature-ph-api`. Branches whose names differ only in those characters, such as `feature/api` and `feature-api`, deploy to the same stage, and each preview build replaces the other's deployment; give open pull requests branch names that map to different stages.

A branch named after an existing stage deploys to that stage: a pull request from a branch named `prod` deploys to the `prod` stage, with the Provider linked to the `prod` instance. Don't open pull requests from branches named after long-lived stages such as `prod` or `staging`.

To use the stage name in `serverless.yml`, for example to name a resource after the branch, use the `${sls:stage}` [variable](../../variables/core.md). In `serverless.yml`:

```yaml
provider:
  name: aws
  runtime: nodejs24.x
  environment:
    TABLE_NAME: my-service-${sls:stage}
```

## AWS account for preview deployments

A preview deployment takes its AWS credentials from a Dashboard [Provider](../providers.md): the Provider linked to the service instance (the stage and Region), else the Provider linked to the service, else the org's default Provider.

With **use branch name as stage**, each branch is a new stage with no Provider of its own, so preview builds use the service's Provider or the org default. Link a Provider for a preview AWS account to the service, and link the production Provider to the `prod` instance only ([Preview account for CI/CD preview deployments](../providers.md#deploy-cicd-previews-to-a-preview-account)). With a specific stage, a Provider linked to that stage's instance takes precedence.

## Remove preview deployments

With **Destroy stage and resources when branch is deleted** checked, Serverless CI/CD runs a destroy build when the pull request's branch is merged or deleted. The destroy build removes the stage's stack and resources, the equivalent of `serverless remove`.

**Warning:** With a specific stage, every pull request deploys to that one stage, so the destroy build of any merged or deleted branch removes it, even while other pull requests are open. Leave **Destroy stage and resources when branch is deleted** unchecked when preview builds use a specific stage.

To remove a preview deployment yourself, run `serverless remove` in the directory that contains the service's `serverless.yml`, with the stage and Region of the preview deployment:

```bash
serverless remove --stage feature-ph-api --region us-east-1
```

The `org`, `app`, stage and Region must match the service instance you remove. The command uses your own AWS credentials, or the Dashboard Provider when `serverless.yml` sets `org` and `app`, a Provider is linked to the instance or the service or set as the org default, and you are signed in with an Access Key or `serverless login`.

## Related

- [Branch deployments](./branch-deployments.md): deploy long-lived stages from fixed branches.
- [Providers](../providers.md): AWS accounts per service, instance and org.
- [Deploy a stage per pull request with GitHub Actions](./running-in-your-own-cicd.md#deploy-a-stage-per-pull-request-with-github-actions): the same pattern in your own pipeline.
