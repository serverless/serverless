<!--
title: Serverless Framework - Azure Guide - Serverless.yml Reference
menuText: Serverless.yml
menuOrder: 16
description: A list of all available properties on serverless.yml for Azure
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/azure/guide/serverless.yml)

<!-- DOCS-SITE-LINK:END -->

# Serverless.yml Reference

Here is a list of all available properties in `serverless.yml` when the provider is set to `azure`.

```yml
# serverless.yml
service: azure-nodejs

frameworkVersion: '>=1.0.0 <2.0.0'

provider:
  name: azure
  region: West US 2
  runtime: nodejs12.x
  prefix: sample # prefix of generated resource name
  subscriptionId: A356AC8C-E310-44F4-BF85-C7F29044AF99
  stage: ${opt:stage, 'dev'} # Set the default stage used. Default is dev
  type: premium # optional, values include 'Developer', 'Standard', 'Premium', 'Basic', 'Consumption'

  environment: # these will be created as application settings
    VARIABLE_FOO: 'foo'

  # you can define apim configuration here
  apim:
    apis:
      - name: v1
        subscriptionRequired: false # if true must provide an api key
        displayName: v1
        description: V1 sample app APIs
        protocols:
          - https
        path: v1
        tags:
          - tag1
          - tag2
        authorization: none # not currently used
    cors:
      allowCredentials: false
      allowedOrigins:
        - '*'
      allowedMethods:
        - GET
        - POST
        - PUT
        - DELETE
        - PATCH
      allowedHeaders:
        - '*'
      exposeHeaders:
        - '*'

plugins:
  - serverless-azure-functions

# you can add packaging information here
package:
  include:
    - include-me.js
    - include-me-dir/**
  exclude:
    - exclude-me.js
    - exclude-me-dir/**
    - local.settings.json
    - .vscode/**

functions:
  hello:
    handler: src/handlers/hello.sayHello
    events:
      - http: true
        x-azure-settings:
          methods:
            - GET
          authLevel: anonymous # can also be `function` or `admin`
  # The following are a few examples of other events you can configure:
  storageBlob:
    handler: src/handlers/storageBlob.printMessage
    events:
      - blob:
        x-azure-settings:
          name: blob # Specifies which name is available on `context`
          path: blob-sample/{blobName}
          connection: AzureWebJobsStorage # App Setting/environment variable which contains Storage Account Connection String
  storageQueue:
    handler: src/handlers/storageQueue.printMessage
    events:
      - queue: queue-sample
        x-azure-settings:
          name: message # Specifies which naem is available on `context`
          connection: AzureWebJobsStorage
  timer:
    handler: src/handlers/timer.printMessage
    events:
      - timer:
        x-azure-settings:
          schedule: '*/10 * * * * *'
  eventhub:
    handler: src/handlers/eventHub.printMessage
    events:
      - eventHub:
        x-azure-settings:
          name: eventHubMessages # Specifies which name it's available on `context`
          eventHubName: sample-hub # Specifies the Name of the Event Hub
          consumerGroup: $Default # Specifies the consumerGroup to listen with
          connection: EVENT_HUBS_CONNECTION # App Setting/environment variable which contains Event Hubs Namespace Connection String
  serviceBusQueue:
    handler: src/handlers/serviceBusQueue.printMessage
    events:
      - serviceBus:
        x-azure-settings:
          name: message # Specifies which name is available on `context`
          queueName: sample-queue # Name of the service bus queue to consume
          connection: SERVICE_BUS_CONNECTION # App Setting/environment variable variable which contains Service Bus Namespace Connection String
  serviceBusTopic:
    handler: src/handlers/serviceBusTopic.printMessage
    events:
      - serviceBus:
        x-azure-settings:
          name: message # Specifies which name it's available on `context`
          topicName: sample-topic # Name of the service bus topic to consume
          subscriptionName: sample-subscription # Name of the topic subscription to retrieve from
          connection: SERVICE_BUS_CONNECTION # App Setting/environment variable variable which contains Service Bus Namespace Connection String
```
