<!--
title: Serverless Dashboard - Secrets
menuText: Secrets
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/dashboard/secrets/)

<!-- DOCS-SITE-LINK:END -->

# Secrets

The Serverless Framework Dashboard enables you to create and manage secrets, helping you secure your services by securely storing secrets used by your Serverless Framework services. The [Serverless Framework Dashboard](https://dashboard.serverless.com/) provides an interface to store and encrypt secrets and manage access to those secrets from your services. The Serverless Framework loads the secrets when the service is deployed.

## Creating a new Secret

Create a new secret by navigating to **profiles** in the [Serverless Framework Dashboard](https://dashboard.serverless.com).

1. Navigate into the profile you would like to use for the Secret.
2. Navigate into the **secrets** tab.
3. Set a **key** and **value** and click **add**.
4. Repeat Step 3 for each secret you would like to add.
5. When done, click **save changes**.

## Using a Secret to deploy

To use a secret, first make sure that the profile containing that secret is configured as the **default deployment profile** for your application, or it is configured as the **profile** on the stage and application you are using.

In your `serverless.yml` file add the variable `${secrets:<key>}` anywhere you would like to use the secret. The `<key>` references the secret key configured in the profile.

When you run `serverless deploy` the secret values will be obtained, decrypted and used to replace the variables in the `serverless.yml` for the deployment.
