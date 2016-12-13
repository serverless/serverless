<!--
title: Serverless Framework - AWS Lambda Events - IoT
menuText: IoT
menuOrder: 7
description:  Setting up AWS IoT Events with AWS Lambda via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/iot)
<!-- DOCS-SITE-LINK:END -->

# IoT

## Simple event definition

This will enable your Lambda function to be called by a rule of AWS IoT.

```yml
functions:
  myIoT:
    handler: myIoT.handler
    events:
      - iot:
          rule:
            sql: "SELECT * FROM 'some_topic'"
            enabled: true
```

## Enabling/Disabling functions

This will create and attach a iot event for the `myIoT` function which is disabled. If enabled you will set `true` on the `enabled` property.

```yml
functions:
  myIoT:
    handler: myIoT.handler
    events:
      - iot:
          rule:
            sql: "SELECT * FROM 'some_topic'"
            enabled: false
```

## Specify Name and Description

Name and Description can be specified for a iot event. These are not required properties.

```yml
functions:
  myIoT:
    handler: myIoT.handler
    events:
      - iot:
          name: "myIotEvent"
          rule:
            sql: "SELECT * FROM 'some_topic'"
            enabled: true
            description: "My IoT Event Description"
```

## Specify SQL Versions

[SQL Versions](http://docs.aws.amazon.com/iot/latest/developerguide/iot-rule-sql-version.html) can be specified for a iot event. These are not required properties.

```yml
functions:
  myIoT:
    handler: myIoT.handler
    events:
      - iot:
          rule:
            sql: "SELECT * FROM 'some_topic'"
            enabled: true
            sqlVersion: "beta"
```
