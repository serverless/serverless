<!--
title: Serverless Framework Deprecations
menuText: Deprecations
layout: Doc
-->

# Serverless Framework Deprecations

<a name="RESOURCES_EXTENSIONS_REFERENCE_TO_NONEXISTENT_RESOURCE"><div>&nbsp;</div></a>

## Defining extensions to nonexistent resources in `resources.extensions`

Starting with v3.0.0, extensions to nonexistent resources in `resources.extensions` will throw an error instead of passing silently.

<a name="DISABLE_LOCAL_INSTALLATION_FALLBACK_SETTING"><div>&nbsp;</div></a>

## Support for `enableLocalInstallationFallback` setting is to be removed

Starting with v3.0.0, framework will unconditionally run service local installation of `serverless` if its found.

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

## awsKmsKeyArn references

Plase use `provider.kmsKeyArn` and `functions[].kmsKeyArn`. `service.awsKmsKeyArn` and `functions[].awsKmsKeyArn` will be removed with v3.0.0
