<!--
title: Serverless Dashboard - CI/CD Private Package Manager (NPM)
menuText: Private Packages
menuOrder: 5
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://serverless.com/framework/docs/guides/cicd/private-packages/)

<!-- DOCS-SITE-LINK:END -->

# Using private package managers

If your Serverless Framework project has a dependency on a private package manager, like NPM, you will need the CI/CD
service to authenticate with the private package manager service.

For example, if you are using NPM follow the "[Using private packages in a CI/CD workflow](https://docs.npmjs.com/using-private-packages-in-a-ci-cd-workflow)"
guide to create an authentication token. Following this process you will obtain a token to use as an environment
variable. Other private package managers for NPM or other runtimes (e.g. Python) also typically provide a method for
authentication using environment variables in a CI/CD environment.

To set an environment variable use the [Parameters](/framework/docs/dashboard/parameters/) feature and create a variable called
`NPM_TOKEN` containing your private registry token. Parameters defined in the deployment profiles associated with the
application and stage are loaded in the Serverless CI/CD service as environment variables.
