<!--
title: Serverless Framework - AWS Lambda Events - Alexa Smart Home
menuText: Alexa Smart Home
menuOrder: 11
description:  Setting up AWS Alexa Smart Home Events with AWS Lambda via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/alexa-smart-home)
<!-- DOCS-SITE-LINK:END -->

# Alexa Smart Home

## Event definition

This will enable your Lambda function to be called by an Alexa Smart Home Skill.
`amzn1.ask.skill.xx-xx-xx-xx` is an application ID for Alexa Smart Home. You need to sign up [Amazon Developer  Console](https://developer.amazon.com/) and get your application ID.

```yml
functions:
  mySkill:
    handler: mySkill.handler
    events:
      - alexaSmartHome: amzn1.ask.skill.xx-xx-xx-xx
```

## Enabling / Disabling

**Note:** `alexaSmartHome` events are enabled by default.

This will create and attach a alexaSmartHome event for the `mySkill` function which is disabled. If enabled it will call
the `mySkill` function by an Alexa Smart Home Skill.

```yaml
functions:
  mySkill:
    handler: mySkill.handler
    events:
      - alexaSmartHome:
          appId: amzn1.ask.skill.xx-xx-xx-xx
          enabled: false
```
