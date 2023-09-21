<!--
title: Serverless Dashboard - CI/CD Branch Deployments
menuText: Branch Deployments
menuOrder: 1
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://serverless.com/framework/docs/guides/cicd/branch-deployments/)

<!-- DOCS-SITE-LINK:END -->

# Branch Deployments

Branch deployments enable you to automatically deploy a service to a stage from a branch in your Github repository. Every commit to this branch is automatically deployed.

## Adding a branch deployment

To add a new branch deployment, in the "branch deploys" section of the CI/CD settings, select the Github branch containing the `serverless.yml` from the "source branch" column for each "target stage". Commits from the "source branch" will automatically be deployed to the "target stage".

## Add a stage to a branch deployment

If you are a first time user, the stage list may be empty. You must first [create a new deployment profile](/framework/docs/dashboard/profiles#creating-a-new-deployment-profile), and [add the deployment profile to a stage in your application](/framework/docs/dashboard/profiles#add-a-deployment-profile-to-your-application-and-stage). As mentioned in the requirements section, the deployment profile must also have an [AWS Access Role](/framework/docs/dashboard/access-roles/).
