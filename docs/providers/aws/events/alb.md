<!--
title: Serverless Framework - AWS Lambda Events - ALB
menuText: Application Load Balancer
menuOrder: 8
description: Setting up AWS Application Load Balancer events with AWS Lambda via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/alb)
<!-- DOCS-SITE-LINK:END -->

# Application Load Balancer

[Application Load Balancers](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html) can be used to re-route requests when certain traffic patterns are met. While traffic can be routed to services such as EC2 it [can also be routed to Lambda functions](https://aws.amazon.com/de/blogs/networking-and-content-delivery/lambda-functions-as-targets-for-application-load-balancers/) which can in turn be used process incoming requests.

The Serverless Framework makes it possible to setup the connection between Application Load Balancers and Lamdba functions with the help of the `alb` event.

## Event definition

```yml
functions:
  albEventConsumer:
    handler: handler.hello
    events:
      - alb:
          listenerArn: arn:aws:elasticloadbalancing:us-east-1:12345:listener/app/my-load-balancer/50dc6c495c0c9188/
          priority: 1
          conditions:
            host: example.com
            path: /hello
```
