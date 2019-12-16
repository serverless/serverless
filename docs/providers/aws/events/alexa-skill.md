<!--
title: Serverless Framework - AWS Lambda Events - Alexa Skill
menuText: Alexa Skill
menuOrder: 9
description:  Setting up AWS Alexa Skill Events with AWS Lambda via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/alexa-skill)

<!-- DOCS-SITE-LINK:END -->

# Alexa Skill

## Event definition

This definition will enable your Lambda function to be called by an Alexa Skill kit.

`amzn1.ask.skill.xx-xx-xx-xx-xx` is an example skill ID for the Alexa Skills kit. You will receive a skill ID once you register and create a skill in the [Amazon Developer Console](https://developer.amazon.com/).
After deploying, add your deployed Lambda function ARN associated with this event to the Service Endpoint under Configuration on your Amazon Developer Console.

```yml
functions:
  mySkill:
    handler: mySkill.handler
    events:
      - alexaSkill: amzn1.ask.skill.xx-xx-xx-xx-xx
```

You can find detailed guides on how to create an Alexa Skill with Serverless using Node.js [here](https://github.com/serverless/examples/tree/master/aws-node-alexa-skill) as well as in combination with Python [here](https://github.com/serverless/examples/tree/master/aws-python-alexa-skill).

## Enabling / Disabling

**Note:** `alexaSkill` events are enabled by default.

This will create and attach a disabled alexaSkill event for the `mySkill` function. If `enabled` is set to `true`, the attached alexaSkill will execute the function.

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

The previous syntax of this event didn't require a skill ID as parameter, but according to [Amazon's documentation](https://developer.amazon.com/docs/custom-skills/host-a-custom-skill-as-an-aws-lambda-function.html#configuring-the-alexa-skills-kit-trigger) you should restrict your lambda function to be executed only by your skill.

Omitting the skill id will make your Lambda function publicly available, which will allow any other skill developer to invoke it.

(This is important, as [opposed to custom HTTPS endpoints](https://developer.amazon.com/docs/custom-skills/handle-requests-sent-by-alexa.html#request-verify), there's no way to validate the request was sent by your skill.)
