## Overview

This document provides guidelines for running unit and integration tests.

## Unit Tests

Unit tests run without external dependencies and are located in each package's test directory.

## Integration Tests

Integration tests require a predefined AWS, Serverless Dashboard, and Terraform Cloud setup. They run in CI only.

### Running All Integration Tests

```sh
npm test -w @serverlessinc/sf-core
```

### Running Specific Test Suites

You can run specific test suites using scripts from `packages/sf-core/package.json`. For example:

```sh
npm run test:resolvers -w @serverlessinc/sf-core
```

## Test Environment Setup

### Required Environment Variables

The following environment variables need to be set before running the tests:

```sh
export SERVERLESS_LICENSE_KEY_DEV="your-license-key"
export SERVERLESS_ACCESS_KEY_DEV="your-access-key"
```

### AWS Prerequisites

The integration tests require specific AWS resources, including:

#### SSM Parameters

##### us-east-1

- `/resolvers/sample-param` (String): `ssm-value`
- `/resolvers/sample-secure-param` (SecureString): `ssm-value`
- `/resolvers/sample-list-param` (StringList): `foo,bar`
- `/resolvers/sample-json-param` (SecureString): `{ "foo": "bar" }`
- `/resolvers/object-secure-param` (SecureString): `{ "objectKey": "objectValue" }`
- `/serverless-framework/license-key-serverlesstestaccount` (SecureString): `your-license-key`
- `/resolvers/terraform-hcp-token` (String): `your-terraform-hcp-token`

##### eu-west-1

- `/resolvers/sample-param` (String): `ssm-value`
- `/resolvers/sample-secure-param-eu-west-1` (SecureString): `ssm-value`

#### AWS Secrets Manager Secrets

##### us-east-1

- `resolvers/sample-secret`:

```json
{
  "num": 1,
  "str": "secret",
  "arr": [true, false]
}
```

#### AWS S3 Buckets

- `serverless-compose-state-bucket-integration-test`
  - Versioning enabled
- `terraform-s3-resolver-test-bucket`
  - Versioning enabled
- `resolvers-integration-test`
  - File: `test.txt`
  - Content: `file content`

#### AWS DynamoDB Tables

##### us-east-1

- `terraform-s3-resolver-test-lock-table`
  - Primary Key: `LockID` (String)

#### AWS CloudFormation Stacks

##### us-east-1

- `sfc-nodejs-resolvers-integration-test`
  - `ServerlessDeploymentBucketName`: `sfc-nodejs-resolvers-inte-serverlessdeploymentbuck-6vskiu5gzt1u`
  - `Function1LambdaFunctionQualifiedArn`: `arn:aws:lambda:us-east-1:762003938904:function:sfc-nodejs-resolvers-integration-test-function1:1`

##### eu-west-1

- `sfc-nodejs-resolvers-integration-test`
  - `ServerlessDeploymentBucketName`: `sfc-nodejs-resolvers-inte-serverlessdeploymentbuck-vky0nzemsvvr`
  - `Function1LambdaFunctionQualifiedArn`: `arn:aws:lambda:eu-west-1:762003938904:function:sfc-nodejs-resolvers-integration-test-function1:1`

### Serverless Dashboard Prerequisites

#### Service `resolvers-custom-test`:

- Dashboard Parameters
  - `dashboard-param`: `dashboard-value`

#### Service `resolver-output-producer`:

- Dashboard Outputs

```yaml
outputs:
  str: string-value
  num: 42
  obj:
    foo: bar
```

### Terraform Cloud Prerequisites

- `serverlesstestaccount` organization
- `serverless-test-01` workspace

## Troubleshooting

For any issues, refer to the `tests/integration/` directory for test implementations and configurations.
