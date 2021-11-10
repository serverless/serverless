<!--
title: Service configuration validation
menuText: Service configuration validation
layout: Doc
-->

# Service configuration validation

The framework validates service configuration with the help of [AJV](https://ajv.js.org/) (JSON-schema validation engine).

If you were presented with configuration error (or a warning, depending on `configValidationMode` setting) it could mean that:

- Service configuration is invalid and you need to correct an issue related to your serverless.yml
- Configuration related to external plugin does not have an associated JSON Schema. In such cases, please report the issue with the plugin author and provide them the details on how to [extend validation schema](/framework/docs/providers/aws/guide/plugins/) in order to permanently correct the issue.
- However unlikely, there may be a bug (or missing) schema configuration for the framework. If you believe this to be the case please report at [https://github.com/serverless/serverless/issues/new](https://github.com/serverless/serverless/issues/new?template=bug_report.md)

**Note**: In a warning mode (with `configValidationMode: warn` set in configuration) Framework commands are not blocked in any way, e.g. `sls deploy` will still attempt to deploy the service normally (still depending on the source of the warning, success of a deployment may vary)

If you find this functionality problematic, you may also turn it off with `configValidationMode: off` setting.

## Supported Values
| Value | Effect                                                                                                                  |
|-------|-------------------------------------------------------------------------------------------------------------------------|
| error | Print configuration errors and fail packaging and.                                                                      |
| warn  | Print a warning about configuration erors and package. This is the default value if `configValidationMode` is undefined.|
| off   | Silently ignore configuration errors and package.                                                                       |
