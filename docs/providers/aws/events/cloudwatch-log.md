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

## Current gotchas

There's currently one gotcha you might face if you use this event definition.

The deployment will fail with an error that a resource limit exceeded if you replace the `logGroup` name of one function with the `logGroup` name of another function in your `serverless.yml` file and run `serverless deploy` (see below for an in-depth example).

This is caused by the fact that CloudFormation tries to attach the new subscription filter before detaching the old one. CloudWatch Logs only support one subscription filter per log group as you can read in the documentation about [CloudWatch Logs Limits](http://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/cloudwatch_limits_cwl.html).

Please keep this gotcha in mind when using this event. We will fix it in an upcoming release.

### Example

Update your `serverless.yml` file as follows and run `serverless deploy`.

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

Next up, edit `serverless.yml` and swap out the `logGroup` names. After that run `serverless deploy` again (the deployment will fail).

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
