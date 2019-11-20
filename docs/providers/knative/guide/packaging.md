<!--
title: Knative - Knative Guide - Packaging | Serverless Framework
menuText: Packaging
menuOrder: 10
description: How the Serverless Framework packages your Knative Serving service and other available options
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/knative/guide/packaging/)

<!-- DOCS-SITE-LINK:END -->

# Knative - Packaging

## Package CLI Command

Using the Serverless CLI tool, you can package your project without deploying it to Knative. This is best used with CI / CD workflows to ensure consistent deployable artifacts.

Running the following command will build and push the container image which is specified with a `Dockerfile` the corresponding function `handler` points to:

```bash
serverless package
```
