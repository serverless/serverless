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

## Current gotchas

We have one problem on this event.
If you replace the same logGroup name with another function statement in serverless.yml and run `sls deploy`, the deployment will fail with an error.
We will fix it in an upcoming release, please be careful of this note when using this event.

Here's step to reproduce.
First, write serverless.yml as follow and run `sls deply`.

```yml
functions:
  hello1:
    handler: handler.hello1
    events:
      - cloudwatchLog: '/aws/lambda/hello1'
  hello2:
    handler: handler.hello2
    events:
      - cloudwatchLog: '/aws/lambda/hello2'
```

Next, edit serverless.yml(replace logGroup name) as follow and run `sls deploy` again, then the deployment would fail.

```yml
functions:
  hello1:
    handler: handler.hello1
    events:
      - cloudwatchLog: '/aws/lambda/hello2'
  hello2:
    handler: handler.hello2
    events:
      - cloudwatchLog: '/aws/lambda/hello1'
```

## Simple event definition

This will enable your Lambda function to be called by an Log Stream.

```yml
functions:
  myCloudWatchLog:
    handler: myCloudWatchLog.handler
    events:
      - cloudwatchLog: '/aws/lambda/hello'
```

## Specifying a filter

Here's an example how you can specify a filter rule.

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
