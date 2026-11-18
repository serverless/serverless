<!--
title: Branch Deployments in Serverless CI/CD
description: Deploy a service to a stage on every push to a GitHub or Bitbucket branch with Serverless CI/CD branch deployments, and choose the AWS account per stage.
short_title: Branch Deployments
keywords:
  [
    'Serverless Framework',
    'Serverless CI/CD',
    'Branch deployments',
    'Continuous deployment',
    'GitHub',
    'Bitbucket',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/dashboard/cicd/branch-deployments)

<!-- DOCS-SITE-LINK:END -->

# Branch deployments

A branch deployment in [Serverless CI/CD](./README.md) deploys a service to a fixed stage on every push to a branch of its GitHub or Bitbucket repository, for example `main` to `dev` and `prod` to `prod`. Use branch deployments for long-lived stages; for a short-lived stage per pull request, use [preview deployments](./preview-deployments.md).

## Add a branch deployment

To deploy a branch to a stage:

1. In the Dashboard, open the service's CI/CD settings (the service's **...** menu, then **settings**).
2. In **branch deploys**, choose the branch in the **source branch** column and the stage in the **target stage** column.
3. Repeat for each branch and stage you deploy.

Each mapping names one branch and one stage. After you save it, every commit pushed to the source branch starts a build that tests the commit and runs `serverless deploy` for the target stage. When [Trigger Directories](./mono-repo.md) are set, only commits that change files in those directories start a build.

## AWS account for each stage

A branch deployment takes its AWS credentials from a Dashboard [Provider](../providers.md). The build uses the first Provider it finds:

1. the Provider linked to the service instance, that is the target stage in the deploy Region;
2. the Provider linked to the service;
3. the org's default Provider.

To deploy each stage to its own AWS account, link one Provider to the service for non-production stages and another to the `prod` instance ([Different accounts per stage](../providers.md#deploy-each-stage-to-its-own-account)). Make sure one of the three is set: the build has no other AWS credentials.

## Related

- [Preview deployments](./preview-deployments.md): deploy each pull request to its own stage.
- [Run tests in Serverless CI/CD](./running-tests.md): the test step that runs before each deploy.
- [Notifications](./notifications.md): get notified when a branch deployment starts, succeeds or fails.
