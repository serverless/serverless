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

Serverless allows you to specify different stages to deploy your project to. Changing the stage will change the environment your function is running on, which is helpful when you wish to keep production code partitioned from your development environment.

Your function's stage is set to 'dev' by default. You can update the stage when deploying the function, either from the command line using the serverless framework, or by modifying the serverless.yml in your project. When utilizing this feature, remember to include a config file that holds the environment IDs associated with your stages. An example config.json would look something like this:

```json
{
  "dev": "env-abcd1234",
  "prod": "env-defg5678"
}
```

## Through Serverless Framework

To change the stage through the serverless framework you simply need to enter the command

```bash
serverless deploy --stage #{Your Stage Name}
```

You will also need to update the environment parameter to point to the config.json:

```yaml
 spotinst:
  environment: ${file(./config.json):${opt:stage, self:provider.stage, 'dev'}}
```

Note that while I am using 'dev' as the default stage, you may change this parameter to a custom default stage.

## Through the .yml File

To change the stage in the serverless.yml file you need to add the following into the provider tag then deploy your function as usual

```bash
provider:
  name: spotinst
  stage: #{Your Stage Name}
  spotinst:
    environment: #{Your Environment ID}
```

Be sure to also modify your environment ID when you change the stage if you are not working with a config file.
