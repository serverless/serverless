<!--
title: Service configuration validation
menuText: Service configuration validation
layout: Doc
-->

# Service configuration validation

The framework validates service configuration with the help of [AJV](https://ajv.js.org/) (JSON-schema validation engine).

If you received a configuration warning it could mean that:

- Service configuration is invalid and you need to correct an issue related to your serverless.yml
- Configuration related to external plugin does not have an associated JSON Schema. In such cases, please report the issue with the plugin author and provide them the details on how to [extend validation schema](/framework/docs/providers/aws/guide/plugins/) in order to permanently correct the issue.
- However unlikely, there may be a bug (or missing) schema configuration for the framework. If you believe this to be the case please report at [https://github.com/serverless/serverless/issues/new](https://github.com/serverless/serverless/issues/new?template=bug_report.md)

**Note**: A configuration warning doesn't block framework commands in any way by default (e.g. `sls deploy` will still attempt to deploy the service). If you wish all deployments to be blocked if there is a configuarion warning, add `configValidationMode: error` to your serverless.yml, so the command is not processed further (it is likely to become a default setting in future)

If you find this functionality problematic, you may also turn it off with `configValidationMode: off` setting.
