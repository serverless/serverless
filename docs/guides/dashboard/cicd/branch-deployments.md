<!--
title: Serverless Dashboard - CI/CD Branch Deployments
description: Learn how to set up and manage branch deployments in Serverless Framework for automated stage deployments.
short_title: Serverless Dashboard - Branch Deployments
keywords:
  [
    'Serverless Framework',
    'CI/CD',
    'Branch Deployments',
    'Automation',
    'GitHub',
    'Deployment',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://serverless.com/framework/docs/guides/cicd/branch-deployments/)

<!-- DOCS-SITE-LINK:END -->

# Branch Deployments

Branch deployments enable you to automatically deploy a service to a stage from a branch in your Github repository. Every commit to this branch is automatically deployed.

## Adding a branch deployment

To add a new branch deployment, in the "branch deploys" section of the CI/CD settings, select the Github branch containing the `serverless.yml` from the "source branch" column for each "target stage". Commits from the "source branch" will automatically be deployed to the "target stage".

## Add a stage to a branch deployment

You can assign a stage to each branch deployment, but ensure that a valid provider is set for this service.
