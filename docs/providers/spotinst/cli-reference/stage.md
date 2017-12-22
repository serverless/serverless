<!--
title: Serverless Framework - Spotinst Functions Guide - Stage Variables
menuText: Stage Variables
menuOrder: 7
description: How to use the Stage Variables feature
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/spotinst/guide/credentials)
<!-- DOCS-SITE-LINK:END -->

# Spotinst Functions - Stage Variables

You are able to set a stage variable in your function to distinguish between the multiple stages that your function maybe going through. The function is initially set to 'dev' for development but there are two ways you can change the stage if you so need. 

## Through Serverless Framwork
To change the stage through the serverless framework you simply need to enter the command

```bash
serverless deploy --stage #{Your Stage Name}
```

## Through the .yml File

To change the stage in the serverless.yml file you need to add the following into the provider tag then deploy your function as usual

```bash
provider:
  name: spotinst
  stage: #{Your Stage Name}
  spotinst:
    environment: #{Your Environment ID}
```

