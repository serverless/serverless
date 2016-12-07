<!--
title: Serverless Framework - AWS Lambda Events - Alexa
menuText: Alexa
menuOrder: 6
description:  Setting up AWS Alexa Events with AWS Lambda via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/alexa)
<!-- DOCS-SITE-LINK:END -->

# Alexa

## Event definition

This will enable your Lambda function to be called by an Alexa skill kit.

```yaml
functions:
  mySkill:
    handler: mySkill.handler
    events:
      - alexa: true
```
