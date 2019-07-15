<!--
title: Serverless Framework Commands - Spotinst Functions - Deploy Function
menuText: deploy function
menuOrder: 4
description: Deploy your Spotinst Functions quickly without cloudformation
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/spotinst/cli-reference/deploy-function)

<!-- DOCS-SITE-LINK:END -->

# Spotinst Functions - Deploy Function

The `sls deploy` function command deploys an individual function. This command simply compiles a deployment package with a single function handler. This is a much faster way of deploying changes in code.

## Note: Please update your Environment ID before deploying a function

1.  [Create an Environment](https://console.spotinst.com/functions)
2.  Update your `serverless.yml` file with the Environment ID

```yml
service: myService

provider:
  name: spotinst
  spotinst:
    environment: env-8f451a5f # NOTE: Remember to add the environment ID

functions:
  hello:
    runtime: nodejs4.8
    handler: handler.main
    memory: 128
    timeout: 30
    access: private
#    cron:  # Setup scheduled trigger with cron expression
#    	active: true
#    	value: '* * * * *'
#    environmentVariables: {
#      Key: "Value",
#    }

# extend the framework using plugins listed here:
# https://github.com/serverless/plugins
plugins:
  - serverless-spotinst-functions
```

## Deploy

```bash
serverless deploy function -f functionName
```

**Note:** Because this command is only deploying the function code, function
properties such as environment variables and events will **not** be deployed.

## Options

- `--function` or `-f` The name of the function which should be deployed

_more options to come soon_
