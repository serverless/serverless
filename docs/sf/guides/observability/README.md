<!--
title: Observability Providers
description: Send a stage's Lambda logs and traces to the Serverless Framework Dashboard or Axiom with stages.<stage>.observability in serverless.yml.
short_title: Observability
keywords: ['Serverless Framework', 'Observability', 'Monitoring', 'stages observability', 'Axiom', 'Serverless Dashboard']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/observability)

<!-- DOCS-SITE-LINK:END -->

# Observability providers

The `observability` setting under `stages` in `serverless.yml` connects a service's Lambda functions to an observability provider for one stage: the Serverless Framework Dashboard or Axiom. The Framework instruments the functions when you deploy that stage, so you can turn monitoring on in `prod` and leave it off in development stages.

To send the logs of every function in the `prod` stage to Axiom, set `observability: axiom` for that stage:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

stages:
  prod:
    observability: axiom

functions:
  hello:
    handler: handler.hello
```

Then deploy with the Axiom API token in `AXIOM_TOKEN`:

```bash
serverless deploy --stage prod
```

Each provider has its own requirements: Axiom reads an API token from `AXIOM_TOKEN`, and the Dashboard needs `org` and `app` in `serverless.yml`.

## Providers

- [Axiom](./axiom.md): adds the Axiom Lambda extension to each function and forwards other CloudWatch log groups of the service to an Axiom dataset.
- [Serverless Framework Dashboard](./dashboard.md): instruments each function for metrics, traces and logs in the Dashboard.

## The `stages.<stage>.observability` setting

`stages.<stage>.observability` selects the provider for one stage. It applies to every function of the service; there is no per-function setting. `stages.<stage>.observability` accepts these values:

| Value                                  | Effect                                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `axiom`                                | Axiom, with the generated dataset name.                                                                    |
| `dashboard`                            | Serverless Framework Dashboard. Without `app` in `serverless.yml`, the deploy doesn't instrument anything. |
| `true`                                 | Serverless Framework Dashboard. Requires `app`.                                                            |
| `false`                                | Removes Dashboard instrumentation from the service's functions on `serverless deploy`. Requires `app`.     |
| `provider: axiom` and `dataset`        | Axiom, sending data to the dataset named in `dataset`.                                                     |
| `provider: dashboard`                  | Serverless Framework Dashboard, the same as `dashboard`.                                                   |
| Not set for the stage or under default | No provider. The deploy leaves Dashboard instrumentation as it is and doesn't add the Axiom extension.     |

With any value other than Axiom, or with no value, `serverless deploy` still runs the Axiom unsubscribe step while `AXIOM_TOKEN` is set and the service defines log groups other than function log groups; see [Turn off Axiom for a stage](./axiom.md#turn-off-axiom-for-a-stage).

The object form accepts only `provider` (required) and `dataset`, and `dataset` applies only to Axiom:

```yaml
# serverless.yml
stages:
  prod:
    observability:
      provider: axiom
      dataset: my-service-prod
```

The Framework also reads `disabled`, as a string or as `provider: disabled`. It has the effect of `false`, and without `app` it changes nothing instead of stopping the command. The configuration schema doesn't list `disabled`, so the Framework prints an `Invalid configuration encountered` warning for it, or stops with `configValidationMode: error`. Write provider names in lowercase: the Framework matches them in any case, but the schema accepts only lowercase.

## Stage precedence for observability

The Framework looks up `observability` under the name of the stage being deployed first. When that stage has no `observability` value, or the value is `null`, the value under `stages.default` applies. To turn on Axiom for `prod` and turn off Dashboard instrumentation in every other stage:

```yaml
# serverless.yml
org: myorg
app: my-app
service: my-service

stages:
  prod:
    observability: axiom
  default:
    observability: false
```

## Commands that apply the observability setting

The Framework evaluates `stages.<stage>.observability` for every command that loads the service, so an invalid value stops any command, including `serverless print`. The providers then act on these commands:

- Dashboard: `serverless deploy` only.
- Axiom: `serverless package` and `serverless deploy` add the extension to the functions, `serverless deploy` creates the dataset and the log forwarding stacks, and `serverless deploy function` adds the extension to the deployed function.

## Errors for the observability setting

`true` or `false` without `app` in `serverless.yml` stops the command with:

```text
To instrument your service, you must set the "app" property in your config file.
```

A provider name other than `axiom`, `dashboard` or `disabled` stops the command with:

```text
Unknown observability provider: <name>
```

A value that isn't a boolean, a string or an object with a `provider` string stops the command with:

```text
Invalid observability configuration. Expected a boolean, string or an object with a "provider" property. Received: <value>
```

## Related pages

- [Axiom](./axiom.md)
- [Serverless Framework Dashboard observability](./dashboard.md)
- [Dashboard monitoring and observability](../dashboard/monitoring/README.md)
- [Services and stages](../../providers/aws/guide/services.md)
