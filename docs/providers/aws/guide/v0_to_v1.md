<!--
title: Serverless Framework - AWS Lambda Guide - Comparison Of Serverless Framework V.1 & V.0
menuText: V.0 & V.1
menuOrder: 15
description: A comparison of Serverless Framework V.1 and Serverless Framework V.0
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/v0_to_v1)
<!-- DOCS-SITE-LINK:END -->

# Comparison Of Serverless Framework V.1 & V.0

After the 0.5.6 release of Serverless we sat down with many contributors and users of the Framework to discuss the next steps to improve Serverless.

Those discussions lead to our decision to completely rewrite Serverless. The configuration is in no way backwards compatible and can basically be seen as a completely new tool.

We've decided to make this step so in the future we have a stronger base to work from and make sure we don't have to do major breaking changes like this anymore.

Let's dig into the main differences between 0.x and 1.x to give you an idea how to start migrating your services. In general we've seen teams move from 0.x to 1.x in a relatively short amount of time, if you have any questions regarding the move please let us know in [our Forum](http://forum.serverless.com) or create [Issues in Github](https://github.com/serverless/serverless/issues).

## Main differences between 0.x and 1.x

As 1.x is a complete reimplementation without backwards compatibility pretty much everything is different. The following features are the most important ones to give you an understanding of where Serverless is moving.

### Central configuration file

In the past configuration was spread out over several configuration files. It was hard for users to have a good overview over all the different configuration values set for different functions. This was now moved into a central serverless.yml file that stores all configuration for one service. This also means there is no specific folder setup that you have to follow any more. By default Serverless simply zips up the folder your serverless.yml is in and deploys it to any functions defined in that config file (although you can [change the packaging behavior](https://serverless.com/framework/docs/providers/aws/guide/packaging/)).

### Services are the main unit of deployment

In the past Serverless didn't create a strong connection between functions that were deployed together. It was more for convenience sake that separate functions were grouped together. With 1.x functions now belong to a service. You can implement and deploy different services and while it's still possible to mix functions that are not related into the same service it's discouraged. Serverless wants you to build a micro-service architecture with functions being a part of that, but not the only part. You can read more about this in a past [blog post](https://serverless.com/blog/beginning-serverless-framework-v1/)

### Built on CloudFormation

With the move to a more service oriented style came the decision to move all configuration into CloudFormation. Every resource we create gets created through a central CloudFormation template. Each service gets its own CloudFormation stack, we even deploy new CF stacks if you create a service in a different stage. A very important feature that came with this move to CF was that you can now easily create any other kind of resource in AWS and connect it with your functions. You can read more about resources in [our guide](https://serverless.com/framework/docs/providers/aws/guide/resources/)

### New plugin system

While our old plugin system allowed for a powerful setup we felt we could push it a lot further and went back to the drawing board. We came up with a completely new way to build plugins for Serverless through hooks and lifecycle events. This is a breaking change for any existing plugin. You can read more about our Plugin system in our [extending serverless docs](https://serverless.com/framework/docs/providers/aws/guide/plugins/).

### Endpoints are now events

In 0.x APIG was treated as a separate resource and you could deploy endpoints separately. In 1.x APIG is just another event source that can be configured to trigger Lambda functions. We create one APIG per CloudFormation stack, so if you deploy to different stages we're creating separate API Gateways. You can read all about our [APIG integration in our event docs](https://serverless.com/framework/docs/providers/aws/events/apigateway/).

## How to upgrade from 0.x to 1.x

As Serverless 1.x is a complete reimplementation and does not implement all the features that were in 0.x (but has a lot more features in general) there is no direct update path. Basically the best way for users to move from 0.x to 1.x is to go through [our guide](https://serverless.com/framework/docs/providers/aws/guide/) and the [AWS provider documentation](https://serverless.com/framework/docs/providers/aws/) that will teach you all the details of Serverless 1.x. This should make it pretty easy to understand how to set up a service for 1.x and move your code over. We've worked with different teams during the Beta phase of Serverless 1.x and they were able to move their services into the new release pretty quickly.
