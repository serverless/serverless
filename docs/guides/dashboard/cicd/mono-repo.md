<!--
title: Serverless Dashboard - CI/CD Mono Repos
menuText: Mono Repos
menuOrder: 7
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://serverless.com/framework/docs/guides/cicd/mono-repo/)

<!-- DOCS-SITE-LINK:END -->

# Mono-repo support using Trigger Directories

When first getting started with a Serverless Framework project it is common to have a single `serverless.yml` file in a single Github repo. As the project grows it is common to split up the single mono-service into micro-services in individual `serverless.yml` files by placing them into different directories in the same repo. In some cases, another directory may exist (e.g. `/shared`) which may contain shared libraries used by those services.

As an example, you may end up with a directory structure like this:

- `/service1`
- `/service2`
- `/shared`

In this case, there is a `/service1/serverless.yml` and a `/service2/serverless.yml`. The services in those two directories may have a dependency on code defined in the `/shared` directory. We want to avoid redeploying ALL services every time any of the files change. Instead, we want to run tests and redeploy when the relevant changes are made, in particular:

- If there is a change in `/service1` only deploy `/service1/serverless.yml`.
- If there is a change in `/service2` only deploy `/service2/serverless.yml`.
- If there is a change in `/shared` deploy both `/service1/serverless.yml` and `/service2/serverless.yml`.

In your Serverless CI/CD settings there is a section called “Trigger Directories”. This enables you to limit the changes in a git commit which trigger a deployment by identifying the directories containing the relevant changes. A deployment will occur only if changes in the specified directories are identified. If the changes are in a different directory, the service will not be deployed.

By default the option **Always trigger a deployment** is checked, which causes ALL changes in the repository to trigger a deployment, which means that all services will get redeployed. Instead we want to uncheck the option and only trigger deployments if changes are detected in the relevant directories.

Once unchecked, the base directory is added by default. This means that only changes in `/service1` will cause `/service1/serverless.yml` to be deployed, and `/service2` for `/service2/serverless.yml` respectively. Additionally we also want to deploy both services if changes in `/shared` are detected. As such, we’ll add `./shared` as a trigger directory to both services.

With this configuration the changes in `/service2` will not cause `/service1` to be redeployed, and vice-versa and changes to `/shared` will result in both services getting deployed.
