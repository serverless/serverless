<!--
title: Serverless Dashboard - CI/CD Preview Deployments
menuText: Preview Deployments
menuOrder: 2
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://serverless.com/framework/docs/dashboard/cicd/preview-deployments/)

<!-- DOCS-SITE-LINK:END -->

# Preview Deployment

Preview deployments enable you to deploy on every pull request. As a part of the pull request review process, it is helpful to have an instance of your serverless application deployed. A pull request will trigger the deployment and all subsequent commits on that branch will also be deployed.

## Enabling preview deployments

To enable preview deployments, select "Deploy previews for all branches" or "Deploy previews for individually selected branches". The latter will only deploy a branch from a PR targeting the selected branches.

Each deployment must target a specific stage. You can select a pre-configured stage, or you can select “use branch name as stage”.

Using "use branch name as stage" will cause the deployment to deploy to a stage with the same name as the branch name. The deployment profile associated with the "default" stage in your application will be used.

## Using branch name as stages

As development teams, we often have multiple pull requests and branches open at once. If we deploy those branches to the same stage then the deployments will override each other.

To avoid this collision, you have the convenient option to "use branch name as stage", which ensures that each pull request will deploy to a unique stage. Since the stage is not preconfigured and may not yet exist at the time of deployment, the default deployment profile will be used. In this case, ensure that the default deployment profile is configured with an [AWS Access Role](/framework/docs/dashboard/access-roles/).

If you use the "use branch name as stage", you may also want to reference the branch name in your configuration using [Variables](/framework/docs/providers/aws/guide/variables/). Since the stage name matches the branch name, you can use the `${self:provider.stage}` variable in your `serverless.yml` to reference the stage name, which will match the branch name.

You must update the `test` script in `package.json` to run your Python tests suite (e.g. `pytest`).

Branch names may also include charaters such as `/` which are invalid charachters for stage names. Invalid charcters are replaced with `-` in Serverless CI/CD. For example, a branch `feature/ph-api` will be normalized as `feature-ph-api`.

## Automatically deleting preview deployments (recommended)

The recommended method for deleting preview service instances is to select "Destroy stage and resources when branch is deleted". If the changes in the PR are accepted then they will be merged and then the branch is deleted. If the changes are rejected the branch is also deleted. Whenever the branch is deleted, Serverless Framework Pro will automatically run `sls remove` on this service instance.

## Manually deleting preview deployments

Alternativley you can delete service via the CLI. To delete the service instance you must run `sls remove` from the CLI in the repository containing the `serverless.yml` file. The `org`, `app`, `stage`, and `region` must all match the service instance you intend to delete.
