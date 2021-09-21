<!--
title: Serverless Dashboard - Parameters
menuText: Parameters
menuOrder: 6
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/parameters/)

<!-- DOCS-SITE-LINK:END -->

# Parameters

The Serverless Framework Dashboard enables you to create and manage parameters, helping you to configure and secure your services by securely storing parameters used by your Serverless Framework services. The [Serverless Framework Dashboard](https://app.serverless.com/) provides an interface to store and encrypt parameters and manage access to those parameters from your services. The Serverless Framework loads the parameters when the service is deployed.

All parameters are treated as sensitive values, therefore they are always encrypted at rest, and only decrypted during deployment or to load them in the dashboard.

## Managing parameter using the dashboard

Parameters can be added to either services or instances.

To manage parameters on the service, go to the **apps** section of the dashboard, and select **settings** under the **...** menu.

To manage parameters on the instance, go to the **app** section of the dashboard, select the instance, and go to the **params** tab.

### Inheritance and overriding

Parameters set on instances take precedence over parameters set on services when deploying. If a parameter with the same key is set on both the instance and the service, then the value set on the instance will be used. If a parameter is set on the service, but not the instance, then the value set on the service will be used.

This enables you to treat the parameters on services as defaults. This is especially useful in development when you may deploy instances to ephemeral stages (e.g. "feature-x"). In development the instance might not have any new parameters, therefore it will default to the parameters set on the service. However, in other stages, like "prod", or "staging", you may override the service-level parameters with instance-level parameters to use values unique to that stage.

## Using a Parameter in serverless.yml

In your `serverless.yml` file add the variable `${param:<key>}` anywhere you would like to use the parameter. The `<key>` references the parameter key configured in the profile.

When you run `serverless deploy` the parameter values will be obtained, decrypted and used to replace the variables in the `serverless.yml` for the deployment.

## Use parameters from the command line

Parameters can also be accessed on the CLI. You can use this at development time to look up the parameters without opening the dashboard, or in your CI/CD pipeline to use the parameters in custom scripts.

### List parameters

```
sls param list
  [--org <org>]
  [--app <app>]
  [--service <service>]
  [--stage <stage>]
  [--region <region>]
```

If you are in a working directory with a `serverless.yml` then the parameters will be listed for the org, app, and service specified in the `serverless.yml` file.

If you are not in a working directory, without a `serverless.yml`, or if you want to access parameters from another org, app, service, stage, or region, you can pass in the optional flags.

### Get a parameter

```
sls param get
  --name <name>
  [--org <org>]
  [--app <app>]
  [--service <service>]
  [--stage <stage>]
  [--region <region>]
```

Individual parameters can also be accessed from the CLI using the `param get` sub-command. This command requires the `--name <name>` flag to identify the parameter name. Like the `sls param list`, you can optionally specify a different org, app, service, stage, ore region using flags.
