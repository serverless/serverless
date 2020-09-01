<!--
title: Serverless Framework Deprecations
menuText: Deprecations
layout: Doc
-->

# Serverless Framework Deprecations

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

It appears you rely on no longer maintained Node.js version.

Please upgrade to use at least Node.js v10 (It's recommended to use LTS version, as listed at https://nodejs.org/en/)

<a name="AWS_ALB_ALLOW_UNAUTHENTICATED"><div>&nbsp;</div></a>

## AWS ALB `allowUnauthenticated`

Please use `onUnauthenticatedRequest` instead. `allowUnauthenticated` will be removed with v2.0.0

<a name="BIN_SERVERLESS"><div>&nbsp;</div></a>

## `bin/serverless`

Please use `bin/serverless.js` instead. `bin/serverless` will be removed with v2.0.0
