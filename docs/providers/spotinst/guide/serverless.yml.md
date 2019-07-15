<!--
title: Serverless Framework - Spotinst Guide - Serverless.yml Reference
menuText: Serverless.yml
menuOrder: 5
description: Serverless.yml reference
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://serverless.com/framework/docs/providers/spotinst/guide/serverless.yml/)

<!-- DOCS-SITE-LINK:END -->

# Serverless.yml Reference

This is an outline of a `serverless.yml` file with descriptions of the properties for reference

```yml
# Welcome to Serverless!
#
# This file is the main config file for your service.
# It's very minimal at this point and uses default values.
# You can always add more config options for more control.
# We've included some commented out config examples here.
# Just uncomment any of them to get that config option.
#
# For full config options, check the docs:
#    docs.serverless.com
#
# Happy Coding!

service: four

provider:
  name: spotinst
  #stage: <Stage Name>  #Optional setting. By default it is set to 'dev'
  spotinst:
    environment: #{Your Environment ID}

# Here is where you will list your functions for this service. Each Function is
# required to have a name, runtime, handler, memory and timeout. The runtime is
# the language that you want to run your function with, the handler tells which
# file and function to run, memory is the amount of memory needed to run your
# function, timeout is the time the function will take to run, if it goes over
# this time it will terminate itself. Access is default set to private so if you
# want to be able to run the function by HTTPS request this needs to be set to
# public. The environment variables can be set in here or on the Spotinst console.
# Once they are set you can access the variables in your handler file with
# process.env['{Your Key}']

functions:
  function-name:
    runtime: nodejs8.3
    handler: handler.main
    memory: 128
    timeout: 30
    access: private
#    activeVersions:
#        - version: $LATEST
#          percentage: 100.0
#    cors:
#        enabled: # false by default
#        origin:  # '*' by default
#        headers: # 'Content-Type,Authorization' by default
#        methods: # 'DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT' by default
#    cron:  # Setup scheduled trigger with cron expression
#      active: true
#      value: '* * * * *'
#    environmentVariables:
#      key: value

# extend the framework using plugins listed here:
# https://github.com/serverless/plugins
plugins:
  - serverless-spotinst-functions
```
