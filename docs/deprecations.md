<!--
title: Serverless Framework Deprecations
menuText: Deprecations
layout: Doc
-->

# Serverless Framework Deprecations

<a name="LOAD_VARIABLES_FROM_ENV_FILES"><div>&nbsp;</div></a>

## Automatic loading environment variables from .env and .env.{stage} files

Starting with v3.0.0, environment variables will be automatically loaded from `.env` and `.env.{stage}` files if they're present.

Adapt to this behavior now by adding `useDotenv: true` to service configuration.

Note that env vars are handled differently than with [serverless-dotenv-plugin](https://github.com/colynb/serverless-dotenv-plugin), check [documentation](/framework/docs/environment-variables/) for more info.

<a name="SERVICE_OBJECT_NOTATION"><div>&nbsp;</div></a>

## `service` property object notation

Starting with v3.0.0, object notation for `service` property will no longer be recognized. Set `service` property directly with service name.

<a name="CLOUDFRONT_CACHE_BEHAVIOR_FORWARDED_VALUES_AND_TTL"><div>&nbsp;</div></a>

## `cloudFront` event `behavior.ForwardedValues` property

[Cloudfront cache behavior `ForwardedValues`, `MinTTL`, `MaxTTL` and `DefaultTTL` fields are deprecated](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-cloudfront-distribution-distributionconfig.html). We recommend that you use a cache policy instead of this field. Please follow [cache policy documentation](/framework/docs/providers/aws/events/cloudfront.md) for implementation details.

<a name="AWS_API_GATEWAY_NAME_STARTING_WITH_SERVICE"><div>&nbsp;</div></a>

## API Gateway naming will be changed to `${service}-${stage}`

Starting with v3.0.0, API Gateway naming will be changed from `${stage}-${service}` to `${service}-${stage}`.

Adapt to this convention now by setting `provider.apiGateway.shouldStartNameWithService` to `true`.

Eventually if you have a strong reason to stick to current convention, you may ensure it's kept after upgrading by setting: `provider.apiName: ${opt:stage, self:provider.stage, 'dev'}`

<a name="ALEXA_SKILL_EVENT_WITHOUT_APP_ID"><div>&nbsp;</div></a>

## Support for `alexaSkill` event without `appId` is to be removed

Starting with v3.0.0, support for `alexaSkill` event without `appId` provided will be removed.

<a name="RESOURCES_EXTENSIONS_REFERENCE_TO_NONEXISTENT_RESOURCE"><div>&nbsp;</div></a>

## Defining extensions to nonexistent resources in `resources.extensions`

Starting with v3.0.0, extensions to nonexistent resources in `resources.extensions` will throw an error instead of passing silently.

<a name="DISABLE_LOCAL_INSTALLATION_FALLBACK_SETTING"><div>&nbsp;</div></a>

## Support for `enableLocalInstallationFallback` setting is to be removed

Starting with v3.0.0, framework will unconditionally run service local installation of `serverless` if it's found.

<a name="LOCAL_INSTALLATION_FALLBACK"><div>&nbsp;</div></a>

## Fallback to a service local `serverless` installation

Starting with v2.0.0, globally installed CLI will by default run (fallback to) service local installation of `serverless` if it's found.

Adapt to this behavior now by adding `enableLocalInstallationFallback: true` to service configuration. Alternatively you may opt-out by setting it to `false` (note that'll be ineffective starting from v3.0.0, where support for this setting will be dropped, and CLI will unconditionally favor locally installed `serverless` installations when found)

<a name="AWS_HTTP_API_TIMEOUT"><div>&nbsp;</div></a>

## AWS HTTP API `timeout`

`provider.httpApi.timeout` and `functions[].events[].httpApi.timeout` settings will no longer be recognized with v2.0.0.

Endpoints are configured to automatically follow timeout setting as configured on functions (with extra margin needed to process HTTP request on AWS side)

<a name="SLSS_CLI_ALIAS"><div>&nbsp;</div></a>

## `slss` alias

Support for `slss` command will be removed with v2.0.0. Use `sls` or `serverless` instead.

<a name="AWS_FUNCTION_DESTINATIONS_ASYNC_CONFIG"><div>&nbsp;</div></a>

## AWS Lambda Function Destinations `maximumEventAge` & `maximumRetryAttempts`

`maximumEventAge` and `maximumRetryAttempts` should be defined directly at function level. Support for those settings on `destinations` level, will be removed with v2.0.0

<a name="AWS_HTTP_API_VERSION"><div>&nbsp;</div></a>

## AWS HTTP API payload format

Default HTTP API Payload version will be switched to 2.0 with next major release (For more details see [payload format documentation](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html#http-api-develop-integrations-lambda.proxy-format))

Configure `httpApi.payload` explicitly to ensure seamless migration.

<a name="OUTDATED_NODEJS"><div>&nbsp;</div></a>

## Outdated Node.js version

Support for Node.js v6 and v8 will be dropped with v2.0.0 release

Ensure to rely on at least Node.js v10 (It's recommended to use LTS version, as listed at https://nodejs.org/en/)

<a name="AWS_ALB_ALLOW_UNAUTHENTICATED"><div>&nbsp;</div></a>

## AWS ALB `allowUnauthenticated`

Please use `onUnauthenticatedRequest` instead. `allowUnauthenticated` will be removed with v2.0.0

<a name="BIN_SERVERLESS"><div>&nbsp;</div></a>

## `bin/serverless`

Please use `bin/serverless.js` instead. `bin/serverless` will be removed with v2.0.0

<a name="AWS_KMS_KEY_ARN"><div>&nbsp;</div></a>

## `awsKmsKeyArn` references

Please use `provider.kmsKeyArn` and `functions[].kmsKeyArn`. `service.awsKmsKeyArn` and `functions[].awsKmsKeyArn` will be removed with v3.0.0
