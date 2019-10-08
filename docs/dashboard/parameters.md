<!--
title: Serverless Dashboard - Parameters
menuText: Parameters
menuOrder: 4
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/dashboard/parameters/)

<!-- DOCS-SITE-LINK:END -->

# Parameters

The Serverless Framework Dashboard enables you to create and manage parameters, helping you to configure and secure your services by securely storing parameters used by your Serverless Framework services. The [Serverless Framework Dashboard](https://dashboard.serverless.com/) provides an interface to store and encrypt parameters and manage access to those parameters from your services. The Serverless Framework loads the parameters when the service is deployed.

All parameters are treated as sensitive values, therefore they are not visible in the dashboard once saved, they are always encrypted at rest, and only decrypted during deployment.

## Creating a new Parameters

Create a new parameter by navigating to **profiles** in the [Serverless Framework Dashboard](https://dashboard.serverless.com).

1. Navigate into the profile you would like to use for the Parameter.
2. Navigate into the **parameters** tab.
3. Set a **key** and **value** and click **add**.
4. Repeat Step 3 for each parameter you would like to add.
5. When done, click **save changes**.

## Using a Parameter to deploy

To use a parameter, first make sure that the profile containing that parameter is configured as the **default deployment profile** for your application, or it is configured as the **profile** on the stage and application you are using.

In your `serverless.yml` file add the variable `${param:<key>}` anywhere you would like to use the parameter. The `<key>` references the parameter key configured in the profile.

When you run `serverless deploy` the parameter values will be obtained, decrypted and used to replace the variables in the `serverless.yml` for the deployment.
