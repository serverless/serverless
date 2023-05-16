<!--
title: Serverless Framework - Upgrading to v3
menuText: Upgrading to v3
menuOrder: 12
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/upgrading-v3/)

<!-- DOCS-SITE-LINK:END -->

# Upgrading to Serverless Framework v3

Serverless Framework v3 contains a few breaking changes that may impact some projects.

This guide helps users upgrade from Serverless Framework v2 to v3.

## Am I impacted by breaking changes?

Serverless Framework v2 signals any deprecated feature via a deprecation warning. The simplest way to upgrade to v3 is to:

1. [Upgrade Serverless Framework](../getting-started.md#upgrade) to the latest v2 version
2. Run `serverless` commands in the project to see if there are any deprecation warnings

Projects that do not have any deprecations can be immediately upgraded to v3. Projects that have deprecation warnings should first solve these deprecations, then upgrade to v3.

## What about plugins?

We have worked with the most popular plugins to make sure they support Serverless Framework v3. As long as a project has no deprecations, it can be safely upgraded to v3.

That being said, some plugins need to be updated to be installable with v3. In most cases, it is a matter of allowing the plugin to be installed with Serverless Framework v3 in `package.json` (updating the `peerDependencies` requirement). Feel free to open an issue or pull request in the GitHub repository of the plugin.

## Upgrading to v3

First, [upgrade to the latest v2 version](../getting-started.md#upgrade) and make sure that you do not get any deprecation warning when running `serverless` commands.

Then, to upgrade to Serverless Framework v3, run:

```bash
npm install -g serverless
```

If you [installed `serverless` as a standalone binary](../getting-started.md#install-as-a-standalone-binary), run the following command instead:

- MacOS/Linux standalone binary: `serverless upgrade --major`
- Windows: `choco upgrade serverless`

## Update `frameworkVersion` setting for v3

In all projects that you want to upgrade to Serverless Framework v3, you need to make sure that `frameworkVersion` specified in project configuration allows v3 version. You can achieve it by setting it in the following manner:

```yml
frameworkVersion: '3'
```

## Using v2 and v3 in different projects

It is possible to use v3 in some projects and v2 in other projects. To achieve that, install the Serverless Framework locally via NPM (`npm i --save-dev serverless`).

There are 2 scenarios:

- Using v3 globally, and v2 in specific projects.

  This is the simplest. Upgrade the global version to v3, and install v2 in specific projects (via NPM). The `serverless` command will automatically run the correct version (v3 can run v2).

- Using v2 globally, and v3 in specific projects.

  To achieve that, install v3 in specific projects (via NPM). Then, use `serverless` for v2 projects, and `npx serverless` for v3 projects.

## Breaking changes

You will find below a complete list of all breaking changes. All those breaking changes were signaled via deprecation messages in Serverless Framework v2.

### CLI commands and options

The `serverless` CLI no longer runs on Node v10 because [that version is obsolete](https://endoflife.date/nodejs): upgrade to v12.13.0 (LTS) or greater to run `serverless` on your machine.

The `serverless` CLI used to accept free-form CLI options. This feature was deprecated and has been removed. The main reason is that this prevented us from detecting typos in options, which sometimes created unexpected situations and overall a bad user experience. You can use [the `--param` option](./parameters.md#cli-parameters) as a replacement, for example:

```bash
# Will no longer work in v3:
serverless deploy --foo=bar

# Alternative in v3.3 and greater:
serverless deploy --param="foo=bar"
```

In the example above, the `${opt:foo}` variable must be replaced with `${param:foo}` in the service configuration.

[Learn more about this change](../deprecations.md#handling-of-unrecognized-cli-options).

Additionally, all CLI options must now be passed at the end of the commands:

```bash
# Will no longer work in v3:
serverless --verbose deploy

# Correct syntax:
serverless deploy --verbose
```

This change makes the CLI much more robust at detecting arguments from options and their values.

On that note, the `-v` option is now a short form for `--version` instead of `--verbose`.

When the `serverless` CLI is installed globally and locally (in the project’s `node_modules`), the local version will always be used. It is no longer possible to disable that behavior ([learn more](../deprecations.md#support-for-enablelocalinstallationfallback-setting-is-to-be-removed)).

The `serverless deploy` command internals for AWS provider has been changed and now use [change sets](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-changesets.html). Due to that, the required IAM permissions for successfully running deployments have changed and now also include the following actions:

```
- cloudformation:CreateChangeSet
- cloudformation:DeleteChangeSet
- cloudformation:DescribeChangeSet
- cloudformation:ExecuteChangeSet
```

Finally, the `serverless studio` command has been removed: that feature was deprecated and is no longer available.

### Service configuration

The default Lambda runtime has changed from NodeJS 12 to NodeJS 14, given this is now the default runtime recommended by AWS.

Additionally, the `nodejs10.x`, `python2.7`, `ruby2.5` and `dotnetcore2.1` runtimes [are no longer supported and accepted by AWS Lambda](https://docs.aws.amazon.com/lambda/latest/dg/runtime-support-policy.html). As such, these runtimes will no longer be accepted in v3.

In `serverless.yml`, the `service` key no longer accepts a YAML object ([learn more](../deprecations.md#service-property-object-notation)).

```yaml
# Deprecated in v2, removed in v3:
service:
    name: my-service

# Correct syntax:
service: my-service
```

All options that used to be defined inside the `service` key have been moved to other sections (mentioned below in that document). This change clears up confusion that existed between the `service` and `provider` sections.

### API Gateway

When configuring API Gateway, some configuration options have moved to a dedicated sub-section of `provider`. That will help clear up confusion with similar `httpApi` settings.

```yaml
provider:
  # Deprecated in v2, removed in v3:
  apiKeys: ...
  resourcePolicy: ...
  usagePlan: ...

  # Correct syntax:
  apiGateway:
    apiKeys: ...
    resourcePolicy: ...
    usagePlan: ...
```

The `schema` option on HTTP events has also been renamed to `schemas`. That change allowed us to support much more schema validation features:

```yaml
functions:
  hello:
    handler: hello.handler
    events:
      - http:
          ...
          request:
            # Deprecated in v2, removed in v3:
            schema: ...
            # Correct syntax:
            schemas: ...
```

Learn more about [schema changes](../deprecations.md#aws-api-gateway-schemas).

When an external API Gateway is used and imported via `provider.apiGateway.restApiId`, both `provider.logs.restApi` and `provider.tracing.apiGateway` options are ignored. In v3, an error will be thrown if these options are defined. Indeed, these settings are applicable only if the API Gateway is provisioned by Serverless Framework.

The CloudFormation tags defined in `provider.tags` will now be correctly applied to HTTP APIs stages ([learn more](../deprecations.md#http-api-provider-tags)).

Starting with v3, AWS's recommended behavior for API Gateway authorizers will become the default: `functions[].events[].http.authorizer.identitySource` will no longer be set to `method.request.header.Authorization` by default when caching is disabled (i.e. for authorizers of type "request" with `resultTtlInSeconds` set to "0") ([learn more](../deprecations.md#default-identitysource-for-httpauthorizer)).

### CloudFront

Some CloudFront `behavior` options where deprecated by AWS: ForwardedValues, MinTTL, MaxTTL and DefaultTTL. These options have been removed. Use the new ["cache policy" feature](../providers/aws/events/cloudfront.md#cache-policy-configuration) instead ([learn more](../deprecations.md#cloudfront-event-behaviorforwardedvalues-property)).

### EventBridge

By default, all EventBridge resources (including Lambda triggers) will now be deployed using native CloudFormation resources, instead of a custom resource ([learn more](../deprecations.md#aws-eventbridge-lambda-event-triggers)). The change has the benefit of relying on native AWS features now, which will be more stable and future-proof.

Since this is a hard breaking change for Serverless Framework v2 users, it is possible to keep the legacy behavior (based on custom resources) by using this flag:

```yaml
provider:
  eventBridge:
    useCloudFormation: false
```

With this flag, v2 users can upgrade to v3 without breaking change. Note that `useCloudFormation: false` will be deprecated eventually, and will not be supported in the future.

### KMS

When configuring KMS keys, some configuration options have moved ([learn more](../deprecations.md#awskmskeyarn-references)):

```yaml
# Deprecated in v2, removed in v3:
service:
  awsKmsKeyArn: ...
functions:
  hello:
    awsKmsKeyArn: ...

# Correct syntax:
provider:
  kmsKeyArn: ...
functions:
  hello:
    kmsKeyArn: ...
```

That allowed us to make the KMS configuration consistent with all other AWS resources: these are now configured in the `provider` section.

### Alexa skill

`alexaSkill` events now require an `appId` ([learn more](../deprecations.md#support-for-alexaskill-event-without-appid-is-to-be-removed)). That change was required to implement a more stable deployment, as well as to deploy more restricted IAM permissions.

### Lambda Hashing Algorithm

By default, Lambda version hashes will now be generated using a more robust algorithm (fixes determinism issues). Since this change requires manual effort during the migration, you can keep using the old algorithm in v3 via the following configuration:

```yaml
provider:
  lambdaHashingVersion: 20200924
```

Adding the above configuration is sufficient to be compatible with v3.

However, we highly encourage upgrading to the new algorithm. To upgrade, you must:

1. Enable the new hashing mechanism in v2 by setting:

   ```yaml
   provider:
     lambdaHashingVersion: 20201221
   ```

2. Redeploy **with code or configuration changes** in all functions.

   If your deployment doesn't contain changes, you will get the following error: "_A version for this Lambda function exists._"

   To force changes in all functions, you can deploy code changes, upgrade dependencies, or even temporarily create empty files in your codebase.

   Alternatively, you can use the `--enforce-hash-update` helper:

   1. Run `serverless deploy` with the `--enforce-hash-update` flag: that flag will force changes by temporarily overriding the Lambda function descriptions (there is no runtime impact).
   2. Run `serverless deploy` without the flag above to restore the descriptions on all Lambda functions.

Remember that you will need to deploy with changes to each stage you have previously deployed. For development stages another option is to remove and recreate the stage entirely.

### New variable resolver engine

A more robust and powerful variable resolver engine was introduced behind a flag in Serverless Framework v2. This new engine is used by default in v3.

It supports the same variables with the same syntax. The main impacts are:

- Some edge cases (ambiguous configuration) now throw errors
- A very small share of unmaintained plugins haven't been updated to support the new engine

You can prepare the upgrade from v2 to v3 by enabling the new engine:

```yaml
# serverless.yml
service: myapp
variablesResolutionMode: 20210326
```

In v3, the `variablesResolutionMode` option can be removed as the new engine becomes the default.

### Low-level changes

Internal changes that may impact plugins or advanced use cases:

- Plugins can no longer define custom variables via the legacy variable resolver ([learn more](../deprecations.md#new-variables-resolver)).

  The new variable resolver API was introduced to provide a simpler and more stable way of defining custom variables. Most plugins have switched to that new variable resolver, but older plugins may still require some updates.

- CloudFormation outputs are now always exported ([learn more](../deprecations.md#disable-default-output-export-names)

  This change allows us to simplify and clean up the internals by removing options and logic switches. The use cases for not exporting CloudFormation outputs were very uncommon.

- When using the Serverless Framework programmatically, the service configuration must be at the root directory of the service ([learn more](../deprecations.md#service-configurations-should-not-be-nested-in-service-sub-directories)) and the arguments have changed ([learn more here](../deprecations.md#serverless-constructor-service-configuration-dependency) as well as [here](../deprecations.md#serverless-constructor-configcommands-and-configoptions-requirement)).

  Using the Serverless Framework programmatically is a very unusual and low-level scenario: we took advantage of the major version to improve the API.

### Deprecated features that will be kept in v3

Some Serverless Framework v2 features were marked as deprecated. However, given they are still widely used, we have chosen to keep the following features in v3.

IAM configuration has changed, yet both syntaxes are supported in v3:

```yaml
# Older syntax, still supported in v3
provider:
  role: ...
  rolePermissionsBoundary: ...
  iamRoleStatements: ...
  iamManagedPolicies: ...
  cfnRole: ...

# New syntax
provider:
  iam:
    role:
      name: ...
      permissionsBoundary: ...
      statements: ...
      managedPolicies: ...
    deploymentRole: ...
```

In the same spirit, packaging configuration has changed but both syntaxes are supported in v3:

```yaml
# Older syntax, still supported in v3
package:
  exclude:
    - 'src/**'
  include:
    - src/function/handler.js

# New syntax
package:
  patterns:
    - '!src/**'
    - src/function/handler.js
```

Configuration validation is still kept at the "warning" level by default (instead of turning to errors, as initially planned). To turn validation issues into errors, use:

```yaml
# v2 and v3 both keep the same default behavior: warnings by default
configValidationMode: warn

# Opt-in errors via:
configValidationMode: error
```

Unlike planned initially, loading `.env` files is kept opt-in via `useDotenv: true`.

Additionally, the short form `serverless deploy -f <function>` is still allowed in v3, but `serverless deploy function -f <function>` stays the preferred form.

### Plugins

The [`serverless-dotenv-plugin`](https://github.com/neverendingqs/serverless-dotenv-plugin) is directly impacted by v3. Indeed, for technical reasons the plugin will no longer be able to resolve `${env:xxx}` variables from `.env` files.

However, `.env` files are now natively supported by Serverless Framework v3. Set `useDotenv: true` to use `.env` variables with `${env:xxx}`:

```yaml
useDotenv: true

provider:
  environment:
    FOO: ${env:FOO}
```

The plugin can still be used as usual if you want to automatically import **all** variables from `.env` into functions.

```yaml
plugins:
  - serverless-dotenv-plugin

provider:
  environment:
    # With the plugin enabled, all variables in .env are automatically imported
```
