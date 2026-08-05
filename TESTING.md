## Overview

This document provides guidelines for running unit and integration tests.

## Unit Tests

Unit tests run without external dependencies and are located in each package's test directory.

## Integration Tests

Integration tests require a predefined AWS, Serverless Dashboard, and Terraform Cloud setup. They run automatically in CI on pull requests, and can also be run locally given the setup described below.

### Running All Integration Tests

```sh
npm test -w @serverlessinc/sf-core
```

Note: this excludes two suites.

- `domains` — runs only via `npm run test:domains -w @serverlessinc/sf-core`.
- `mcp` (MCP Servers) — runs only via `npm run test:mcp -w @serverlessinc/sf-core`, which the path-filtered `CI: MCP Servers` workflow invokes when MCP-relevant paths change. It deploys real REST APIs, which is why it is kept off unrelated pull requests. Only its auth-chain suite (`mcp-auth.test.js`) needs the Cognito prerequisite below — without it that suite skips with a log while the rest still runs.

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

#### Cognito Prerequisite (MCP auth-chain suite)

##### us-east-1

The MCP servers' auth-chain suite (`tests/integration/mcp/mcp-auth.test.js`)
verifies bearer-token enforcement against a real OIDC issuer. That issuer is a
predeployed Cognito user pool defined by
`tests/integration/mcp-cognito-prerequisite/template.yml` — a **persistent,
one-time, per-account** prerequisite. The framework deploys it directly: a
directory holding a `template.yml` routes `serverless deploy` to the
CloudFormation runner, which passes the IAM capabilities itself:

```sh
cd packages/sf-core/tests/integration/mcp-cognito-prerequisite
serverless deploy --stack mcp-integration-test-cognito --region us-east-1
```

It provisions a Lite-tier user pool, a domain, an `mcp` resource server with an
`invoke` scope, and two `client_credentials` app clients, then publishes eight
**SecureString** parameters under `/mcp-integration-test/cognito/` (`poolId`,
`domain`, `region`, `clientAId`, `clientASecret`, `clientBId`, `clientBSecret`,
`scope`). The suite discovers them at runtime (no ids hardcoded) and **skips
with a clear message** when the prerequisite is genuinely absent — nothing or
only some of the parameters under the prefix, or no credentials at all — so it
never hard-fails an account that lacks it. Any other read failure (denied,
throttled, expired credentials, network) **fails** instead of skipping: those are
reads that should have worked, and a silent skip there would report the auth
chain as covered when nothing ran. Cost is
~$0.014/month even at 1,000 CI runs. See
`tests/integration/mcp-cognito-prerequisite/README.md` for details and teardown.

The rest of the MCP suite (`tests/integration/mcp/mcp.test.js`) needs no
prerequisite. Both files run from `npm run test:mcp`, each off its own fixture
directory (`fixture/` and `fixture-auth/`) so they stay parallel-safe.

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

## CI Test Accounts

CI never uses long-lived AWS keys: each workflow assumes
`GithubActionsDeploymentRole` in a test account through GitHub's OIDC provider
(`role-to-assume` in `.github/workflows/ci-*.yml`).

Most integration suites run in one account, which holds every prerequisite
listed above. Additional accounts exist to spread the suites out: separate
runners break the single-runner ceiling, and AWS API rate limits are isolated
per account instead of shared by every suite in one run. The MCP suite is the
first to move — it runs in a second account, because standing up whole REST
APIs alongside the other suites is what makes those limits bite.

Bootstrapping an additional account for CI is a two-part, human-run job, and
both parts are per-account:

1. **The OIDC provider and the deployment role** are provisioned internally by
   the maintainers. Once an account is ready, its role ARN is supplied to the
   workflows as a repository variable (see the matrix comments in
   `.github/workflows/ci-mcp.yml`) rather than committed here.
2. **The prerequisites this file documents** — SSM parameters, secrets, buckets,
   tables, stacks and the Cognito user pool exist per account. A suite whose
   prerequisite is missing in the account it runs in either fails or, in the MCP
   auth-chain suite's case, skips — reporting green over coverage that never ran.

`CI: MCP Servers` shows the shape: a one-leg matrix naming its account, with
the role ARN in a repository variable. The suite is self-contained and behaves
identically in any bootstrapped account, so running it in more than one would
duplicate rather than parallelize — the gain comes from each suite having an
account to itself, which is a leg plus a variable for the next one to move.

## Other Test Suites

- `npm test -w @serverless/engine` — engine unit tests
- `npm test -w @serverless/mcp` — MCP server tests (not run by any CI workflow)
- `npm run test:python -w @serverlessinc/sf-core` — Python plugin tests (covered by the `CI: Python Requirements` workflow)
- `npm run test:build -w @serverlessinc/sf-core` — packaging/distribution smoke test

## Troubleshooting

For any issues, refer to the `packages/sf-core/tests/integration/` directory for test implementations and configurations.
