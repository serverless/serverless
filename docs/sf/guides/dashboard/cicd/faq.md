<!--
title: Dashboard CI/CD FAQ
description: 'Answers to common questions about Serverless Dashboard CI/CD: pricing, Git providers, runtimes, AWS accounts per stage and preview deployments.'
short_title: FAQ
keywords:
  [
    'Serverless Framework',
    'Serverless Dashboard',
    'CI/CD',
    'FAQ',
    'Preview deployments',
    'AWS',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/dashboard/cicd/faq)

<!-- DOCS-SITE-LINK:END -->

# Dashboard CI/CD FAQ

Answers to common questions about Serverless Dashboard CI/CD, the Dashboard feature that tests and deploys Serverless Framework services from a Git repository. To set it up, start with [Dashboard CI/CD](./README.md).

## How is Dashboard CI/CD priced?

Dashboard features, including CI/CD, are priced separately from the Serverless Framework CLI license. [Pricing](../../upgrading-v4.md#pricing) explains how the CLI and the Dashboard are billed, and the [Serverless pricing page](https://www.serverless.com/pricing) lists the current plans.

## Which Git providers can Dashboard CI/CD deploy from?

Dashboard CI/CD deploys from GitHub and Bitbucket repositories.

## Which runtimes does Dashboard CI/CD support?

Dashboard CI/CD supports services that use the Node.js or Python runtime.

## Which cloud providers can Dashboard CI/CD deploy to?

Dashboard CI/CD deploys to AWS. Serverless Framework v4 deploys only to AWS: a `serverless.yml` whose `provider.name` is set to anything other than `aws` stops with an error before deployment.

## Can Dashboard CI/CD deploy different branches to different stages?

Yes. Add a branch deployment for each branch and choose its target stage, for example `main` to a `staging` stage and a `prod` branch to a `prod` stage. Commits to a source branch deploy to its target stage; in a mono-repo, [trigger directories](./mono-repo.md) can limit which commits deploy. See [Branch deployments](./branch-deployments.md).

## Can Dashboard CI/CD deploy pull requests?

Yes, with preview deployments. Dashboard CI/CD tests and deploys the service from each pull request to the target branch you choose and posts the results in the pull request status. With the branch name as the stage, each pull request gets its own stage, and the destroy option runs `serverless remove` on that stage when the pull request's branch is deleted. See [Preview deployments](./preview-deployments.md).

## Can Dashboard CI/CD use a different AWS account for each stage?

Yes, with providers. Add a provider for each AWS account to your org, link one provider to the service, and link a different provider to the instances of the stages that deploy to another account. A provider linked to an instance takes precedence over the service's provider, and the service's provider takes precedence over the org's default provider. See [Different accounts per stage](../providers.md#deploy-each-stage-to-its-own-account).

Providers replace Dashboard deployment profiles for mapping AWS accounts to stages.

## Does Dashboard CI/CD work only with the Serverless Framework?

Yes. Dashboard CI/CD deploys Serverless Framework services: each deployment runs the Framework in the service's base directory, on the service configuration file there (such as `serverless.yml`), with the plugins it lists.

## Do I need to host or operate build agents for Dashboard CI/CD?

No. Dashboard CI/CD runs builds on infrastructure that Serverless, Inc. operates, so there are no build agents or servers to host. To deploy from your own CI system instead, see [Deploy in your own CI/CD](./running-in-your-own-cicd.md).

## Related pages

- [Dashboard CI/CD](./README.md): connect a repository and set up the first deployment.
- [Dashboard CI/CD best practices](./best-practices.md): organize services, AWS accounts, secrets and preview stages.
- [Troubleshooting Dashboard CI/CD](./troubleshooting.md): fix GitHub connection problems.
