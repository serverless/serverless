<!--
title: Service configuration validation
menuText: Service configuration validation
layout: Doc
-->

# Service configuration validation

Framework validates service configuration with help of [AJV](https://ajv.js.org/) (JSON-schema validation engine).

If you approached a configuration warning it means that either:

- Service configuration is invalid (in sense that it doesn't resemble supported configuration structure)
- Configuration related to external plugin is not backed by JSON Schema.
  In such case please report at plugin repository so JSON schema for its properties is provided. See [Extending validation schema](/framework/docs/providers/aws/guide/plugins/) section on how schema can be extended.
- Unlikely, there's a bug (or missing) in schema configuration. In such case please report at [https://github.com/serverless/serverless/issues/new](https://github.com/serverless/serverless/issues/new?template=bug_report.md)

**Note**: Configuration warning doesn't stop Framework command in any way (e.g. `sls deploy` will still attempt to deploy the service). To avoid that it is recommended to add `configValidationMode: error` to service configuration, so command is not processed further if error is approached (it is likely to become a default setting in a future)

If you find this functionality problematic, you may also turn it off with `configValidationMode: off` setting.
