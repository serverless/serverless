<!--
title: Serverless Dashboard - CI/CD Preview Deployments
menuText: Preview Deployments
menuOrder: 2
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://serverless.com/framework/docs/guides/cicd/preview-deployments/)

<!-- DOCS-SITE-LINK:END -->

# Preview Deployment

Preview deployments enable you to deploy on every pull request. As a part of the pull request review process, it is helpful to have an instance of your serverless application deployed. A pull request will trigger the deployment and all subsequent commits on that branch will also be deployed.

To enable preview deployments, check "Enable preview deploys" in the "preview deploys" section of the CI/CD Settings.

You must also select the "target pull request branch", a branch from your Github repository. Only pull requests to this branch will be deployed.

## Using branch name as stages

Each deployment must target a specific stage and use a specific deployment profile. By default, the stage value will be set to the name of the branch.

In the "preview deploys" section, under "advanced settings", you can change the "stage" option. The default is "use branch name as stage", but you can also select a specific stage to target as well. However, if you use any option other than "use branch name as stage", then two different pull requests will be deployed to the same stage.

The deployment profile associated with the "default" stage in your application will be used if you select "use branch name as stage". If you select a specific stage, then the deployment profile associated with that stage will be used.

As development teams, we often have multiple pull requests and branches open at once. If we deploy those branches to the same stage then the deployments will override each other.

To avoid this collision, you have the convenient option to "use branch name as stage", which ensures that each pull request will deploy to a unique stage. Since the stage is not preconfigured and may not yet exist at the time of deployment, the default deployment profile will be used. In this case, ensure that the default deployment profile is configured with an [AWS Access Role](/framework/docs/dashboard/access-roles/).

If you use the "use branch name as stage", you may also want to reference the branch name in your configuration using [Variables](/framework/docs/providers/aws/guide/variables/). Since the stage name matches the branch name, you can use the `${opt:stage, self:provider.stage, 'dev'}` variable in your `serverless.yml` to reference the stage name, which will match the branch name.

Branch names may also include characters such as `/` which are invalid characters for stage names. Invalid characters are replaced with `-` in Serverless CI/CD. For example, a branch `feature/ph-api` will be normalized as `feature-ph-api`.

## Automatically deleting preview deployments (recommended)

The recommended method for deleting preview service instances is to select "Destroy stage and resources when branch is deleted". If the changes in the PR are accepted then they will be merged and then the branch is deleted. If the changes are rejected the branch is also deleted. Whenever the branch is deleted, Serverless Framework Pro will automatically run `sls remove` on this service instance.

## Manually deleting preview deployments

Alternatively you can delete service via the CLI. To delete the service instance you must run `sls remove` from the CLI in the repository containing the `serverless.yml` file. The `org`, `app`, `stage`, and `region` must all match the service instance you intend to delete.
