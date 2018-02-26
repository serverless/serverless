<!--
title: Serverless Framework - AWS Lambda Events - Alexa Skill
menuText: Alexa Skill
menuOrder: 6
description:  Setting up AWS Alexa Skill Events with AWS Lambda via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/alexa-skill)
<!-- DOCS-SITE-LINK:END -->

# Alexa Skill

## Event definition

This will enable your Lambda function to be called by an Alexa Skill kit.
`amzn1.ask.skill.xx-xx-xx-xx-xx` is a skill ID for Alexa Skills kit. You receive a skill ID once you register and create a skill in [Amazon Developer Console](https://developer.amazon.com/).
After deploying, add your deployed Lambda function ARN to which this event is attached to the Service Endpoint under Configuration on Amazon Developer Console.

```yml
functions:
  mySkill:
    handler: mySkill.handler
    events:
      - alexaSkill: amzn1.ask.skill.xx-xx-xx-xx-xx
```

You can find detailed guides on how to create an Alexa Skill with Serverless using NodeJS [here](https://github.com/serverless/examples/tree/master/aws-node-alexa-skill) as well as in combination with Python [here](https://github.com/serverless/examples/tree/master/aws-python-alexa-skill).

## Enabling / Disabling

**Note:** `alexaSkill` events are enabled by default.

This will create and attach a alexaSkill event for the `mySkill` function which is disabled. If enabled it will call
the `mySkill` function by an Alexa Skill.

```yaml
functions:
  mySkill:
    handler: mySkill.handler
    events:
      - alexaSkill:
          appId: amzn1.ask.skill.xx-xx-xx-xx
          enabled: false
```

## Backwards compatibility

Previous syntax of this event didn't require a skill ID as parameter, but according to [Amazon's documentation](https://developer.amazon.com/docs/custom-skills/host-a-custom-skill-as-an-aws-lambda-function.html#configuring-the-alexa-skills-kit-trigger) you should restrict your lambda function to be executed only by your skill.

Omitting the skill id will make your Lambda function available for the public, allowing any other skill developer to invoke it.

(This is important, as [opposing to custom HTTPS endpoints](https://developer.amazon.com/docs/custom-skills/handle-requests-sent-by-alexa.html#request-verify), there's no way to validate the request was sent by your skill.)
