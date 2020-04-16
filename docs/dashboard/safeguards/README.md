<!--
title: Serverless Dashboard - Safeguards
menuText: Safeguards
menuOrder: 5
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/dashboard/safeguards/)

<!-- DOCS-SITE-LINK:END -->

# Safeguards

Safeguards performs a series of policy checks when running the `serverless deploy` command. There are [fourteen policies](/framework/docs/dashboard/safeguards/available/) included which you can [configure in the dashboard](#configuring-policies). Additionally [custom safeguards](/framework/docs/dashboard/safeguards/custom/) can be created and added to your serverless project.

## Configuring Policies

Safeguard policies are managed in the [Serverless Framework Dashboard](https://dashboard.serverless.com/). When you run `serverless deploy`, the CLI obtains the latest list of Safeguard policies and performs the checks before any resources are provisioned or deployed.

The list of available Safeguards can be found by navigating to the "profiles" page, selecting the individual profile and opening the "safeguards" tab. The guide on [using deployment profiles to deploy](/framework/docs/dashboard/profiles#using-a-deployment-profile-to-deploy) provides instructions to identify the profile used by your application and stage.

When creating a new Safeguard policy you must specify each of the following fields:

### name

This is a user-readable name for the Safeguard policy. When the policy check is run in the CLI, the Safeguard policy name is used in the output.

### description

The description should explain the intent of the policy. When the Safeguard policy check runs in the CLI this description will be displayed if the policy check fails. It is recommended that the description provides instructions on how to resolve an issue if the service is not compliant with the policy.

### safeguard

The safeguard dropdown lists all of the [available safeguards](/framework/docs/dashboard/safeguards/available/). Select the Safeguard you want to enforce. When you select the Safeguard the description and the settings will be populated for you with default values.

### enforcement level

The enforcement level can be set to either `warning` or `error`. When the Safeguard policy check runs in the CLI and the policy check passes, then enforcement level will have no impact on the deployment. However, if the policy check fails, then the enforcement level will control if the deployment can continue. If the enforcement level is set to `warning`, then the CLI will return a warning message but the deployment will continue. If the enforcement level is set to `error`, then the CLI will return an error message and the deployment will be blocked from continuing.

### settings

Some of the [available safeguards](/framework/docs/dashboard/safeguards/available/) may allow or require configurations. For example, the [Allowed Runtimes (allowed-runtimes)](#allowed-runtimes) Safeguard requires a list of allowed AWS Lambda Runtimes for functions. This field allows you to customize the settings for the Safeguard policy.

## Running Policy Checks

The policy checks are performed as a part of the `serverless deploy` command.
This will load the safeguard settings from the `serverless.yml` file to
determine which policies to evaluate.

**Example deploy**

```
$ sls deploy
...
Serverless: Safeguards Results:

   Summary --------------------------------------------------

   passed - require-dlq
   passed - allowed-runtimes
   passed - no-secret-env-vars
   passed - allowed-stages
   failed - require-cfn-role
   passed - allowed-regions
   passed - framework-version
   failed - no-wild-iam-role-statements

   Details --------------------------------------------------

   1) Failed - no cfnRole set
      details: https://git.io/fhpFZ
      Require the cfnRole option, which specifies a particular role for CloudFormation to assume while deploying.


   2) Failed - iamRoleStatement granting Resource='*'. Wildcard resources in iamRoleStatements are not permitted.
      details: https://git.io/fjfk7
      Prevent "*" permissions being used in AWS IAM Roles by checking for wildcards on Actions and Resources in grant statements.


Serverless: Safeguards Summary: 6 passed, 0 warnings, 2 errors
...
```

### Policy check results

When a policy check is performed, the policy can respond with a **pass**,
**fail** or **warning**. A fail will block and prevent the deploy from
occurring. A warning will display a message but the deploy will continue.

If one or more of the policy checks fail the command will return a 1 exit code so
it can be detected from a script or CI/CD service.
