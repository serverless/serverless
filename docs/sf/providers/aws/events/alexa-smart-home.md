<!--
title: Alexa Smart Home Events
description: Invoke a Lambda function from an Alexa smart home skill with the alexaSmartHome event, restricted to your skill ID, and handle directives.
short_title: Alexa Smart Home
keywords: ['Serverless Framework', 'Alexa Smart Home trigger', 'Alexa smart home skill Lambda', 'alexaSmartHome event']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/alexa-smart-home)

<!-- DOCS-SITE-LINK:END -->

# Alexa Smart Home Events

The `alexaSmartHome` event lets an Alexa smart home skill (called a smart home add-on in the Alexa+ developer docs) invoke your Lambda function, the same as adding an Alexa Smart Home trigger with the skill ID in the Lambda console. The Framework doesn't create the skill: you create it in the [Alexa developer console](https://developer.amazon.com/en-US/alexa), give its skill ID to the event, and set the skill's endpoint to the deployed function. For a custom voice skill, use [Alexa Skill events](./alexa-skill.md) instead.

The following `serverless.yml` deploys a function that only the smart home skill `amzn1.ask.skill.12345678-1234-1234-1234-123456789012` can invoke:

```yaml
# serverless.yml
service: my-smart-home

provider:
  name: aws
  runtime: nodejs24.x
  region: us-east-1

functions:
  smartHome:
    handler: handler.handler
    events:
      - alexaSmartHome: amzn1.ask.skill.12345678-1234-1234-1234-123456789012
```

Replace the skill ID with your own; the developer console shows it after you create the skill. Smart home skills call Lambda functions in a Region that depends on the skill's language (see [Lambda Region for a smart home skill](#lambda-region-for-a-smart-home-skill)).

## Connect a deployed function to a smart home skill

The skill sends directives to the function only after its endpoint is set to the function's ARN:

1. Deploy the service with `serverless deploy`.
2. Run `serverless info` and note the deployed function name, by default `<service>-<stage>-<function>` (`my-smart-home-dev-smartHome` for the preceding example).
3. In the Alexa developer console, open the skill and enter the function ARN as its service endpoint, for example `arn:aws:lambda:us-east-1:123456789012:function:my-smart-home-dev-smartHome`.
4. Configure account linking, which every smart home skill needs, and test the skill in the Alexa app, as [Steps to Build Smart Home Add-ons](https://developer.amazon.com/docs/alexaplus/smarthome/steps-to-build-addons) describes.

When the function uses `provisionedConcurrency`, [SnapStart](../guide/functions.md#snapstart) or [durable functions](../guide/functions.md#durable-functions), the Framework attaches the `alexaSmartHome` permission to the function's alias (`provisioned` or the name set in `provisionedConcurrency.alias`, `snapstart`, or `durable`), so enter the alias ARN instead, for example `arn:aws:lambda:us-east-1:123456789012:function:my-smart-home-dev-smartHome:provisioned`.

## `alexaSmartHome` event settings

The `alexaSmartHome` event takes either the skill ID as a string or an object with these keys:

| Key       | Type    | Default  | Description                                                                                                                            |
| --------- | ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `appId`   | String  | Required | The skill ID, such as `amzn1.ask.skill.12345678-1234-1234-1234-123456789012`. Letters, digits, `.`, `_` and `-`, up to 256 characters. |
| `enabled` | Boolean | `true`   | Whether the skill can invoke the function.                                                                                             |

The string form is the same as the object form with only `appId`. To let several skills invoke one function, add one `alexaSmartHome` event per skill ID; each creates its own permission.

## Disable an Alexa Smart Home trigger

To stop a smart home skill from invoking the function without removing the event, set the `alexaSmartHome` event's `enabled` to `false`:

```yaml
functions:
  smartHome:
    handler: handler.handler
    events:
      - alexaSmartHome:
          appId: amzn1.ask.skill.12345678-1234-1234-1234-123456789012
          enabled: false
```

With `enabled: false`, the Framework keeps the permission resource but sets its action to `lambda:DisableInvokeFunction`, which doesn't allow invocation. Set `enabled` back to `true`, or remove the key, and deploy again to restore it.

## AWS resources and permissions for `alexaSmartHome` events

For each `alexaSmartHome` event, the Framework adds one `AWS::Lambda::Permission` resource to the stack, with the logical ID `<FunctionName>LambdaPermissionAlexaSmartHome<N>` (for example `SmartHomeLambdaPermissionAlexaSmartHome1`). The permission has:

- Principal `alexa-connectedhome.amazon.com`.
- Action `lambda:InvokeFunction` (`lambda:DisableInvokeFunction` when `enabled: false`).
- `EventSourceToken` set to the skill ID, so only that skill can invoke the function.

The function's execution role needs no extra permissions for this event. The Framework creates no Alexa resources; the skill, its account linking and its endpoints stay in the Alexa developer console.

## Lambda Region for a smart home skill

Alexa sends smart home directives to the Lambda function in the AWS Region that serves the skill's language: US East (N. Virginia) `us-east-1` for North America, EU (Ireland) `eu-west-1` for Europe and India, and US West (Oregon) `us-west-2` for the Far East and Australia. [Develop Smart Home Add-ons in Multiple Languages](https://developer.amazon.com/docs/alexaplus/smarthome/develop-smart-home-addons-in-multiple-languages) maps each language to its Region. For a skill in several of these Regions, deploy the service once per Region with `serverless deploy --region <region>` and enter each function ARN as that Region's endpoint.

## Smart home directive format

Alexa invokes the function with a directive and expects an event in response, both described in the [Alexa Interface Message and Property Reference](https://developer.amazon.com/docs/alexaplus/device-apis/message-guide#message-format). The directive's `header.namespace` and `header.name` name the interface and operation, such as `Alexa.Discovery` and `Discover`; the `payload.scope.token` (or `endpoint.scope.token` for device directives) carries the user's OAuth 2.0 access token from account linking. The following trimmed `Discover` directive shows the shape:

```json
{
  "directive": {
    "header": {
      "namespace": "Alexa.Discovery",
      "name": "Discover",
      "payloadVersion": "3",
      "messageId": "1bd5d003-31b9-476f-ad03-71d471922820"
    },
    "payload": {
      "scope": {
        "type": "BearerToken",
        "token": "access-token-from-account-linking"
      }
    }
  }
}
```

The following `handler.mjs` answers `Discover` with an empty device list; a real skill returns the user's devices in `endpoints` and handles the other directives its devices support:

```javascript
// handler.mjs
import { randomUUID } from 'node:crypto'

export const handler = async (event) => {
  const { namespace, name } = event.directive.header

  if (namespace === 'Alexa.Discovery' && name === 'Discover') {
    return {
      event: {
        header: {
          namespace: 'Alexa.Discovery',
          name: 'Discover.Response',
          payloadVersion: '3',
          messageId: randomUUID(),
        },
        payload: { endpoints: [] },
      },
    }
  }

  throw new Error(`Unsupported directive ${namespace}.${name}`)
}
```

[Alexa.Discovery Interface](https://developer.amazon.com/docs/alexaplus/device-apis/alexa-discovery) lists the endpoint fields a `Discover.Response` returns.

## Related

- [Alexa Skill events](./alexa-skill.md): invoke a function from an Alexa custom skill.
- [Steps to Build Smart Home Add-ons](https://developer.amazon.com/docs/alexaplus/smarthome/steps-to-build-addons): the Alexa guide for building a smart home skill.
- [`serverless.yml` reference: Alexa](../guide/serverless.yml.md#alexa): every `alexaSmartHome` key in one place.
- [Serverless examples](https://www.serverless.com/examples): services to start from.
