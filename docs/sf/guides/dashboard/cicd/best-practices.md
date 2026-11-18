<!--
title: Dashboard CI/CD Best Practices
description: Organize services, AWS accounts, secrets and preview stages for Serverless Dashboard CI/CD as the number of services and teams grows.
short_title: Best Practices
keywords:
  [
    'Serverless Framework',
    'Serverless Dashboard',
    'CI/CD',
    'Best Practices',
    'Deployment',
    'Automation',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/dashboard/cicd/best-practices)

<!-- DOCS-SITE-LINK:END -->

# Dashboard CI/CD best practices

These practices help you keep Serverless Dashboard CI/CD manageable as the number of services, stages and teams grows. Each one links to the page that sets it up.

A service that follows them keeps its Dashboard identity in `serverless.yml` and reads secrets from Dashboard parameters instead of the repository:

```yaml
# serverless.yml
org: myorg
app: my-app
service: orders

provider:
  name: aws
  runtime: nodejs24.x
  environment:
    STRIPE_SECRET_KEY: ${param:stripeSecretKey}

functions:
  createOrder:
    handler: handler.createOrder
```

The `org`, `app` and `service` values decide which Dashboard service the CI/CD deployment belongs to. `stripeSecretKey` is a Dashboard parameter you create on the service or on one of its instances.

## One service per directory in a mono-repo

Put each service's `serverless.yml` in its own directory and set that directory as the service's base directory in the CI/CD settings. Use trigger directories so that a commit deploys only the services whose files, or whose shared code, changed. [Dashboard CI/CD for mono-repos](./mono-repo.md) shows the setup.

## Separate AWS accounts per stage with providers

Deploy production to its own AWS account. Add one provider for production and one for every other stage, link the non-production provider to the service, and link the production provider to the production instances. A provider linked to an instance takes precedence over the service's provider, and the service's provider takes precedence over the org's default provider. [Different accounts per stage](../providers.md#deploy-each-stage-to-its-own-account) explains the setup.

## Secrets in Dashboard parameters

Store API keys, tokens and other secrets as Dashboard parameters and reference them with `${param:<name>}`, as in the preceding example. A parameter on the service applies to every stage; a parameter with the same name on an instance replaces it for that instance, one stage in one Region. A `params` entry with the same name in `serverless.yml`, or a `--param` option, takes precedence over both. [Serverless Dashboard parameters](../../parameters.md#serverless-dashboard-parameters) covers creating them and the full resolution order.

## Isolated stages for pull requests

Turn on preview deployments with the branch name as the stage, so that each pull request deploys to its own stage, and have the stage removed when the pull request's branch is deleted. Point the service's provider at a separate AWS account for these stages and keep production on an instance-level provider. See [Preview deployments](./preview-deployments.md) and [Preview account for CI/CD preview deployments](../providers.md#deploy-cicd-previews-to-a-preview-account).

## Tests before every deployment

Dashboard CI/CD runs a test step before it deploys and deploys only when the tests pass. The test step runs the test command configured for the service in the Dashboard; [Running tests](./running-tests.md) shows the `npm test` setup, with a `test` script in `package.json`.

## Notifications for failed deployments

Subscribe the team's channel to the "deployment failed" event, so a failed deployment from a branch or a pull request reaches someone. See [Dashboard CI/CD notifications](./notifications.md).

## Related pages

- [Dashboard CI/CD](./README.md): connect a repository and set up the first branch deployment.
- [Branch deployments](./branch-deployments.md): map branches to stages.
- [Serverless CI/CD Workflow Guide](https://www.serverless.com/guide-ci-cd): the recommended workflow for organizing apps, services and repositories, with Dashboard CI/CD or your own CI provider.
