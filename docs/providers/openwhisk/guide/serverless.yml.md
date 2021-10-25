<!--
title: Serverless Framework - Apache OpenWhisk Guide - Serverless.yml Reference
menuText: Serverless.yml
menuOrder: 15
description: A list of all available properties on serverless.yml for Apache OpenWhisk
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/openwhisk/guide/serverless.yml)

<!-- DOCS-SITE-LINK:END -->

# OpenWhisk - serverless.yml Reference

Here is a list of all available properties in `serverless.yml` when the provider is set to `openwhisk`.

```yml
# serverless.yml

service: myService

frameworkVersion: '3'

provider:
  name: openwhisk
  runtime: nodejs:default
  memory: 256 # Overwrite default memory size. Default is 512.
  timeout: 10 # The default is 60
  overwrite: true # Can we overwrite deployed functions? default is true
  namespace: 'custom' # use custom namespace, defaults to '_'
  ignore_certs: true # ignore ssl verification issues - used for local deploys

functions:
  usersCreate: # A Function
    handler: users.create # The file and module for this specific function.
    sequence: # Use sequences rather than handler to handle events. handler and sequence properties are mutually exclusive.
      - function_a
      - function_b
      - function_c
    memory: 256 # memory size for this specific function.
    timeout: 10 # Timeout for this specific function.  Overrides the default set above.
    runtime: nodejs:6
    overwrite: false # Can we overwrite deployed function?
    namespace: 'custom' # use custom namespace, defaults to '_'
    annotations:
      parameter_name: value
    parameters:
      parameter_name: value
    events: # The Events that trigger this Function
      # This creates an API Gateway HTTP endpoint which can be used to trigger this function.  Learn more in "events/apigateway"
      - http: METHOD /path/to/url
      - trigger: my_trigger # bind function to trigger event
      - trigger:
        name: my_trigger
        rule: rule_name

# The "Resources" your "Functions" use. This can be used to define custom Triggers and Rules which are bound to your Actions.
resources:
  triggers:
    my_trigger: # trigger with default parameter bound.
      parameters:
        hello: world
    alarm_trigger: # trigger connected to event feed
      parameters:
        hello: world
      feed: /whisk.system/alarms/alarm
      feed_parameters:
        cron: '*/8 * * * * *'
```
