<!--
title: Serverless Framework - Parameters
description: Learn how to use parameters in Serverless Framework for adaptable configurations, secure secret storage, and shared configuration values. This guide covers CLI parameters, stage-specific parameters, and Serverless Dashboard parameters.
short_title: Serverless Parameters
keywords:
  [
    'Serverless Framework',
    'parameters',
    'configuration',
    'CLI parameters',
    'stage parameters',
    'Serverless Dashboard',
    'secure secrets',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/parameters)

<!-- DOCS-SITE-LINK:END -->

# Parameters

Parameters can be defined in `serverless.yml`, [Serverless Dashboard](https://app.serverless.com) or passed via CLI with `--param="<key>=<value>"` flag. They can be used for example to:

- adapt the configuration based on the stage
- store secrets securely
- share configuration values between team members

## CLI parameters

Parameters can be passed directly via CLI `--param` flag, following the pattern `--param="<key>=<value>"`:

```
serverless deploy --param="domain=myapp.com" --param="key=value"
```

Parameters can then be used via the `${param:XXX}` variables:

```yaml
provider:
  environment:
    APP_DOMAIN: ${param:domain}
    KEY: ${param:key}
```

## Stage parameters

`stages` allows you to set Parameters and other configuration details in a Stage-specific way. This is the new, preferred method for defining Parameters, which was launched in V.4. We'll be launching many features for the `stages` property, so we recommend embracing it.

Parameters can be defined **for each stage** in `serverless.yml` under the `stages.<stage>.params` key:

```yaml
stages:
  prod:
    params:
      domain: myapp.com
  dev:
    params:
      domain: preview.myapp.com
```

Use the `default` key to define parameters that apply to all stages by default:

```yaml
stages:
  default:
    params:
      domain: ${sls:stage}.preview.myapp.com
  prod:
    params:
      domain: myapp.com
  dev:
    params:
      domain: preview.myapp.com
```

Parameters can then be used via the `${param:XXX}` variables:

```yaml
provider:
  environment:
    APP_DOMAIN: ${param:domain}
```

The variable will be resolved based on the current stage.

## Params property

You can also set stage-specific parameters using the `params` top-level property, as show below. However, using the `stages` top-level property as shown above is the preferred and recommended way of setting parameters in the Serverless Framework V4.

```yml
# serverless.yml

params:
  default:
    domain: ${sls:stage}.myapi.com
  prod:
    domain: myapi.com
  dev:
    domain: dev.myapi.com
```

## Serverless Dashboard parameters

[Serverless Dashboard](https://www.serverless.com/secrets) lets you create and manage parameters, which is perfect for storing secrets securely or sharing configuration values across team members.

On top of that, Dashboard parameters can be stored on the service (applies to all stages) or on a specific instance (applies to a specific stage).

Dashboard parameters are treated as sensitive values, they are always encrypted at rest, and only decrypted during deployment or to view them in the dashboard.

Just like any other parameter, they can be used in `serverless.yml` via the `${param:XXX}` variables:

```yaml
provider:
  environment:
    STRIPE_SECRET_KEY: ${param:stripeSecret}
```

### Creating Serverless Dashboard parameters

Parameters can be created in the [Dashboard](https://app.serverless.com/) at the service level (applies to all stages) or instance level (stage-specific).

To manage parameters on a service, go to the **apps** section of the dashboard, and select **settings** under the **...** menu.

To manage parameters on an instance, go to the **app** section of the dashboard, select the instance, and go to the **params** tab.

## Inheritance and overriding

Parameters can be defined in `serverless.yml` per stage, as well as in Serverless Dashboard on the service or the instance (stage). Here is the priority used to resolve a `${param:XXX}` variable:

- First, look in params passed with `--param` CLI flag
- If not found, then look in `stages.<stage>.params` in `serverless.yml`
- If not found, then look in `stages.default.params` in `serverless.yml`
- If not found, then look in the instance's parameters in the Dashboard
- If not found, then look in the service's parameters in the Dashboard
- If not found, throw an error, or use the fallback value if one was provided: `${param:XXX, 'default value'}`

This gives you flexibility to mix `serverless.yml` parameters as well as secure Serverless Dashboard parameters.

This is especially useful in development when deploying to ephemeral stages (e.g. "feature-x"). The stage might not have any parameter, therefore it will default to the parameters set on the service. However, in other stages, like "prod", or "staging", you may override the service-level parameters with stage-level parameters to use values unique to that stage.
