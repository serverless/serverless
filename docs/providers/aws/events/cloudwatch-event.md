<!--
title: Serverless Framework - AWS Lambda Events - CloudWatch Event
menuText: CloudWatch Event
menuOrder: 8
description:  Setting up AWS CloudWatch Events with AWS Lambda via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/cloudwatch-event)
<!-- DOCS-SITE-LINK:END -->

# CloudWatch Event

## Simple event definition

This will enable your Lambda function to be called by an EC2 event rule.
Please check the page of [Event Types for CloudWatch Events](http://docs.aws.amazon.com/AmazonCloudWatch/latest/events/EventTypes.html).

```yml
functions:
  myCloudWatch:
    handler: myCloudWatch.handler
    events:
      - cloudwatchEvent:
          event:
            source:
              - "aws.ec2"
            detail-type:
              - "EC2 Instance State-change Notification"
            detail:
              state:
                - pending
```

## Enabling / Disabling

**Note:** `cloudwatchEvent` events are enabled by default.

This will create and attach a disabled `cloudwatchEvent` event for the `myCloudWatch` function.

```yml
functions:
  myCloudWatch:
    handler: myCloudWatch.handler
    events:
      - cloudwatchEvent:
          event:
            source:
              - "aws.ec2"
            detail-type:
              - "EC2 Instance State-change Notification"
            detail:
              state:
                - pending
          enabled: false
```

## Specify Name and Description

Name and Description can be specified with the help of the `name` and `description` properties.

```yml
functions:
  myCloudWatch:
    handler: myCloudWatch.handler
    events:
      - cloudwatchEvent:
          name: "myCloudWatchEvent"
          description: "My CloudWatch Event Description"
          event:
            source:
              - "aws.ec2"
            detail-type:
              - "EC2 Instance State-change Notification"
            detail:
              state:
                - pending
```

## Specify Input or Inputpath

You can specify input values ​​to the Lambda function.

```yml
functions:
  myCloudWatch:
    handler: myCloudWatch.handler
    events:
      - cloudwatchEvent:
          event:
            source:
              - "aws.ec2"
            detail-type:
              - "EC2 Instance State-change Notification"
            detail:
              state:
                - pending
          input:
            key1: value1
            key2: value2
            stageParams:
              stage: dev
      - cloudwatchEvent:
          event:
            source:
              - "aws.ec2"
            detail-type:
              - "EC2 Instance State-change Notification"
            detail:
              state:
                - pending
          inputPath: '$.stageVariables'
```
