<!--
title: Serverless Dashboard - Outputs
menuText: Outputs
menuOrder: 3
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/dashboard/output-variables/)

<!-- DOCS-SITE-LINK:END -->

# Outputs

The Serverless Framework Dashboard helps you refactor large serverless applications by decoupling the shared services from the dependent services. The new outputs feature allows you to define output key/values in a `serverless.yml` and then reference those key/values in other `serverless.yml` files. The key/values are published to Serverless Framework Dashboard when you deploy, and they are loaded in other services when they are deployed.

## Define outputs for shared services

Define new outputs by adding a dictionary (key/value pairs) to the `outputs:` field in the `serverless.yml` file. The values can include any value supported by YAML, including strings, integers, lists (arrays), and dictionaries (key/value pairs). The dictionaries can also be nested to any depth.

**serverless.yml**

```yaml
outputs:
  my-key: my-value
  my-availability-zones:
    - us-east-1a
    - us-east-1b
  my-table-name: DynamoDbTable-${self:custom.stage}
```

The values will be interpolated and saved when the service is deployed. The values are saved as a part of the service instance so they are associated with the service, stage and region.

## Use outputs in dependent services

Outputs can be consumed from other services with they `${output}` variable. The reference must be formatted as `<service-id>.<key>`, where the `<service-id>` references another service in the same application, stage and region and the `<key>` references the dictionary key from the `outputs:`. The `<key>` can also be nested to reference nested values from the dictionary.

**serverless.yml**

```yaml
${output:my-service.var-key}
```

or, to reference a service in a different app, stage or region, specify it like this:

```yaml
${output:appname:stagename:regionname:my-service.var-key}
```

So, for example:

```yaml
${output:another-app:dev:us-east-1:my-service.var-key}
```

You can also omit any of app, stage or region by leaving it empty like this, which only specifies
stage:

```yaml
${output::dev::my-service.var-key}
```

## View outputs in the dashboard

The outputs for a service are made available on two different pages of the Serverless Framework Dashboard.

The current outputs for a given service instance are available in the **OUTPUTS** section of the service instance view. This will show the key/values which are currently available.

The historic outputs for a given service instance are available as a part of the deployment record which is available in the **activity & insights** section of the service instance view after a deployment.
