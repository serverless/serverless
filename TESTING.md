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

In CI the suites are split into one shard per test account; see
[CI Test Accounts](#ci-test-accounts).

Note: this excludes two suites.

- `domains` — runs only via `npm run test:domains -w @serverlessinc/sf-core`.
- `mcp` (MCP Servers) — runs only via `npm run test:mcp -w @serverlessinc/sf-core`, which the path-filtered `CI: MCP Servers` workflow invokes when MCP-relevant paths change. It deploys real REST APIs, which is why it is kept off unrelated pull requests. Only its enforcement-and-discovery suite (`mcp-auth.test.js`) needs the Cognito prerequisite below — without it that suite skips with a log while the rest still runs.

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

##### us-east-2

- `/serverless-framework/license-key` (SecureString): `your-license-key`. The `license-key` suite creates it if it's missing and overwrites it on every run, so it doesn't need creating by hand.

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
  - Holds the state written by `packages/sf-core/tests/integration/resolvers/terraform/s3-output/terraform-setup/main.tf` at key `terraform-s3-resolver-test-state/tfstate` (`terraform init && terraform apply` in that directory); the suite expects the outputs `key-1-id` and `key-2-id`
- `resolvers-integration-test`
  - File: `test.txt`
  - Content: `file content`
- `sam-integration-tests-existing-bucket`
  - Artifact bucket the `sam/sam-existing` suite deploys through (`s3_bucket` in its `samconfig.toml`)

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

#### Cognito Prerequisite (MCP enforcement suite)

##### us-east-1

`tests/integration/mcp/mcp-auth.test.js` covers the two things the `mcp`
property does about authentication — and it does not do authentication.
Enforcement belongs to the user, so the suite deploys one server per way access
to an MCP route can be controlled and asserts what the **gateway** does with
each:

- a **Cognito user pool authorizer** (`authorizer: { arn, scopes }`), driven
  with a real access token minted from the prerequisite pool below — the reason
  the prerequisite exists at all;
- a **TOKEN** Lambda authorizer and a **REQUEST** Lambda authorizer, both
  checking a per-run shared secret, pinning the exact `401` +
  `{"message":"Unauthorized"}` API Gateway answers a refusal with;
- a server with **no `authorizer` configured**, which also re-gates ordinary
  streaming and the body-less `202` a JSON-RPC notification is answered with;
- the **`oauthDiscovery`** document served from an API Gateway MOCK route:
  its exact body, its CORS headers, and the property that matters —
  it is readable by exactly the unauthenticated client the server route rejects.

A rejected request is proved not to have reached the function, from CloudWatch
rather than from the status code, which is what makes "the Framework verifies
nothing" an observed fact.

The pool is a predeployed Cognito user pool defined by
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
`scope`). The suite discovers them at runtime (no ids hardcoded), derives the
pool ARN from `poolId` and the caller's own account, and deploys the fixture's
Cognito-protected server with the `mcp/invoke` scope — which is what makes API
Gateway validate the pool's **access** tokens rather than identity tokens.

It **skips with a clear message** when the prerequisite is genuinely absent —
nothing or only some of the parameters under the prefix, or no credentials at
all — so it never hard-fails an account that lacks it. Any other read failure
(denied, throttled, expired credentials, network) **fails** instead of skipping:
those are reads that should have worked, and a silent skip there would report
enforcement as covered when nothing ran. Cost is ~$0.014/month even at 1,000 CI
runs. See `tests/integration/mcp-cognito-prerequisite/README.md` for details and
teardown.

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
(`role-to-assume` in `.github/workflows/ci-*.yml`). There are three test
accounts, test-1 to test-3, and each role ARN is a repository variable
(`TEST1_ROLE_ARN` to `TEST3_ROLE_ARN`).

### Integration Shards

The unit tests and integration suites are defined once, in
`.github/workflows/test-framework.yml`, which only runs when another workflow
calls it. `CI: Framework CLI` calls it on Linux, and `Release: Framework CLI`
calls it on Linux, ARM Linux and Windows. Each platform runs the integration
suites as one matrix leg per account, plus a leg for the resolvers suite.
Separate runners share the work, and AWS API rate limits are isolated per
account instead of shared by every suite in one run. Shard N runs in test-N.

To run the release's platforms from a branch before merging, dispatch
`CI: Framework CLI` with `all-platforms` set. That workflow has no release
jobs, so nothing is published:

```sh
gh workflow run ci-framework.yml --ref <branch> -f all-platforms=true
```

`packages/sf-core/tests/integration/shards.json` decides which suites run in
which shard. The Jest sequencer in `tests/integration/sequencer.cjs` reads it
when `npm test` is given `--shard=N/3`, and starts each shard's longest suites
first. Without `--shard`, `npm test` runs every suite, longest first.

Each entry records a shard and the suite's duration in seconds:

```json
"tests/integration/simple-nodejs/simple-nodejs.test.js": {
  "shard": 2,
  "seconds": 62
},
"tests/integration/simple-compose/simple-compose.test.js": {
  "shard": 1,
  "seconds": 203,
  "pin": "serverless-compose-state-bucket-integration-test prerequisite"
}
```

- Only test-1 holds the prerequisites listed above. A suite that needs one
  stays in shard 1 and names the reason in `pin`. A unit test rejects a pinned
  suite in any other shard.
- A new suite needs an entry. A unit test fails until it has one, and until
  then the suite runs in shard 1, where every prerequisite exists.
- To rebalance, copy the durations from the `PASS ... (N s)` lines of a recent
  run into `seconds`, then move unpinned suites so the shard totals are
  similar. A shard ends when its longest suite does, so the totals only need
  to be roughly even.

`CI: MCP Servers` runs its suite in a single leg in test-2. The suite is
self-contained and behaves identically in any bootstrapped account, so a
second leg would duplicate rather than parallelize.

### Leftovers from Interrupted Runs

Each suite removes what it deploys, but a cancelled or failed run can leave
stacks and state-bucket keys behind. `Cleanup: Test Accounts`
(`.github/workflows/cleanup-test-accounts.yml`) reports them every night, for
each test account:

- stacks whose names match the suites' CI naming, untouched for at least a day;
- keys in the account's default state bucket whose test stack no longer exists.

It's a dry run and deletes nothing. The matching rules are in
`packages/sf-core/scripts/test-account-cleanup/rules.js`, and a unit test fails
if a fixture's stack name stops matching them. They match only the stage
formats CI has produced since early 2025; stacks from older formats need
removing by hand. One bucket holds the state keys of stacks in every region,
so each key is checked against the stacks of its own region. If AWS returns an
error, the report prints the step and the error type only, because AWS error
messages can include the account ID. To see the report for an account
locally, run it with that account's credentials:

```sh
cd packages/sf-core
node scripts/test-account-cleanup/report.js --regions us-east-1,us-east-2,eu-west-1
```

### Bootstrapping an Account

Adding an account for CI is a per-account, human-run job in three parts:

1. **The OIDC provider and the deployment role** are provisioned internally by
   the maintainers. Once an account is ready, its role ARN is supplied to the
   workflows as a repository variable rather than committed here.
2. **The default deployment and state buckets.** The Framework creates these
   on first use. Create them once, one deploy at a time, before the account
   joins the matrix. With the new account's credentials:

   ```sh
   export AWS_REGION=us-east-1 TEST_STAGE=boot
   npm run test:simple:nodejs -w @serverlessinc/sf-core -- --runInBand
   npm run test:compose:subset -w @serverlessinc/sf-core -- --runInBand
   ```

3. **The prerequisites from this file that the account's suites need.** Suites
   pinned to shard 1 need test-1's, and the MCP enforcement suite needs the
   Cognito user pool. A suite whose prerequisite is missing in its account
   either fails or, in the MCP enforcement suite's case, skips, reporting green
   over coverage that never ran.

## Other Test Suites

- `npm test -w @serverless/engine` — engine unit tests
- `npm test -w @serverless/mcp` — MCP server tests (not run by any CI workflow)
- `npm run test:python -w @serverlessinc/sf-core` — Python plugin tests (covered by the `CI: Python Requirements` workflow)
- `npm run test:build -w @serverlessinc/sf-core` — builds and packs the release package locally, then runs the packaging checks in `packages/sf-core/scripts/verify-release-package.sh` (the same checks the `Test: Release Package` CI job and the release run)

## Troubleshooting

For any issues, refer to the `packages/sf-core/tests/integration/` directory for test implementations and configurations.
