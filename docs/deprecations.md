<!--
title: Serverless Framework Deprecations
menuText: Deprecations
layout: Doc
-->

# Serverless Framework Deprecations

## How to disable a specific deprecation

To disable a deprecation, use the `SLS_DEPRECATION_DISABLE=CODE` environment variable. You can disable multiple deprecations via `SLS_DEPRECATION_DISABLE=CODE1,CODE2` or disable them all via `SLS_DEPRECATION_DISABLE=*`.

Alternatively, you can set `disabledDeprecations` in `serverless.yml`:

```yml
service: myService
disabledDeprecations:
  - CODE_1 # To disable specific deprecation with code "CODE_1"
  - '*' # To disable all deprecation messages
```

## Notification mode

By default, deprecations are logged after the command finalizes with a warning summary.

This notification mode can be changed via the `SLS_DEPRECATION_NOTIFICATION_MODE=error` environment variable or via `serverless.yml`:

```yaml
deprecationNotificationMode: error
```

The `error` mode turns all deprecations into strict errors, the `warn` mode displays deprecations as they're discovered.

Note:

- The `serverless.yml` setting is ineffective for deprecations reported before the configuration is read.
- `SLS_DEPRECATION_DISABLE` and `disabledDeprecations` remain respected, and no errors will be thrown for mentioned deprecation codes.

<a name="CONSOLE_CONFIGURATION"><div>&nbsp;</div></a>

## Property `console`

Deprecation code: `CONSOLE_CONFIGURATION`

Starting with v3.24.0, Serverless will no longer recognize inner `console` configuration. All Serverless Console related configuration is expected to be maintained at https://console.serverless.com

Learn more about configuration validation here: http://slss.io/configuration-validation

<a name="VARIABLES_RESOLUTION_MODE"><div>&nbsp;</div></a>

## Property `variablesResolutionMode`

Deprecation code: `VARIABLES_RESOLUTION_MODE`

Starting with v4.0.0, Serverless will no longer recognize `variablesResolutionMode`, as supported configuration property. Drop it to avoid validation errors

Learn more about configuration validation here: http://slss.io/configuration-validation

<a name="PROJECT_DIR"><div>&nbsp;</div></a>

## Property `projectDir`

Deprecation code: `PROJECT_DIR`

Starting with v4.0.0, Serverless will no longer recognize `projectDir`, as supported configuration property. Drop it to avoid validation errors

Learn more about configuration validation here: http://slss.io/configuration-validation

<a name="CLI_OPTIONS_SCHEMA_V3"><div>&nbsp;</div></a>

## CLI Options extensions, `type` requirement

Deprecation code: `CLI_OPTIONS_SCHEMA_V3`

Internal handling of CLI arguments was improved with type awareness for options. Now each option definition is expected have `type` defined in its settings.

Possible values are `string`, `boolean` and `multiple`. Check [Defining options](/framework/docs/providers/aws/guide/plugins#defining-options) documentation for more info.

If you rely on a plugin which does not set types (yet) please report the issue at its issue tracker.

Starting with v4.0.0 any option extensions which does not have `type` defined will be communicated with a thrown error

<a name="PROVIDER_IAM_SETTINGS_V3"><div>&nbsp;</div></a>

## Grouping IAM settings under `provider.iam`

Deprecation code: `PROVIDER_IAM_SETTINGS_v3`

All IAM-related settings of _provider_ including `iamRoleStatements`, `iamManagedPolicies`, `role` and `cfnRole` are also now supported at `iam` property. Refer to the [IAM Guide](/framework/docs/providers/aws/guide/iam.md).

- `provider.role` -> `provider.iam.role`
- `provider.rolePermissionsBoundary` -> `provider.iam.role.permissionsBoundary`
- `provider.iamRoleStatements` -> `provider.iam.role.statements`
- `provider.iamManagedPolicies` -> `provider.iam.role.managedPolicies`
- `provider.cfnRole` -> `provider.iam.deploymentRole`

In addition `iam.role.permissionBoundary` can also be set at `iam.role.permissionsBoundary` (which matches CloudFormation property name).

Starting with v4.0.0 old versions of settings will no longer be supported

<a name="CONFIG_VALIDATION_MODE_DEFAULT_V3"><div>&nbsp;</div></a>

## `configValidationMode: error` will be new default

Deprecation code: `CONFIG_VALIDATION_MODE_DEFAULT_V3`

Starting with v4.0.0, Serverless will throw on configuration errors by default. This is changing from the previous default, `configValidationMode: warn`

Learn more about configuration validation here: http://slss.io/configuration-validation

<a name="PACKAGE_PATTERNS"><div>&nbsp;</div></a>

## New way to define packaging patterns

Deprecation code: `PACKAGE_PATTERNS`

Support for `package.include` and `package.exclude` will be removed with v4.0.0. Instead please use `package.patterns` with which both _include_ and _exclude_ (prefixed with `!`) rules can be configured.

Check [Packaging Patterns](/framework/docs/providers/aws/guide/packaging/#patterns) documentation for more info.

<a name="CLI_DEPLOY_FUNCTION_OPTION_V3"><div>&nbsp;</div></a>

## CLI `--function`/`-f` option for `deploy` command

Deprecation code: `CLI_DEPLOY_FUNCTION_OPTION_V3`

Starting with `v4.0.0`, `--function` or `-f` option for `deploy` command will no longer be supported. In order to deploy a single function, please use `deploy function` command instead.

<a name="AWS_WEBSOCKET_API_USE_PROVIDER_TAGS"><div>&nbsp;</div></a>

## Property `provider.websocket.useProviderTags`

Deprecation code: `AWS_WEBSOCKET_API_USE_PROVIDER_TAGS`

Starting with v4.0.0, `provider.tags` will be applied to Websocket Api Gateway by default
Set `provider.websocket.useProviderTags` to `true` to adapt to the new behavior now.

<a name="LAMBDA_HASHING_VERSION_PROPERTY"><div>&nbsp;</div></a>

## Property `provider.lambdaHashingVersion`

Deprecation code: `LAMBDA_HASHING_VERSION_PROPERTY`

Lambda version hashes were improved with a better algorithm (that fixed determinism issues). It is used by default starting with v3.0.0.

If you previously opted-in to use new algorithm by setting `provider.lambdaHashingVersion: 20201221`, you can safely remove that property from your configuration in v3.

To get more details, read [the v3 upgrade guide](./guides/upgrading-v3.md#lambda-hashing-algorithm).

<a name="AwS_EVENT_BRIDGE_CUSTOM_RESOURCE_LEGACY_OPT_IN"><div>&nbsp;</div></a>

## AWS EventBridge lambda event triggers based on Custom Resources

Deprecation code: `AWS_EVENT_BRIDGE_CUSTOM_RESOURCE_LEGACY_OPT_IN`

Support for provisioning AWS EventBridge resources without native CloudFormation resources is deprecated and will no longer be maintained. If you want to upgrade to native CloudFormation, remove "eventBridge.useCloudFormation" setting from your configuration. If you are currently using "eventBridge.useCloudFormation" set to `true` to enable native CloudFormation, you can safely remove this setting from your configuration.

Note that to migrate away from the legacy behavior, you will need to remove (or comment) EventBridge triggers, deploy, re-add them and re-deploy in order to migrate from the legacy behavior.

<a name="AWS_HTTP_API_USE_PROVIDER_TAGS_PROPERTY"><div>&nbsp;</div></a>

## Ineffective property `provider.httpApi.useProviderTags`

Deprecation code: `AWS_HTTP_API_USE_PROVIDER_TAGS_PROPERTY`

Starting with "v3.0.0", property `provider.httpApi.useProviderTags` is no longer effective as provider tags are applied to Http Api Gateway by default. You can safely remove this property from your configuration.

<a name="S3_TRANSFER_ACCELERATION_ON_EXISTING_BUCKET"><div>&nbsp;</div></a>

## Attempt to enable S3 Transfer Acceleration on provided S3 buckets

Deprecation code: `S3_TRANSFER_ACCELERATION_ON_EXISTING_BUCKET`

Starting with "v3.0.0", attempt to enable S3 Transfer Acceleration on user provided bucket will result in error instead of a warning. To ensure seamless upgrade, please stop using "--aws-s3-accelerate" flag.

<a name="DUPLICATE_PLUGIN_DEFINITION"><div>&nbsp;</div></a>

## Duplicate plugin definition in configuration

Deprecation code: `DUPLICATE_PLUGIN_DEFINITION`

Starting with "v3.0.0", duplicate plugin definition will result in an error instead of a warning. To ensure seamless upgrade, please remove duplicate plugins from your configuration.

<a name="CLI_VERBOSE_OPTION_ALIAS"><div>&nbsp;</div></a>

## CLI `-v` alias for `--verbose` option

Deprecation code: `CLI_VERBOSE_OPTION_ALIAS`

Starting with `v3.0.0`, `-v` will no longer be supported as alias for `--verbose` option. Please use `--verbose` flag instead.

<a name="AWS_API_GATEWAY_DEFAULT_IDENTITY_SOURCE"><div>&nbsp;</div></a>

## Default `identitySource` for `http.authorizer`

Deprecation code: `AWS_API_GATEWAY_DEFAULT_IDENTITY_SOURCE`

Starting with v3.0.0, `functions[].events[].http.authorizer.identitySource` will no longer be set to "method.request.header.Authorization" by default for authorizers of "request" type with caching disabled ("resultTtlInSeconds" set to "0"). If you want to keep this setting, please set it explicitly in your configuration. If you do not want this to be set, please set it explicitly to "null".

<a name="DISABLE_DEFAULT_OUTPUT_EXPORT_NAMES"><div>&nbsp;</div></a>

## Disable default Output Export names

Deprecation code: `DISABLE_DEFAULT_OUTPUT_EXPORT_NAMES`

Starting with `v3.0.0`, it will not be possible to disable default export names for outputs. To hide this deprecation message and ensure seamless upgrade, please remove this flag.

<a name="CLI_DEPLOY_FUNCTION_OPTION"><div>&nbsp;</div></a>

## CLI `--function`/`-f` option for `deploy` command

Deprecation code: `CLI_DEPLOY_FUNCTION_OPTION`

_Note: We've resigned from this deprecation in the context of v2 (it'll be re-added in the context of v3). We continue to advise using `deploy function -f` command instead of `deploy -f`._

Starting with `v3.0.0`, `--function` or `-f` option for `deploy` command will be removed. In order to deploy a single function, please use `deploy function` command instead.

<a name="CHANGE_OF_DEFAULT_RUNTIME_TO_NODEJS14X"><div>&nbsp;</div></a>

## Change of default runtime to `nodejs14.x`

Deprecation code: `CHANGE_OF_DEFAULT_RUNTIME_TO_NODEJS14X`

Starting with `v3.0.0`, the default runtime will change from `nodejs12.x` to `nodejs14.x`. In order to hide the deprecation message and ensure seamless upgrade, please set the runtime explicitly.

<a name="AWS_API_GATEWAY_NON_APPLICABLE_SETTINGS"><div>&nbsp;</div></a>

## AWS API Gateway non-applicable settings configured

Deprecation code: `AWS_API_GATEWAY_NON_APPLICABLE_SETTINGS`

When external API Gateway resource is used and imported via `provider.apiGateway.restApiId` setting, both `provider.logs.restApi` and `provider.tracing.apiGateway` are ignored. In v3, an error will be thrown if these options are defined. Indeed, these settings are applicable only if API Gateway resource is provisioned by Serverless Framework.

<a name="CLI_OPTIONS_SCHEMA"><div>&nbsp;</div></a>

## CLI Options extensions, `type` requirement

Deprecation code: `CLI_OPTIONS_SCHEMA`

_Note: We've resigned from this deprecation in the context of v2 (it'll be re-added in the context of v3). We continue to advise upgrade so schema for CLI options is provided._

Internal handling of CLI arguments was improved with type awareness for options. Now each option definition is expected have `type` defined in its settings.

Possible values are `string`, `boolean` and `multiple`. Check [Defining options](/framework/docs/providers/aws/guide/plugins#defining-options) documentation for more info.

If you rely on a plugin which does not set types (yet) please report the issue at its issue tracker.

Starting with v3.0.0 any option extensions which does not have `type` defined will be communicated with a thrown error

<a name="NEW_PACKAGE_PATTERNS"><div>&nbsp;</div></a>

## New way to define packaging patterns

Deprecation code: `NEW_PACKAGE_PATTERNS`

_Note: We've resigned from this deprecation in the context of v2 (it'll be re-added in the context of v3). We continue to advise upgrade of services, so they do not rely on `package.include` and `package.exclude` settings._

Support for `package.include` and `package.exclude` will be removed with v3.0.0. Instead please use `package.patterns` with which both _include_ and _exclude_ (prefixed with `!`) rules can be configured.

Check [Packaging Patterns](/framework/docs/providers/aws/guide/packaging/#patterns) documentation for more info.

<a name="UNSUPPORTED_CLI_OPTIONS"><div>&nbsp;</div></a>

## Handling of unrecognized CLI options

Deprecation code: `UNSUPPORTED_CLI_OPTIONS`

CLI options validation was introduced to detect typos and mistakes. That required dropping support for _free-form_ CLI options in v3 (because free-form CLI options cannot be validated).

An alternative to free-form CLI options is to use [environment variables](./providers/aws/guide/variables#referencing-environment-variables). Another option is to use [the `--param` option](./guides/parameters#cli-parameters) introduced in Serverless Framework **v3.3.0**:

```yaml
provider:
  environment:
    APP_DOMAIN: ${param:domain, 'preview.myapp.com'}
```

```bash
sls deploy --param="domain=myapp.com"
```

Starting with v3.0.0, Serverless throws an error in case of unknown CLI options.

<a name="CLI_OPTIONS_BEFORE_COMMAND"><div>&nbsp;</div></a>

## CLI command options should follow command

Deprecation code: `CLI_OPTIONS_BEFORE_COMMAND`

Starting with v3.0.0, Serverless will not support putting options before command, e.g. `sls -v deploy` will no longer be recognized as `deploy` command.

Ensure to always format CLI command as `sls [command..] [options...]`

<a name="CONFIG_VALIDATION_MODE_DEFAULT"><div>&nbsp;</div></a>

## `configValidationMode: error` will be new default

Deprecation code: `CONFIG_VALIDATION_MODE_DEFAULT`

_Note: We've resigned from this deprecation in the context of v2 (it'll be re-added in the context of v3). We continue to advise configuring services with `configValidationMode: error` setting._

Starting with v3.0.0, Serverless will throw on configuration errors by default. This is changing from the previous default, `configValidationMode: warn`

Learn more about configuration validation here: http://slss.io/configuration-validation

<a name="AWS_API_GATEWAY_SCHEMAS"><div>&nbsp;</div></a>

## AWS API Gateway schemas

Deprecation code: `AWS_API_GATEWAY_SCHEMAS`

Starting with v3.0.0, `http.request.schema` property will be replaced by `http.request.schemas`. In addition to supporting functionalities such as model name definition and reuse of existing schemas, `http.request.schemas` also supports the same notation as `http.request.schema`, so you can safely migrate your existing configuration to the new property. For more details about the new configuration, please refer to the [API Gateway Event](/framework/docs/providers/aws/events/apigateway.md)

<a name="AWS_EVENT_BRIDGE_CUSTOM_RESOURCE"><div>&nbsp;</div></a>

## AWS EventBridge lambda event triggers

Deprecation code: `AWS_EVENT_BRIDGE_CUSTOM_RESOURCE`

Starting with v3.0.0, AWS EventBridge lambda event triggers and all associated EventBridge resources will be, by default, deployed using native CloudFormation resources instead of a custom resource that used a lambda to deploy them via the AWS SDK/API.

Adapt to this behavior now by setting `provider.eventBridge.useCloudFormation: true`.

If you want to keep using the old deployment method for your AWS EventBridge resources, set `provider.eventBridge.useCloudFormation: false` instead.

<a name="NEW_VARIABLES_RESOLVER"><div>&nbsp;</div></a>

## New variables resolver

Deprecation code: `NEW_VARIABLES_RESOLVER`

A more robust and powerful variable resolver engine was introduced (disabled by default) in Serverless Framework v2. It is used by default in v3.

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

<a name="AWS_HTTP_API_USE_PROVIDER_TAGS"><div>&nbsp;</div></a>

## Http Api provider tags

Deprecation code: `AWS_HTTP_API_USE_PROVIDER_TAGS`

Starting with v3.0.0, `provider.tags` will be applied to HTTP API Gateway stages by default
Set `provider.httpApi.useProviderTags` to `true` to adapt to the new behavior now.

<a name="MISSING_COMMANDS_OR_OPTIONS_AT_CONSTRUCTION"><div>&nbsp;</div></a>

## `Serverless` constructor `config.commands` and `config.options` requirement

Deprecation code: `MISSING_COMMANDS_OR_OPTIONS_AT_CONSTRUCTION`

_Note: Applies only to eventual programmatic usage of the Framework_

`Serverless` constructor was refactored to depend on CLI commands and arguments, to be resolved externally and passed to its constructor with `config.commands` and `config.options`. Starting from v3.0.0 CLI arguments will not be resolved internally.

<a name="MISSING_SERVICE_CONFIGURATION"><div>&nbsp;</div></a>

## `Serverless` constructor service configuration dependency

Deprecation code: `MISSING_SERVICE_CONFIGURATION`

_Note: Applies only to eventual programmatic usage of the Framework_

`Serverless` constructor was refactored to depend on service configuration being resolved externally and passed to its constructor with following options:

- `configuration` - Service configuration (JSON serializable plain object)
- `serviceDir` - Directory in which service is placed (All path references in service configuration will be resolved against this path)
- `configurationFilename` - Name of configuration file (e.g. `serverless.yml`).

Starting from v3.0.0 configuration data will not be resolved internally, and if `Serverless` is invoked in service context, all three options will have to be provided

<a name="NESTED_CUSTOM_CONFIGURATION_PATH"><div>&nbsp;</div></a>

## Service configurations should not be nested in service sub directories

Deprecation code: `NESTED_CUSTOM_CONFIGURATION_PATH`

_Note: Applies only to eventual programmatic usage of the Framework_

Service configuration in all cases should be put at root folder of a service.
All paths in this configuration are resolved against service directory, and it's also the case if configuration is nested in sub directory.

To avoid confusing behavior starting with v3.0.0 Framework will no longer permit to rely on configurations placed in sub directories

<a name="MISSING_SERVICE_CONFIGURATION_PATH"><div>&nbsp;</div></a>

## `Serverless` constructor service configuration dependency

Deprecation code: `MISSING_SERVICE_CONFIGURATION_PATH`

_Note: Applies only to eventual programmatic usage of the Framework_

`Serverless` constructor was refactored to depend on service configuration being resolved externally and passed to its constructor with following options:

- `configuration` - Service configuration (JSON serializable plain object)
- `serviceDir` - Directory in which service is placed (All path references in service configuration will be resolved against this path)
- `configurationFilename` - Name of configuration file (e.g. `serverless.yml`).

Starting from v3.0.0 configuration data will not be resolved internally, and if `Serverless` is invoked in service context, all three options will have to be provided

<a name="VARIABLES_ERROR_ON_UNRESOLVED"><div>&nbsp;</div></a>

## Erroring on unresolved variable references

Deprecation code: `VARIABLES_ERROR_ON_UNRESOLVED`

_Note: Starting with v3.0.0, Serverless Framework will switch exclusively to a new variables resolver. If you see this deprecation please upgrade to latest v2 release of Serverless Framework, as that will provide a more accurate insight on planned changes._

In context of v2 you may adapt old variables resolver so errors on unresolved variables are thrown by adding `unresolvedVariablesNotificationMode: error` to service configuration.

<a name="PROVIDER_IAM_SETTINGS"><div>&nbsp;</div></a>

## Grouping IAM settings under `provider.iam`

Deprecation code: `PROVIDER_IAM_SETTINGS`

_Note: Originally, support for the legacy IAM settings format was scheduled to be dropped in v3. However, it's no longer the case. If you see this deprecation notice please upgrade to the latest version of Serverless Framework v2._

All IAM-related settings of _provider_ including `iamRoleStatements`, `iamManagedPolicies`, `role` and `cfnRole` are also now supported at `iam` property. Refer to the [IAM Guide](/framework/docs/providers/aws/guide/iam.md).

- `provider.role` -> `provider.iam.role`
- `provider.rolePermissionsBoundary` -> `provider.iam.role.permissionsBoundary`
- `provider.iamRoleStatements` -> `provider.iam.role.statements`
- `provider.iamManagedPolicies` -> `provider.iam.role.managedPolicies`
- `provider.cfnRole` -> `provider.iam.deploymentRole`

In addition `iam.role.permissionBoundary` can also be set at `iam.role.permissionsBoundary` (which matches CloudFormation property name).

<a name="AWS_API_GATEWAY_SPECIFIC_KEYS"><div>&nbsp;</div></a>

## API Gateway specific configuration

Deprecation code: `AWS_API_GATEWAY_SPECIFIC_KEYS`

Please use `provider.apiGateway.apiKeys` instead of `provider.apiKeys`.
Please use `provider.apiGateway.resourcePolicy` instead of `provider.resourcePolicy`.
Please use `provider.apiGateway.usagePlan` instead of `provider.usagePlan`.

Starting with v3.0.0, API Gateway-specific configuration keys `apiKeys`, `resourcePolicy` and `usagePlan` will be relocated from `provider` to `provider.apiGateway`.

<a name="PARAMETERIZED_ARGUMENT"><div>&nbsp;</div></a>

## Parameterized `org`, `app`, `service`, `stage`, and `region` usage

Org, app, service, stage, and region are required to resolve variables when logged in, variable resolution will not function without plaintext value. You may override values in `serverless.yml` for `stage` and `region` with command line arguments `--stage` and `--region`. The rest must be plain text.

<a name="LAMBDA_HASHING_VERSION_V2"><div>&nbsp;</div></a>

## Default `provider.lambdaHashingVersion`

Deprecation code: `LAMBDA_HASHING_VERSION_V2`

Lambda version hashes were improved with a more robust algorithm (that fixes determinism issues). It is used by default starting with v3.0.0.

You can either:

- keep using the deprecated algorithm in v3 (easy upgrade),
- or upgrade to the new algorithm (recommended).

Read [the instructions in the v3 upgrade guide](./guides/upgrading-v3.md#lambda-hashing-algorithm).

<a name="LOAD_VARIABLES_FROM_ENV_FILES"><div>&nbsp;</div></a>

## Automatic loading environment variables from .env and .env.{stage} files

Deprecation code: `LOAD_VARIABLES_FROM_ENV_FILES`

Starting with v3.0.0, environment variables will be automatically loaded from `.env` and `.env.{stage}` files if they're present. In addition, `.env` files will be excluded from package in order to avoid uploading sensitive data as a part of the package by mistake.

Adapt to this behavior now by adding `useDotenv: true` to service configuration.

Note that env vars are handled differently than with [serverless-dotenv-plugin](https://github.com/colynb/serverless-dotenv-plugin), check [documentation](/framework/docs/environment-variables/) for more info.

<a name="SERVICE_OBJECT_NOTATION"><div>&nbsp;</div></a>

## `service` property object notation

Deprecation code: `SERVICE_OBJECT_NOTATION`

Starting with v3.0.0, object notation for `service` property will no longer be recognized. Set `service` property directly with service name.

<a name="CLOUDFRONT_CACHE_BEHAVIOR_FORWARDED_VALUES_AND_TTL"><div>&nbsp;</div></a>

## `cloudFront` event `behavior.ForwardedValues` property

Deprecation code: `CLOUDFRONT_CACHE_BEHAVIOR_FORWARDED_VALUES_AND_TTL`

[Cloudfront cache behavior `ForwardedValues`, `MinTTL`, `MaxTTL` and `DefaultTTL` fields are deprecated](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-cloudfront-distribution-distributionconfig.html). We recommend that you use a cache policy instead of this field. Please follow [cache policy documentation](/framework/docs/providers/aws/events/cloudfront.md) for implementation details.

<a name="AWS_API_GATEWAY_NAME_STARTING_WITH_SERVICE"><div>&nbsp;</div></a>

## API Gateway naming will be changed to `${service}-${stage}`

Deprecation code: `AWS_API_GATEWAY_NAME_STARTING_WITH_SERVICE`

_Note_: This deprecation notice has been removed and the behavior won't be enforced with next major. Below you can find original description of the deprecation. You can still continue using `shouldStartNameWithService` property to adapt to the new convention of API Gateway name.

Starting with v3.0.0, API Gateway naming will be changed from `${stage}-${service}` to `${service}-${stage}`.

Adapt to this convention now by setting `provider.apiGateway.shouldStartNameWithService` to `true`.

Eventually if you have a strong reason to stick to current convention, you may ensure it's kept after upgrading by setting: `provider.apiName: ${sls:stage}`

<a name="KINESIS_CONSUMER_NAME_CONTAINING_SERVICE"><div>&nbsp;</div></a>

## Kinesis consumer name will be changed to ensure more uniqueness

Deprecation code: `KINESIS_CONSUMER_NAME_CONTAINING_SERVICE`

Starting with v4.0.0, Kinesis consumer name will be changed. This will lead to downtime during re-deployment. Specifically, the naming pattern will be changed from `${functionName}${streamName}Consumer` to `${functionName}${streamName}${serviceName}${stage}Consumer`.

Adapt to this convention now by setting `provider.kinesis.consumerNamingMode` to `serviceSpecific` in your serverless.yml file.

The consequence for consumer name change is there will be some downtime during deployment between the time the old consumer is deleted and the new consumer is created. While no data is supposed to be lost, there may be a delay in consuming stream data.

<a name="ALEXA_SKILL_EVENT_WITHOUT_APP_ID"><div>&nbsp;</div></a>

## Support for `alexaSkill` event without `appId` is to be removed

Deprecation code: `ALEXA_SKILL_EVENT_WITHOUT_APP_ID`

Starting with v3.0.0, support for `alexaSkill` event without `appId` provided will be removed.

<a name="AWS_KMS_KEY_ARN"><div>&nbsp;</div></a>

## `awsKmsKeyArn` references

Deprecation code: `AWS_KMS_KEY_ARN`

Please use `provider.kmsKeyArn` and `functions[].kmsKeyArn`. `service.awsKmsKeyArn` and `functions[].awsKmsKeyArn` will be removed with v3.0.0

<a name="RESOURCES_EXTENSIONS_REFERENCE_TO_NONEXISTENT_RESOURCE"><div>&nbsp;</div></a>

## Defining extensions to nonexistent resources in `resources.extensions`

Deprecation code: `RESOURCES_EXTENSIONS_REFERENCE_TO_NONEXISTENT_RESOURCE`

_Note: This deprecation was replaced with a thrown error (adding a deprecation here, was a logical error). Please upgrade to latest version of the Framework_

Starting with v3.0.0, extensions to nonexistent resources in `resources.extensions` will throw an error instead of passing silently.

<a name="DISABLE_LOCAL_INSTALLATION_FALLBACK_SETTING"><div>&nbsp;</div></a>

## Support for `enableLocalInstallationFallback` setting is to be removed

Deprecation code: `DISABLE_LOCAL_INSTALLATION_FALLBACK_SETTING`

Starting with v3.0.0, framework will unconditionally run service local installation of `serverless` if it's found.

<a name="LOCAL_INSTALLATION_FALLBACK"><div>&nbsp;</div></a>

## Fallback to a service local `serverless` installation

Deprecation code: `LOCAL_INSTALLATION_FALLBACK`

Starting with v2.0.0, globally installed CLI will by default run (fallback to) service local installation of `serverless` if it's found.

Adapt to this behavior now by adding `enableLocalInstallationFallback: true` to service configuration. Alternatively you may opt-out by setting it to `false` (note that'll be ineffective starting from v3.0.0, where support for this setting will be dropped, and CLI will unconditionally favor locally installed `serverless` installations when found)

<a name="AWS_HTTP_API_TIMEOUT"><div>&nbsp;</div></a>

## AWS HTTP API `timeout`

Deprecation code: `AWS_HTTP_API_TIMEOUT`

`provider.httpApi.timeout` and `functions[].events[].httpApi.timeout` settings will no longer be recognized with v2.0.0.

Endpoints are configured to automatically follow timeout setting as configured on functions (with extra margin needed to process HTTP request on AWS side)

<a name="SLSS_CLI_ALIAS"><div>&nbsp;</div></a>

## `slss` alias

Deprecation code: `SLSS_CLI_ALIAS`

Support for `slss` command will be removed with v2.0.0. Use `sls` or `serverless` instead.

<a name="AWS_FUNCTION_DESTINATIONS_ASYNC_CONFIG"><div>&nbsp;</div></a>

## AWS Lambda Function Destinations `maximumEventAge` & `maximumRetryAttempts`

Deprecation code: `AWS_FUNCTION_DESTINATIONS_ASYNC_CONFIG`

`maximumEventAge` and `maximumRetryAttempts` should be defined directly at function level. Support for those settings on `destinations` level, will be removed with v2.0.0

<a name="AWS_HTTP_API_VERSION"><div>&nbsp;</div></a>

## AWS HTTP API payload format

Deprecation code: `AWS_HTTP_API_VERSION`

Default HTTP API Payload version will be switched to 2.0 with v3 (For more details see [payload format documentation](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html#http-api-develop-integrations-lambda.proxy-format)).

Configure `httpApi.payload` explicitly to ensure seamless migration.

<a name="OUTDATED_NODEJS"><div>&nbsp;</div></a>

## Outdated Node.js version

Deprecation code: `OUTDATED_NODEJS`

Support for Node.js v8 was dropped with v2 release, while support for Node.js v10 will be dropped with v3 release

Ensure to rely on at least Node.js v12 (It's recommended to use LTS version, as listed at https://nodejs.org/en/)

<a name="AWS_ALB_ALLOW_UNAUTHENTICATED"><div>&nbsp;</div></a>

## AWS ALB `allowUnauthenticated`

Deprecation code: `AWS_ALB_ALLOW_UNAUTHENTICATED`

Please use `onUnauthenticatedRequest` instead. `allowUnauthenticated` will be removed with v2.0.0

<a name="BIN_SERVERLESS"><div>&nbsp;</div></a>

## `bin/serverless`

Deprecation code: `BIN_SERVERLESS`

Please use `bin/serverless.js` instead. `bin/serverless` will be removed with v2.0.0
