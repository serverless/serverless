<!--
title: Serverless Framework - Spotinst Guide - Serverless.yml Reference 
menuText: Serverless.yml
menuOrder: 5
description: Serverless.yml reference
layout: Doc
-->
# Serverless.yml Reference

This is an outline of a `serverless.yml` file with descriptions of the properties for reference

```yml
# serverless.yml

# The service can be whatever you choose. You can have multiple functions 
# under one service

service: your-service

# The provider is Spotinst and the Environment ID can be found on the 
# Spotinst Console under Functions

provider:
  name: spotinst
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
    runtime: nodejs4.8
    handler: handler.main
    memory: 128
    timeout: 30
#    access: public
#    cron:
#      active: false
#      value: '*/1 * * * *'
#    environmentVariables: {
#      Key: "Value",
#    }


plugins:
  - serverless-spotinst-functions
```
