<!--
title: Serverless Framework Guide - Google Cloud Functions Guide - Packaging
menuText: Packaging
menuOrder: 9
description: How the Serverless Framework packages your Google Cloud Functions functions and other available options
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/google/guide/packaging)
<!-- DOCS-SITE-LINK:END -->

# Google - Packaging

## Package CLI Command

Using the Serverless CLI tool, you can package your project without deploying it to the Google Cloud. This is best used with CI / CD workflows to ensure consistent deployable artifacts.

Running the following command will build and save all of the deployment artifacts in the service's .serverless directory:

```bash
serverless package
```

However, you can also use the --package option to add a destination path and Serverless will store your deployment artifacts there (./my-artifacts in the following case):

```bash
serverless package --package my-artifacts
```
