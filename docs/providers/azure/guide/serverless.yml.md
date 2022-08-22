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

frameworkVersion: '3'

provider:
  name: azure
  region: West US 2
  runtime: nodejs14.x
  prefix: sample # prefix of generated resource name
  subscriptionId: 00000000-0000-0000-0000-000000000000
  stage: dev # Default stage to be used
  type: premium # optional, values include 'Developer', 'Standard', 'Premium', 'Basic', 'Consumption'
  armTemplate:
    file: myTemplate.json
    parameters:
      paramName:
        type: string
        defaultValue: value

  environment: # these will be created as application settings
    VARIABLE_FOO: 'foo'

  # Start of your API Management configuration
  apim:
    # API specifications
    apis:
      - name: categories-api
        subscriptionRequired: false
        # Display name
        displayName: Categories API
        # Description of API
        description: The Categories REST API
        # HTTP protocols allowed
        protocols:
          - https
        # Base path of API calls
        path: categories
        # Tags for ARM resource
        tags:
          - tag1
          - tag2
        # No authorization
        authorization: none
    backends:
      - name: categories-backend
        url: api/categories
    # CORS Settings for APIM
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

    # JWT validation APIM policy
    jwtValidate:
      headerName: authorization
      scheme: bearer
      failedStatusCode: 401
      failedErrorMessage: 'Authorization token is missing or invalid'
      openId:
        metadataUrl: 'https://path/to/openid/metadata/config'
      audiences:
        - 'audience1'
        - 'audience2'
      issuers:
        - 'https://path/to/openid/issuer'

    # Header validation APIM policy
    checkHeaders:
      - headerName: x-example-header-1
        failedStatusCode: 400
        failedErrorMessage: Not Authorized
        values: # List of allowed values, otherwise returns error code/message
          - value1
          - value2
      - headerName: x-example-header-2
        failedStatusCode: 403
        failedErrorMessage: Forbidden
        values: # List of allowed values, otherwise returns error code/message
          - value1
          - value2

    # IP Validation APIM policies
    ipFilters:
      - action: allow
        addresses: # List of allowed IP addresses
          - 1.1.1.1
          - 2.2.2.2
        addressRange: # Also optionally support range of IP addresses
          from: 1.1.1.1
          to: 2.2.2.2
      - action: forbid
        addresses: # List of forbidden IP addresses
          - 3.3.3.3
          - 4.4.4.4
        addressRange: # Also optionally support range of IP addresses
          from: 3.3.3.3
          to: 4.4.4.4

plugins:
  - serverless-azure-functions

# you can add packaging information here
package:
  patterns:
    - '!exclude-me.js'
    - '!exclude-me-dir/**'
    - '!local.settings.json'
    - '!.vscode/**'
    - include-me.js
    - include-me-dir/**

functions:
  hello:
    handler: src/handlers/hello.sayHello
    # API Management configuration for `hello` handler
    apim:
      # The API to attach this operation
      api: products-api
      # The Backend use for the operation
      backend: products-backend
      operations:
        # GET operation for `getProducts` handler
        - method: get
          # URL path for accessing handler
          urlTemplate: /
          # Display name inside Azure Portal
          displayName: GetProducts
    events:
      - http: true
        methods:
            - GET
          authLevel: anonymous # can also be `function` or `admin`
  # The following are a few examples of other events you can configure:
  storageBlob:
    handler: src/handlers/storageBlob.printMessage
    events:
      - blob:
        name: blob # Specifies which name is available on `context`
          path: blob-sample/{blobName}
          connection: AzureWebJobsStorage # App Setting/environment variable which contains Storage Account Connection String
  storageQueue:
    handler: src/handlers/storageQueue.printMessage
    events:
      - queue: queue-sample
        name: message # Specifies which naem is available on `context`
          connection: AzureWebJobsStorage
  timer:
    handler: src/handlers/timer.printMessage
    events:
      - timer:
        schedule: '*/10 * * * * *'
  eventhub:
    handler: src/handlers/eventHub.printMessage
    events:
      - eventHub:
        name: eventHubMessages # Specifies which name it's available on `context`
          eventHubName: sample-hub # Specifies the Name of the Event Hub
          consumerGroup: $Default # Specifies the consumerGroup to listen with
          connection: EVENT_HUBS_CONNECTION # App Setting/environment variable which contains Event Hubs Namespace Connection String
  serviceBusQueue:
    handler: src/handlers/serviceBusQueue.printMessage
    events:
      - serviceBus:
        name: message # Specifies which name is available on `context`
          queueName: sample-queue # Name of the service bus queue to consume
          connection: SERVICE_BUS_CONNECTION # App Setting/environment variable variable which contains Service Bus Namespace Connection String
  serviceBusTopic:
    handler: src/handlers/serviceBusTopic.printMessage
    events:
      - serviceBus:
        name: message # Specifies which name it's available on `context`
          topicName: sample-topic # Name of the service bus topic to consume
          subscriptionName: sample-subscription # Name of the topic subscription to retrieve from
          connection: SERVICE_BUS_CONNECTION # App Setting/environment variable variable which contains Service Bus Namespace Connection String
```
