<!--
title: Serverless Framework - AWS Lambda Guide - Events
menuText: Events
menuOrder: 6
description: Configuring AWS Lambda function events in the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/events)
<!-- DOCS-SITE-LINK:END -->

# Events

If you are using AWS as a provider for your Service, all *Events* are anything in AWS that can trigger an AWS Lambda function, like an S3 bucket upload, an SNS topic, and HTTP endpoints created via API Gateway.

Upon deployment, the Serverless Framework will deploy any infrastructure required for an event (e.g., an API Gateway endpoint) and configure your Function to listen to it.

## Configuration

Events belong to each Function and can be found in the `events` property, which is an array:

```yml
functions:
  createUser: # A function
    handler: handler.createUser
    events: # All events are here
      - http:
          path: users/create
          method: post
```

Events are objects, which can contain event-specific information.

You can set multiple Events per Function, as long as that is supported by AWS.

```yml
functions:
  createUser: # A function
    handler: handler.users
    events: # All events are here
      - http:
          path: users/create
          method: post
      - http:
          path: users/update
          method: put
      - http:
          path: users/delete
          method: delete
```

## Types

The Serverless Framework supports all of the AWS Lambda events and more.  Instead of listing them here, we've put them in a separate section, since they have a lot of configurations and functionality.  [Check out the events section for more information.](../events)

## Deploying

To deploy or update your Functions, Events and Infrastructure, run `serverless deploy`.
