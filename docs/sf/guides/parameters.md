<!--
title: Parameters
description: Set parameters per stage in serverless.yml, pass them with --param or store them in the Dashboard, and read them with ${param:...}.
short_title: Parameters
keywords:
  [
    'Serverless Framework',
    'parameters',
    'stage parameters',
    'param variable',
    'CLI parameters',
    'Serverless Dashboard parameters',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/parameters)

<!-- DOCS-SITE-LINK:END -->

# Parameters

Parameters are named values that `serverless.yml` reads with `${param:<name>}`. Use them to give each stage its own settings (a domain, a table size, an API key), to keep secrets out of `serverless.yml` by storing them in the Serverless Framework Dashboard, and to pass values between services in [Serverless Compose](./compose.md). A parameter can come from `stages` in `serverless.yml`, the `--param` option, the Dashboard or Compose; [Inheritance and overriding](#inheritance-and-overriding) gives the order.

This `serverless.yml` sets a `domain` parameter for every stage and overrides it for `prod`:

```yaml
# serverless.yml
service: my-service

stages:
  default:
    params:
      domain: ${sls:stage}.preview.example.com
  prod:
    params:
      domain: example.com

provider:
  name: aws
  runtime: nodejs24.x
  environment:
    APP_DOMAIN: ${param:domain}
```

`serverless deploy --stage prod` sets `APP_DOMAIN` to `example.com`; `serverless deploy --stage dev` sets it to `dev.preview.example.com`.

## Stage parameters

Stage parameters live in `serverless.yml` under `stages.<stage>.params`, where `<stage>` is a stage name (letters, digits and hyphens) or `default`. Parameters under `default` apply to every stage; a parameter under a stage's own key wins over the `default` one for that stage.

```yaml
# serverless.yml
stages:
  default:
    params:
      tableReadCapacity: 1
  prod:
    params:
      tableReadCapacity: 10
```

The current stage is `--stage`, else `provider.stage`, else `dev`. Values can be any YAML type (strings, numbers, lists, objects) and can use other variables, such as `${env:...}` or `${ssm:...}`. A stage key can also hold `observability` and `resolvers` settings besides `params`.

## CLI parameters

To set a parameter for one command, pass `--param="<key>=<value>"`, once per parameter:

```bash
serverless deploy --param="domain=example.com" --param="key=value"
```

```yaml
# serverless.yml
provider:
  environment:
    APP_DOMAIN: ${param:domain}
    KEY: ${param:key}
```

The key is everything before the first `=`; the value is everything after it and may contain `=`. Trailing whitespace is trimmed, and the value is always a string. A value without `=`, with nothing before the first `=`, or with nothing after it, stops the command with:

```text
Encountered invalid "--param" CLI option value: "<value>". Supported format: "--param='<key>=<val>'"
```

## Serverless Dashboard parameters

The [Serverless Framework Dashboard](https://app.serverless.com) stores parameters for a service (all its stages) or for one instance of it (one stage and region). Use Dashboard parameters for secrets and for values your team shares: the Dashboard stores them encrypted and decrypts them when the CLI fetches them for a command, or when you view them in the Dashboard.

Read them like any other parameter:

```yaml
# serverless.yml
org: myorg
app: my-app
service: my-service

provider:
  environment:
    STRIPE_SECRET_KEY: ${param:stripeSecret}
```

The CLI fetches Dashboard parameters only when both of these are true:

- `org`, `app` and `service` are set in `serverless.yml`. In a Compose project, the org of the Compose run can stand in for `org`.
- The CLI is signed in with `serverless login` or an Access Key (`SERVERLESS_ACCESS_KEY`). With a License Key, a service that sets `app` stops with an error that starts with `This Service is enabled for Serverless Framework Dashboard because the "app" property is set.`

The CLI fetches the parameters of the service and of the instance that matches the app, the service, the stage (`--stage`, else `provider.stage`, else `dev`) and the region (`--region`, else `provider.region`, else `us-east-1`). An instance parameter replaces a service parameter of the same name. The region for this lookup doesn't come from `AWS_REGION` or an `aws` resolver's `region`, which can set the region a deploy goes to; set `provider.region` or pass `--region` so the two agree.

### Creating Serverless Dashboard parameters

Create parameters in the [Dashboard](https://app.serverless.com/) on the service (all stages) or on an instance (one stage and region):

- To manage a service's parameters, go to the **apps** section, open the **...** menu of the service and select **settings**.
- To manage an instance's parameters, go to the **app** section, select the instance and open the **params** tab.

## Compose parameters

In a [Serverless Compose](./compose.md) project, `serverless-compose.yml` can pass parameters to its services: to all of them per stage under `stages.<stage>.params`, or to one service under `services.<name>.params`, including outputs of other services. The service reads them with `${param:<name>}`. They are passed only when the command runs through Compose.

## Inheritance and overriding

When several sources set the same parameter, `${param:<name>}` takes the first one found in this order:

1. `--param` on the command line.
2. `stages.<stage>.params` in `serverless.yml`, or `params.<stage>` (deprecated).
3. `stages.default.params` in `serverless.yml`, or `params.default` (deprecated).
4. Dashboard parameters, an instance parameter before a service parameter.
5. Parameters passed by [Serverless Compose](./compose.md).

When no source sets the parameter, the variable's fallback value is used (`${param:domain, 'example.com'}`). Without a fallback, the command stops with an error that starts with:

```text
Cannot resolve '...' variable at '...'. No value is available for this variable, and no default value was provided.
```

This order lets you combine sources. For example, set a shared value on the service in the Dashboard; a new stage such as `feature-x` uses it, and `prod` or `staging` override it with `stages.<stage>.params` or an instance parameter.

Parameters under `stages.default.params` in `serverless.yml` also win over Dashboard parameters, so a `default` value hides a Dashboard parameter of the same name in every stage. For a value that applies only when the Dashboard has none, use the variable's fallback instead: `${param:stripeSecret, 'dev-placeholder'}`.

## The params property

Deprecated: use `stages.<stage>.params` instead. The top-level `params` property sets parameters per stage, with `default` for all stages:

```yaml
# serverless.yml
params:
  default:
    domain: ${sls:stage}.example.com
  prod:
    domain: example.com
```

`params` still resolves, at the same place in the order as its `stages` counterpart ([Inheritance and overriding](#inheritance-and-overriding)), and the CLI prints no warning for it. A `serverless.yml` can't set both top-level `params` and `stages`: with both, every command stops with an error that starts with `"params" and "stages" cannot be used together in the top-level of serverless.yml.` To migrate, move each `params.<stage>` block to `stages.<stage>.params`; see [Upgrading to v4](./upgrading-v4.md#updated-stages-syntax).

## Related

- [Variables](./variables/README.md): the other variable sources `serverless.yml` can read.
- [Serverless Compose](./compose.md): pass parameters and outputs between services.
- [Dashboard Providers](./dashboard/providers.md): AWS credentials from the Dashboard, looked up for the same instance.
