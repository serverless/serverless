/**
 * Reads the predeployed Cognito M2M prerequisite from SSM and mints
 * `client_credentials` access tokens against its hosted-UI token endpoint.
 *
 * The prerequisite is `tests/integration/mcp-cognito-prerequisite/template.yml`,
 * deployed once per account with `aws cloudformation deploy` and documented in
 * TESTING.md. It writes eight SecureString parameters under a fixed prefix
 * (pool id, domain, region, both client ids/secrets, and the scope string); this
 * module discovers them at runtime so no ids are hardcoded — the SSM-read shape
 * mirrors the terraform-hcp-token precedent
 * (`resolvers/terraform/remote-output/terraform-remote-output.test.js`).
 *
 * Two hosts are involved and must not be conflated:
 *   - the ISSUER (token validation) is
 *     `https://cognito-idp.<region>.amazonaws.com/<poolId>` — where the entry's
 *     verifier fetches OIDC discovery + JWKS; this is `MCP_TEST_AUTH_ISSUER`.
 *   - the TOKEN ENDPOINT (minting) is
 *     `https://<domain>.auth.<region>.amazoncognito.com/oauth2/token`.
 *
 * Cognito access tokens carry `client_id`, not `aud`, so under the entry's
 * aud-else-client_id rule the audience the fixture verifies against is client
 * A's id (`MCP_TEST_AUTH_AUDIENCE`): A's tokens pass, B's tokens 401.
 */
import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm'

export const DEFAULT_PREFIX = '/mcp-integration-test/cognito'
export const DEFAULT_REGION = 'us-east-1'

// The eight SecureString parameters the prerequisite stack writes. All must be
// present for the prerequisite to be considered deployed.
const REQUIRED_KEYS = [
  'poolId',
  'domain',
  'region',
  'clientAId',
  'clientASecret',
  'clientBId',
  'clientBSecret',
  'scope',
]

// The allow-list of SSM read failures that mean "the prerequisite is not
// available here" rather than "the read broke". Deliberately an allow-list: a new
// failure shape defaults to throwing, because a silent skip in the one workflow
// meant to guarantee auth coverage is worse than a loud failure.
//   - `ParameterNotFound` — the prefix does not exist (SSM).
//   - `CredentialsProviderError` — the credential chain could not produce
//     credentials at all (@smithy/core, surfaced through every @aws-sdk client).
// Expired or denied credentials are NOT here: those are configured accounts whose
// read failed, and they must fail the job.
const SKIPPABLE_ERROR_NAMES = new Set([
  'ParameterNotFound',
  'CredentialsProviderError',
])

export const issuerOf = ({ region, poolId }) =>
  `https://cognito-idp.${region}.amazonaws.com/${poolId}`

export const tokenEndpointOf = ({ domain, region }) =>
  `https://${domain}.auth.${region}.amazoncognito.com/oauth2/token`

/**
 * POSTs `grant_type=client_credentials` with HTTP Basic auth and returns the
 * access token. Kept to `fetch` and nothing else so the request shape — URL,
 * Basic-auth header, form body — is unit-testable against a stubbed global fetch
 * (`tests/unit/mcp/cognito.test.js`), no network and no live pool.
 */
export const mintToken = async ({
  tokenEndpoint,
  clientId,
  clientSecret,
  scope,
}) => {
  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${Buffer.from(
        `${clientId}:${clientSecret}`,
      ).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope,
    }).toString(),
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = {}
  }
  if (!res.ok || !json.access_token) {
    throw new Error(
      `Cognito token mint failed (HTTP ${res.status}): ${text.slice(0, 300)}`,
    )
  }
  return json.access_token
}

/**
 * Reads the prerequisite from SSM. Returns `null` only when the prerequisite is
 * genuinely absent — the prefix holds nothing or only some of the parameters, or
 * the environment has no credentials at all — so an account that opted out skips
 * with a clear message instead of hard-failing.
 *
 * Every other read failure throws. A throttled call, expired credentials, a
 * network timeout or a role that cannot read the prefix are all reads that should
 * have worked, and swallowing them would report the auth coverage this suite
 * exists to guarantee while never having run it.
 *
 * On success the returned object carries the raw values, the derived `issuer` /
 * `tokenEndpoint` / `audience`, and two zero-argument minters.
 *
 * `ssm` is injectable so this skip/throw split is unit-testable with no network
 * and no live pool (`tests/unit/mcp/cognito.test.js`).
 */
export const readCognitoPrerequisite = async ({
  region = DEFAULT_REGION,
  prefix = DEFAULT_PREFIX,
  ssm = new SSMClient({ region }),
} = {}) => {
  const values = {}
  try {
    let nextToken
    do {
      const out = await ssm.send(
        new GetParametersByPathCommand({
          Path: prefix,
          WithDecryption: true,
          NextToken: nextToken,
        }),
      )
      for (const p of out.Parameters ?? []) {
        values[p.Name.slice(prefix.length + 1)] = p.Value
      }
      nextToken = out.NextToken
    } while (nextToken)
  } catch (error) {
    if (!SKIPPABLE_ERROR_NAMES.has(error.name)) throw error
    return null
  }

  if (REQUIRED_KEYS.some((key) => !values[key])) return null

  const issuer = issuerOf(values)
  const tokenEndpoint = tokenEndpointOf(values)
  const mint = (clientId, clientSecret) => () =>
    mintToken({ tokenEndpoint, clientId, clientSecret, scope: values.scope })

  return {
    ...values,
    issuer,
    tokenEndpoint,
    audience: values.clientAId,
    mintClientA: mint(values.clientAId, values.clientASecret),
    mintClientB: mint(values.clientBId, values.clientBSecret),
  }
}
