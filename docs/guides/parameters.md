<!--
title: Serverless Framework - Parameters
menuText: Parameters
menuOrder: 2
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/parameters/)

<!-- DOCS-SITE-LINK:END -->

# Parameters

Parameters can be defined in `serverless.yml` or in [Serverless Dashboard](https://www.serverless.com/secrets). They can be used for example to:

- adapt the configuration based on the stage
- store secrets securely
- share configuration values between team members

## Stage parameters

Parameters can be defined **for each stage** in `serverless.yml` under the `params` key:

```yaml
params:
  prod:
    domain: myapp.com
  dev:
    domain: preview.myapp.com
```

Use the `default` key to define parameters that apply to all stages by default:

```yaml
params:
  default:
    domain: ${sls:stage}.preview.myapp.com
  prod:
    domain: myapp.com
  dev:
    domain: preview.myapp.com
```

Parameters can then be used via the `${param:XXX}` variables:

```yaml
provider:
  environment:
    APP_DOMAIN: ${param:domain}
```

The variable will be resolved based on the current stage.

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

### Retrieving parameters from the command line

Dashboard parameters can also be accessed on the CLI. You can use this at development time to look up the parameters without opening the dashboard, or in your CI/CD pipeline to use the parameters in custom scripts.

#### List parameters

If you are in a directory with a `serverless.yml`, the parameters will be listed for the org, app, and service specified in the `serverless.yml` file:

```bash
serverless param list [--stage <stage>]
```

If you are in a directory without a `serverless.yml`, or if you want to access parameters from another org, app, service, stage, or region, you can pass in the optional flags:

```bash
serverless param list
  [--org <org>]
  [--app <app>]
  [--service <service>]
  [--stage <stage>]
  [--region <region>]
```

#### Get a parameter

Individual parameters can also be accessed from the CLI using the `param get` sub-command. This command requires the `--name <name>` flag to identify the parameter name. Like the `sls param list`, you can optionally specify a different org, app, service, stage, ore region using flags.

```bash
serverless param get --name <name>
  [--org <org>]
  [--app <app>]
  [--service <service>]
  [--stage <stage>]
  [--region <region>]
```

## Inheritance and overriding

Parameters can be defined in `serverless.yml` per stage, as well as in Serverless Dashboard on the service or the instance (stage). Here is the priority used to resolve a `${param:XXX}` variable:

- First, look in `params.<stage>` in `serverless.yml`
- If not found, then look in the instance's parameters in the Dashboard
- If not found, then look in `params.default` in `serverless.yml`
- If not found, then look in the service's parameters in the Dashboard
- If not found, throw an error, or use the fallback value if one was provided: `${param:XXX, 'default value'}`

This gives you flexibility to mix `serverless.yml` parameters as well as secure Serverless Dashboard parameters.

This is especially useful in development when deploying to ephemeral stages (e.g. "feature-x"). The stage might not have any parameter, therefore it will default to the parameters set on the service. However, in other stages, like "prod", or "staging", you may override the service-level parameters with stage-level parameters to use values unique to that stage.
