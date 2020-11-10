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

All parameters are treated as sensitive values, therefore they are not visible in the dashboard once saved, they are always encrypted at rest, and only decrypted during deployment.

## Creating a new Parameters

Create a new parameter by navigating to **profiles** in the [Serverless Framework Dashboard](https://app.serverless.com).

1. Navigate into the profile you would like to use for the Parameter.
2. Navigate into the **parameters** tab.
3. Set a **key** and **value** and click **add**.
4. Repeat Step 3 for each parameter you would like to add.
5. When done, click **save changes**.

## Using a Parameter in serverless.yml

To use a parameter in the serverless.yml, first make sure that the profile containing that parameter is configured as the **default deployment profile** for your application, or it is configured as the **profile** on the stage and application you are using.

In your `serverless.yml` file add the variable `${param:<key>}` anywhere you would like to use the parameter. The `<key>` references the parameter key configured in the profile.

When you run `serverless deploy` the parameter values will be obtained, decrypted and used to replace the variables in the `serverless.yml` for the deployment.

## Use parameters from the command line

Parameters can also be accessed on the CLI. You can use this at development time to look up the parameters without opening the dashboard, or in your CI/CD pipeline to use the parameters in custom scripts.

### List parameters

`sls param list [--org <org>] [--app <app>] [--service <service>] [--stage <stage>]`

If you are in a working directory with a `serverless.yml` then the parameters will be listed for the org, app, and service specified in the serverless.yml file.

If you are not in a working directory, without a `serverless.yml`, or if you want to access parameters from another org, app, service, or stage, you can pass in the optional flags.

### Get a parameter

`sls param get --name <name> [--org <org>] [--app <app>] [--service <service>] [--stage <stage>]`

Individual parameters can also be accessed from the CLI using the `param get` sub-command. This command requires the `--name <name>` flag to identify the parameter name. Like the `sls param list`, you can optionally specify a different org, app, service, or stage using flags.
