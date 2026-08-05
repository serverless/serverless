# MCP auth-chain Cognito prerequisite

A predeployed Cognito user pool that backs the MCP property's live auth-chain
suite (`../mcp/mcp-auth.test.js`). It is a **persistent, per-account
prerequisite**: deploy it once with plain CloudFormation and leave it standing —
the suite discovers everything it needs from SSM at runtime, so no ids are
hardcoded and the suite skips cleanly in any account that lacks it.

## What it provisions

- A **Lite-tier** user pool (no token customization needed — the entry's
  aud-else-client_id rule verifies raw Cognito access tokens, which carry
  `client_id` and no `aud`, as-is).
- A **user pool domain** (`mcp-integration-test-<account-id>`), which serves the
  `/oauth2/token` endpoint the suite mints tokens against.
- A **resource server** `mcp` with one custom scope `invoke` → full scope
  string `mcp/invoke`.
- **Two** app clients, both `client_credentials` M2M clients with a generated
  secret and the `mcp/invoke` scope:
  - **Client A** — the authorized client; its id is the audience the fixture is
    deployed with, so its tokens pass verification.
  - **Client B** — same issuer, different id; exists only to mint the
    wrong-client token the suite expects a `401` for.

It publishes eight **SecureString** SSM parameters under
`/mcp-integration-test/cognito/` (`poolId`, `domain`, `region`, `clientAId`,
`clientASecret`, `clientBId`, `clientBSecret`, `scope`) via a small custom
resource — CloudFormation's native `AWS::SSM::Parameter` cannot create
SecureString parameters. The non-secret values are also stack Outputs; the
client secrets are **only** in SSM, never in Outputs.

The custom resource's function is named `<stack-name>-ssm-writer` with its log
group declared in the template, so its role's write access is limited to that one
log group and to `<SsmPrefix>/*` — nothing account-wide. Both go away with the
stack.

A role that can read `/mcp-integration-test/cognito/` is the only permission the
suite itself needs. The suite skips only when the prefix is genuinely unavailable
(empty, incomplete, or no credentials at all); a read that is denied, throttled,
or times out fails the job rather than skipping — those mean broken CI, not an
opted-out account.

## Two hosts, do not conflate

- **Issuer** (token validation, `MCP_TEST_AUTH_ISSUER`):
  `https://cognito-idp.<region>.amazonaws.com/<poolId>` — where the entry's
  verifier fetches OIDC discovery + JWKS.
- **Token endpoint** (minting):
  `https://<domain>.auth.<region>.amazoncognito.com/oauth2/token`.

`MCP_TEST_AUTH_AUDIENCE` is client A's id (Cognito access tokens have no `aud`;
the entry falls back to `client_id`).

## Deploy (once per account)

From this directory — the `template.yml` here routes `serverless deploy` to the
framework's CloudFormation runner, which passes the IAM capabilities itself:

```sh
serverless deploy --stack mcp-integration-test-cognito --region us-east-1
```

Re-running the same command on an account that already has the stack is safe: it
replaces the writer function with the named one above and rewrites the same eight
parameters. The auto-named log group an earlier version created is not adopted by
the stack, so delete it by hand if you care
(`/aws/lambda/<stack>-SsmWriterFunction-*`).

Cost is effectively zero: Cognito's per-M2M-client fee was removed (Nov 2025);
what remains is $0.00225 per 1,000 token requests, so even at 1,000 CI runs/month
it is ~$0.014/month, and the idle pool is $0 at ~0 MAU.

## Verify

```sh
serverless info --stack mcp-integration-test-cognito --region us-east-1
aws ssm get-parameters-by-path --path /mcp-integration-test/cognito \
  --with-decryption --region us-east-1 --query 'Parameters[].Name'
```

## Tear down / migrate

To move the prerequisite to another account (e.g. a CI account), deploy the same
template there and delete it here:

```sh
serverless remove --stack mcp-integration-test-cognito --region us-east-1
```

Deleting the stack removes the eight SSM parameters too (the custom resource
cleans them up on delete).
