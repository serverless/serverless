<!--
title: Dashboard Outputs
description: Publish values from one service with the outputs property and read them in another service with ${output:...} variables through the Dashboard.
short_title: Outputs
keywords: ['Serverless Framework', 'Dashboard', 'Outputs', 'output variable', 'share values between services']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/dashboard/output-variables)

<!-- DOCS-SITE-LINK:END -->

# Dashboard outputs

Dashboard outputs share values between services: one service publishes key/value pairs with the top-level `outputs` property when it deploys, and other services read them with `${output:<service>.<key>}` variables. Use outputs when the services are deployed separately and both set `org` and `app`; for services in one [Serverless Compose](../compose.md#service-dependencies-and-variables) project use `${service:...}`, and for any CloudFormation stack use [`${cf:...}`](../variables/aws/cf-stack.md).

The `users` service publishes its table name:

```yaml
# users/serverless.yml
org: myorg
app: my-app
service: users

outputs:
  table-name: users-table-${sls:stage}
```

The `orders` service, in the same org and app, reads it after `users` is deployed to the same stage and Region:

```yaml
# orders/serverless.yml
org: myorg
app: my-app
service: orders

provider:
  name: aws
  environment:
    USERS_TABLE: ${output:users.table-name}
```

Both services need a CLI signed in with a Serverless Framework account or an Access Key in `SERVERLESS_ACCESS_KEY`; see [account and key requirements](./README.md#account-and-key-requirements).

## Define outputs

The top-level `outputs` property is a map. Each value can be a string, number, boolean, list or map, nested to any depth, and can use variables:

```yaml
# serverless.yml
outputs:
  table-name: users-table-${sls:stage}
  availability-zones:
    - us-east-1a
    - us-east-1b
  limits:
    max-items: 100
```

`serverless deploy` resolves the values and saves them with the deployment record of the instance: the app, service, stage and Region.

## Read an output from another service

The short form `${output:<service>.<key>}` reads an output of another service in the same org and app, stage and Region as the service being deployed:

- The org and app are the `org` and `app` in `serverless.yml`.
- The stage is the current stage (`--stage`, then `provider.stage`, then `dev`).
- The Region is `--region`, then `provider.region`, then `us-east-1`.

To read a nested value, add its keys after the output name, separated by dots:

```yaml
provider:
  environment:
    MAX_ITEMS: ${output:users.limits.max-items}
```

Service names in an output variable can't contain dots, since the first dot separates the service from the key.

## Read an output from another app, stage or Region

The long form `${output:<app>:<stage>:<region>:<service>.<key>}` names the app, stage and Region to read from. Leave a part empty to use the current value for it. The org is always the `org` in `serverless.yml`.

This variable reads the `dev` stage of `users` in the current app and Region:

```yaml
provider:
  environment:
    USERS_TABLE: ${output::dev::users.table-name}
```

This variable reads `users` from the `shared` app in `dev` and `us-east-1`:

```yaml
provider:
  environment:
    USERS_TABLE: ${output:shared:dev:us-east-1:users.table-name}
```

A variable with another number of `:`-separated parts stops with this error:

```text
<key> does not conform to syntax service.key or app:stage:region:service.key
```

## Missing outputs and fallback values

When the output, the service or the instance doesn't exist, the variable has no value and the command stops with an error like:

```text
Cannot resolve '${output:users.table-name}' variable at 'provider.environment.USERS_TABLE'. No value is available for this variable, and no default value was provided. Please check your variable definitions or provide a default value.
```

To use a value instead, add a fallback after a comma:

```yaml
provider:
  environment:
    USERS_TABLE: ${output:users.table-name, 'users-table-dev'}
```

## View outputs

The Dashboard stores the outputs of each deployment in its deployment record, so you can see the outputs of every instance in the Dashboard. The CLI has no command that prints outputs: `serverless output get` and `serverless output list` stop with:

```text
This command was deprecated in v4. Please review your outputs in Serverless Framework Dashboard at https://app.serverless.com
```

## Related pages

- [Dashboard orgs, apps and members](./concepts.md)
- [Serverless Compose service outputs](../compose.md#service-dependencies-and-variables)
- [CloudFormation stack outputs](../variables/aws/cf-stack.md)
- [Variables](../variables/README.md)
