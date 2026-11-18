<!--
title: Alexa Skill Events
description: Invoke a Lambda function from an Alexa custom skill with the alexaSkill event, restricted to your skill ID, and handle Alexa requests.
short_title: Alexa Skill
keywords: ['Serverless Framework', 'Alexa Skills Kit trigger', 'Alexa custom skill Lambda', 'alexaSkill event']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/alexa-skill)

<!-- DOCS-SITE-LINK:END -->

# Alexa Skill Events

The `alexaSkill` event lets an Alexa custom skill invoke your Lambda function, the same as adding an Alexa Skills Kit trigger with skill ID verification in the Lambda console. The Framework doesn't create the skill: you create it in the [Alexa developer console](https://developer.amazon.com/en-US/alexa), give its skill ID to the event, and point the skill's endpoint at the deployed function.

The following `serverless.yml` deploys a function that only the skill `amzn1.ask.skill.12345678-1234-1234-1234-123456789012` can invoke:

```yaml
# serverless.yml
service: my-alexa-skill

provider:
  name: aws
  runtime: nodejs24.x
  region: us-east-1

functions:
  skill:
    handler: handler.handler
    events:
      - alexaSkill: amzn1.ask.skill.12345678-1234-1234-1234-123456789012
```

Replace the skill ID with your own; the developer console shows it on the skill's page. Deploy the function to a Region that Alexa allows for skill endpoints (see [Lambda Region for an Alexa skill](#lambda-region-for-an-alexa-skill)).

## Connect a deployed function to an Alexa skill

The skill calls the function only after its endpoint is set to the function's ARN:

1. Deploy the service with `serverless deploy`.
2. Run `serverless info` and note the deployed function name, by default `<service>-<stage>-<function>` (`my-alexa-skill-dev-skill` for the preceding example).
3. In the Alexa developer console, open the skill, go to **Custom > Endpoint**, select **AWS Lambda ARN** and enter the function ARN, for example `arn:aws:lambda:us-east-1:123456789012:function:my-alexa-skill-dev-skill`.
4. Save the endpoint and test the skill in the console's **Test** tab.

When the function uses `provisionedConcurrency`, [SnapStart](../guide/functions.md#snapstart) or [durable functions](../guide/functions.md#durable-functions), the Framework attaches the `alexaSkill` permission to the function's alias (`provisioned` or the name set in `provisionedConcurrency.alias`, `snapstart`, or `durable`), so enter the alias ARN instead, for example `arn:aws:lambda:us-east-1:123456789012:function:my-alexa-skill-dev-skill:provisioned`.

## `alexaSkill` event settings

The `alexaSkill` event takes either the skill ID as a string or an object with these keys:

| Key       | Type    | Default  | Description                                                                                                                            |
| --------- | ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `appId`   | String  | Required | The skill ID, such as `amzn1.ask.skill.12345678-1234-1234-1234-123456789012`. Letters, digits, `.`, `_` and `-`, up to 256 characters. |
| `enabled` | Boolean | `true`   | Whether the skill can invoke the function.                                                                                             |

The string form is the same as the object form with only `appId`. The Framework's configuration schema has no form without a skill ID.

## Connect several skills to one function

To let several skills invoke the same function, add one `alexaSkill` event per skill ID:

```yaml
functions:
  skill:
    handler: handler.handler
    events:
      - alexaSkill: amzn1.ask.skill.12345678-1234-1234-1234-123456789012
      - alexaSkill: amzn1.ask.skill.abcdefab-abcd-abcd-abcd-abcdefabcdef
```

Each event creates its own Lambda permission, numbered in the order the events appear.

## Disable an Alexa skill trigger

To stop a skill from invoking the function without removing the event, set the `alexaSkill` event's `enabled` to `false`:

```yaml
functions:
  skill:
    handler: handler.handler
    events:
      - alexaSkill:
          appId: amzn1.ask.skill.12345678-1234-1234-1234-123456789012
          enabled: false
```

With `enabled: false`, the Framework keeps the permission resource but sets its action to `lambda:DisableInvokeFunction`, which doesn't allow invocation. Set `enabled` back to `true`, or remove the key, and deploy again to restore it.

## AWS resources and permissions for `alexaSkill` events

For each `alexaSkill` event, the Framework adds one `AWS::Lambda::Permission` resource to the stack, with the logical ID `<FunctionName>LambdaPermissionAlexaSkill<N>` (for example `SkillLambdaPermissionAlexaSkill1`). The permission has:

- Principal `alexa-appkit.amazon.com`.
- Action `lambda:InvokeFunction` (`lambda:DisableInvokeFunction` when `enabled: false`).
- `EventSourceToken` set to the skill ID, which is the skill ID verification described in [Configuring the Alexa Skills Kit trigger](https://developer.amazon.com/en-US/docs/alexa/custom-skills/host-a-custom-skill-as-an-aws-lambda-function.html#configuring-the-alexa-skills-kit-trigger): requests from other skills don't invoke the function.

The function's execution role needs no extra permissions for this event. The Framework creates no Alexa resources; the skill, its interaction model and its endpoint stay in the Alexa developer console.

## Lambda Region for an Alexa skill

Alexa calls skill endpoints only in the AWS Regions listed under [Allowed AWS Lambda regions](https://developer.amazon.com/en-US/docs/alexa/custom-skills/host-a-custom-skill-as-an-aws-lambda-function.html#allowed-regions). For the lowest latency, Alexa recommends `us-east-1` for North America, `eu-west-1` for Europe and India, and `us-west-2` for the Far East ([Select the optimal region](https://developer.amazon.com/en-US/docs/alexa/custom-skills/host-a-custom-skill-as-an-aws-lambda-function.html#select-the-optimal-region-for-your-aws-lambda-function)). Set the Region with `provider.region` or `serverless deploy --region`.

## Alexa request and response format

Alexa invokes the function with a JSON request and expects a JSON response, both described in the [Request and Response JSON Reference](https://developer.amazon.com/en-US/docs/alexa/custom-skills/request-and-response-json-reference.html). The request has the top-level keys `version`, `session`, `context` and `request`; `request.type` is the request type, such as `LaunchRequest`, `IntentRequest` or `SessionEndedRequest`. The following trimmed request shows the shape:

```json
{
  "version": "1.0",
  "session": {
    "new": true,
    "sessionId": "amzn1.echo-api.session.0000",
    "application": {
      "applicationId": "amzn1.ask.skill.12345678-1234-1234-1234-123456789012"
    },
    "user": { "userId": "amzn1.ask.account.0000" }
  },
  "context": {
    "System": {
      "application": {
        "applicationId": "amzn1.ask.skill.12345678-1234-1234-1234-123456789012"
      }
    }
  },
  "request": {
    "type": "LaunchRequest",
    "requestId": "amzn1.echo-api.request.0000",
    "timestamp": "2026-01-01T12:00:00Z",
    "locale": "en-US"
  }
}
```

The following `handler.mjs` answers a launch request with speech and ends the session:

```javascript
// handler.mjs
export const handler = async (event) => {
  const text =
    event.request.type === 'LaunchRequest' ? 'Welcome to my skill.' : 'Goodbye.'

  return {
    version: '1.0',
    response: {
      outputSpeech: { type: 'PlainText', text },
      shouldEndSession: true,
    },
  }
}
```

For production skills, the [Alexa Skills Kit SDK for Node.js](https://developer.amazon.com/en-US/docs/alexa/alexa-skills-kit-sdk-for-nodejs/overview.html) or for Python routes requests to handlers and builds responses.

## Examples

- [aws-python-alexa-skill](https://github.com/serverless/examples/tree/v4/aws-python-alexa-skill): a Python skill function with an `alexaSkill` event.
- [Serverless examples](https://www.serverless.com/examples): more services to start from.

## Related

- [Alexa Smart Home events](./alexa-smart-home.md): invoke a function from an Alexa smart home skill.
- [Host a custom skill as an AWS Lambda function](https://developer.amazon.com/en-US/docs/alexa/custom-skills/host-a-custom-skill-as-an-aws-lambda-function.html): the Alexa guide for Lambda endpoints.
- [`serverless.yml` reference: Alexa](../guide/serverless.yml.md#alexa): every `alexaSkill` key in one place.
