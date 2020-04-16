<!--
title: Knative - knative Guide - Workflow | Serverless Framework
menuText: Workflow
menuOrder: 12
description: A guide and cheatsheet containing CLI commands and workflow recommendations
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/knative/guide/workflow/)

<!-- DOCS-SITE-LINK:END -->

# Knative Workflow Tips

Quick recommendations and tips for various processes.

### Development Workflow

1. Write your functions
1. Use `serverless deploy` when you've made changes to `serverless.yml` and in CI/CD systems.
1. Use `serverless invoke -f myFunction` to test your functions on Knative.
1. Write tests to run locally.

### Using stages

- At the very least, use a `dev` and `prod` stage.
- In larger teams, each member should use a separate Knative installation and their own stage for development.

### Larger Projects

- Break your application / project into multiple Serverless services.
- Model your Serverless services around data models or workflows.
- Keep the functions in your Serverless services to a minimum.

## Cheat Sheet

A handy list of commands to use when developing with the Serverless Framework.

##### Create a service:

Creates a new service

```
serverless create -p [SERVICE NAME] -t knative-docker
```

##### Install a service

This is a convenience method to install a pre-made Serverless service locally by downloading the GitHub repo and unzipping it.

```
serverless install -u [GITHUB URL OF SERVICE]
```

##### Deploy all

Use this when you have made changes to your functions or events in `serverless.yml` or you simply want to deploy all changes within your service at the same time.

```
serverless deploy -s [STAGE NAME]
```

##### Invoke function

Invokes a [Knative Serving](https://knative.dev/docs/serving) service returns it's output.

```
serverless invoke -f [FUNCTION NAME] -s [STAGE NAME] -l
```

##### Info

See information about your deployed / undeployed functions by running the info command in your service directory.

```
serverless info
```
