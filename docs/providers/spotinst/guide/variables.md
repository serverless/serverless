<!--
title: Serverless Framework - Spotinst Functions Guide - Variables
menuText: Variables
menuOrder: 6
description: Different external variables and how to use them
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/spotinst/guide/variables)

<!-- DOCS-SITE-LINK:END -->

# Spotinst Functions - Variables

There are a few ways to introduce external variables to your serverless functions in order to customize each function call based on your personal needs.

## Environment Variables

Environment variables allow you to pass static information into your function so you wont have to upload sensitive or protected information in your production code. It also allows you to easily change these variables from the outside so you do not have to upload your code multiple times with different variables.

To enter your environment variables you will need to go into the Spotinst console find the function you want to add environment variables to. Then under the Configuration tab you will find the Environment Variables heading. Here you can enter as many variables you need all with an associated key.

Also you are able to enter in environment variables in the serverless.yml file. As a parameter under any function you can add:

```yml
functions:
  test:
    handler: handler.main
    environmentVariables:
      key: value
```

To access your variables in your code you just need to put `process.env['{Your Key}']` as needed in the handler file.

## URL Argument Variables

URL parameters can be use when a POST request is made to the endpoint of your function.

### 1. Node JS

To access URL parameters in your NodeJS code you just need to put `event.query['{Your Parameter Name}']` as needed

### 2. Python

To access URL parameters in your Python code you just need to put `os.environ['{Your Parameter Name}']` as needed
