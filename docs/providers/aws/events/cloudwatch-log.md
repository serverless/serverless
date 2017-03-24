<!--
title: Serverless Framework - AWS Lambda Events - CloudWatch Log
menuText: CloudWatch Log
menuOrder: 9
description:  Setting up AWS CloudWatch Logs with AWS Lambda via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/cloudwatch-log)
<!-- DOCS-SITE-LINK:END -->

# CloudWatch Log

## Simple event definition

This will enable your Lambda function to be called by an Log Stream.

```yml
functions:
  myCloudWatchLog:
    handler: myCloudWatchLog.handler
    events:
      - cloudwatchLog:
          logGroup: '/aws/lambda/hello'
```

## Specify filter

You can specify a filter rule.
For more information about the filter pattern syntax, see [Filter and Pattern Syntax](http://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/FilterAndPatternSyntax.html)

```yml
functions:
  myCloudWatchLog:
    handler: myCloudWatchLog.handler
    events:
      - cloudwatchLog:
          logGroup: '/aws/lambda/hello'
          filter: '{$.userIdentity.type = Root}'
```
