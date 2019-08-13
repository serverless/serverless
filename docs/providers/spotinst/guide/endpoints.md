<!--
title: Serverless Framework - Spotinst Functions Guide - Endpoint Setup
menuText: Endpoint Set Up
menuOrder: 6
description: How to set up an Endpoint
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/spotinst/guide/credentials)

<!-- DOCS-SITE-LINK:END -->

# Spotinst Functions - Endpoints

You are able to set your custom endpoint path in the serverless.yml file if you do not want to use the console or API. You will have to set up your environment Alias in the console but here you can set the path and method for your individual functions to be mapped to.

Here is a sample function from a yml file. As you can see at the bottom of the file we have listed an endpoint with a path and method. Both of these will need to be set in order to be deployed properly

```yml
hello:
  runtime: nodejs8.3
  handler: handler.main
  memory: 128
  timeout: 30
  access: public
  endpoint:
    path: /home
    method: get
```

For more information on how to set up endpoint alias and patterns check out our documentation [here](https://help.spotinst.com/hc/en-us/articles/115005893709)
