import { randomBytes } from 'crypto'
import { readFile } from 'fs/promises'
import path from 'path'
import url from 'url'
import { setGlobalRendererSettings } from '@serverless/util'
import {
  APIGatewayClient,
  GetAuthorizersCommand,
} from '@aws-sdk/client-api-gateway'
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation'
import {
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider'
import { jest } from '@jest/globals'
import { getTestStageName, runSfCore } from '../../utils/runSfCore.js'
import { TEST_REGION } from '../../utils/testRegion.js'
import { fetchWithRetry } from '../../utils/testUtils.js'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

const SERVICE = 'sfc-apigw-jwt'
const ADMIN_SCOPE = 'aws.cognito.signin.user.admin'

// Region: the suite follows TEST_REGION like every unpinned suite, so CI runs
// it wherever its shard runs and the nightly leftover report, which lists the
// CI regions, covers its stacks. API Gateway hands a JWT authorizer's claims to
// the integration (requestContext.authorizer.claims) in some Regions only: on
// 2026-11-23 eu-west-1 delivered them and the default TEST_REGION delivered no
// authorizer context at all. The claims test asserts their content wherever they arrive,
// and requires them in the Regions listed here. Run the suite with
// AWS_REGION=eu-west-1 to cover the claims.
const CLAIMS_REGIONS = new Set(['eu-west-1'])

const decodePayload = (jwt) =>
  JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'))

describe('REST API JWT authorizers', () => {
  const fixtureDir = path.join(__dirname, 'fixture')
  const configFilePath = path.join(fixtureDir, 'serverless.yml')
  const stage = getTestStageName()
  const stackName = `${SERVICE}-${stage}`
  const originalEnv = process.env

  const cfnClient = new CloudFormationClient({ region: TEST_REGION })
  const apiGatewayClient = new APIGatewayClient({ region: TEST_REGION })
  const cognitoClient = new CognitoIdentityProviderClient({
    region: TEST_REGION,
  })

  let outputs
  let idToken
  let accessToken

  const run = (command, options = {}, params = {}) =>
    runSfCore({
      coreParams: {
        options: { stage, c: configFilePath, ...options },
        command,
      },
      jest,
      ...params,
    })

  const stackExists = async () => {
    try {
      const { Stacks } = await cfnClient.send(
        new DescribeStacksCommand({ StackName: stackName }),
      )
      return Stacks?.[0]?.StackStatus !== 'DELETE_COMPLETE'
    } catch (error) {
      if (/does not exist/.test(error?.message ?? '')) return false
      throw error
    }
  }

  const request = (route, token) =>
    fetch(`${outputs.ServiceEndpoint}/${route}`, {
      headers: token === undefined ? {} : { authorization: token },
    })

  // A request API Gateway answers itself, without calling the function.
  const expectRejected = async (route, token, status) => {
    const response = await request(route, token)
    const body = await response.text()
    expect({ route, status: response.status }).toEqual({ route, status })
    expect(response.headers.get('x-amzn-errortype')).toBe(
      status === 401 ? 'UnauthorizedException' : 'AccessDeniedException',
    )
    // The function's echo would carry `authorizer`.
    expect(body).not.toContain('authorizer')
    return { response, body }
  }

  // A request that reaches the function. A new stage takes about a minute to
  // serve every route, so this retries until the function answers.
  const expectAccepted = async (route, token) => {
    const response = await fetchWithRetry(
      `${outputs.ServiceEndpoint}/${route}`,
      { headers: { authorization: token } },
      30,
      5000,
    )
    const body = await response.json()
    expect(body.path).toBe(`/${route}`)
    return body
  }

  beforeAll(async () => {
    setGlobalRendererSettings({
      isInteractive: false,
      logLevel: 'error',
    })
    process.env = {
      ...originalEnv,
      SERVERLESS_PLATFORM_STAGE: 'dev',
      SERVERLESS_LICENSE_KEY: process.env.SERVERLESS_LICENSE_KEY_DEV,
      SERVERLESS_ACCESS_KEY: undefined,
    }

    await run(['deploy'])

    const { Stacks } = await cfnClient.send(
      new DescribeStacksCommand({ StackName: stackName }),
    )
    outputs = Object.fromEntries(
      Stacks[0].Outputs.map(({ OutputKey, OutputValue }) => [
        OutputKey,
        OutputValue,
      ]),
    )

    // One user per run, in the run's own pool, with a password nobody else
    // sees; the pool goes with the stack.
    const username = `jwt-${stage}`
    const password = `${randomBytes(18).toString('base64url')}Aa1!`
    await cognitoClient.send(
      new AdminCreateUserCommand({
        UserPoolId: outputs.UserPoolId,
        Username: username,
        MessageAction: 'SUPPRESS',
        UserAttributes: [{ Name: 'custom:tenant', Value: 'acme' }],
      }),
    )
    await cognitoClient.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: outputs.UserPoolId,
        Username: username,
        Password: password,
        Permanent: true,
      }),
    )
    const { AuthenticationResult } = await cognitoClient.send(
      new AdminInitiateAuthCommand({
        UserPoolId: outputs.UserPoolId,
        ClientId: outputs.UserPoolClientId,
        AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
        AuthParameters: { USERNAME: username, PASSWORD: password },
      }),
    )
    idToken = AuthenticationResult.IdToken
    accessToken = AuthenticationResult.AccessToken

    // Wait until the stage serves the API, so the rejections below come from
    // the authorizers rather than from a stage still propagating.
    await expectAccepted('id', idToken)
  }, 900000)

  afterEach(() => {
    jest.restoreAllMocks()
  })

  afterAll(async () => {
    // Remove the stack whatever the tests did, and fail the run when it
    // cannot be removed, so a leak never passes as green. The user pool and
    // the function's log group are resources of the stack.
    jest.restoreAllMocks()
    let failure
    try {
      if (await stackExists()) {
        await run(['remove'], {}, { expectError: true })
        if (await stackExists()) throw new Error('the stack still exists')
      }
    } catch (error) {
      failure = new Error(`Teardown of ${stackName} failed: ${error.message}`)
    }
    process.env = originalEnv
    if (failure) throw failure
  }, 900000)

  test('compiles one JWT authorizer per definition, without a TTL', async () => {
    const template = JSON.parse(
      await readFile(
        path.join(
          fixtureDir,
          '.serverless',
          'cloudformation-template-update-stack.json',
        ),
        'utf8',
      ),
    )
    const resources = template.Resources

    expect(resources.CognitoApiGatewayJwtAuthorizer).toEqual({
      Type: 'AWS::ApiGateway::Authorizer',
      Properties: {
        RestApiId: { Ref: 'ApiGatewayRestApi' },
        Name: 'cognito',
        Type: 'JWT',
        IdentitySource: 'method.request.header.Authorization',
        JwtConfiguration: {
          DefaultAlgorithms: ['RS256'],
          Issuers: [
            {
              Issuer: { 'Fn::GetAtt': ['UserPool', 'ProviderURL'] },
              Audiences: [{ Ref: 'UserPoolClient' }],
              AdditionalClaims: [
                { ClaimName: 'sub', Format: 'SINGLE_STRING', Required: true },
              ],
            },
          ],
        },
      },
    })
    expect(
      resources.GlobexApiGatewayJwtAuthorizer.Properties.JwtConfiguration
        .Issuers,
    ).toEqual([
      {
        Issuer: {
          'Fn::Sub':
            'https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPool}',
        },
        Audiences: [{ Ref: 'UserPoolClient' }],
        AdditionalClaims: [
          {
            ClaimName: 'custom:tenant',
            Format: 'SINGLE_STRING',
            Required: true,
            ExpectedValues: ['globex'],
          },
        ],
      },
    ])

    const authorizers = Object.entries(resources).filter(
      ([, resource]) => resource.Type === 'AWS::ApiGateway::Authorizer',
    )
    expect(authorizers.map(([logicalId]) => logicalId).sort()).toEqual([
      'AcmeApiGatewayJwtAuthorizer',
      'CognitoApiGatewayJwtAuthorizer',
      'GlobexApiGatewayJwtAuthorizer',
    ])
    for (const [, { Properties }] of authorizers) {
      expect(Properties).not.toHaveProperty('AuthorizerResultTtlInSeconds')
      expect(Properties).not.toHaveProperty('AuthorizerUri')
    }
    // No function authorizes, so nothing grants API Gateway a call to one.
    expect(
      Object.values(resources).filter(
        (resource) => resource.Type === 'AWS::Lambda::Permission',
      ),
    ).toHaveLength(1)

    expect(resources.ApiGatewayMethodIdGet.Properties).toMatchObject({
      AuthorizationType: 'JWT',
      AuthorizerId: { Ref: 'CognitoApiGatewayJwtAuthorizer' },
    })
    expect(resources.ApiGatewayMethodIdGet.Properties).not.toHaveProperty(
      'AuthorizationScopes',
    )
    expect(resources.ApiGatewayMethodAdminGet.Properties).toMatchObject({
      AuthorizationType: 'JWT',
      AuthorizerId: { Ref: 'CognitoApiGatewayJwtAuthorizer' },
      AuthorizationScopes: [ADMIN_SCOPE],
    })

    // What API Gateway made of it. The SDK's model has no jwtConfiguration
    // yet, so the issuers are checked by the requests below instead.
    const { items } = await apiGatewayClient.send(
      new GetAuthorizersCommand({
        restApiId: new URL(outputs.ServiceEndpoint).hostname.split('.')[0],
      }),
    )
    expect(items.map(({ name }) => name).sort()).toEqual([
      'acme',
      'cognito',
      'globex',
    ])
    for (const authorizer of items) {
      expect(authorizer.type).toBe('JWT')
      expect(authorizer.authorizerResultTtlInSeconds).toBeUndefined()
      expect(authorizer.identitySource).toBe(
        'method.request.header.Authorization',
      )
    }
  })

  test("the issuer URL is the user pool tokens' iss", () => {
    const id = decodePayload(idToken)
    const access = decodePayload(accessToken)
    expect(id.iss).toBe(outputs.IssuerUrl)
    expect(access.iss).toBe(outputs.IssuerUrl)
    // Both ways the fixture names the issuer give the tokens' iss exactly.
    expect(outputs.UserPoolProviderUrl).toBe(outputs.IssuerUrl)
    expect(id).toMatchObject({
      token_use: 'id',
      aud: outputs.UserPoolClientId,
      'custom:tenant': 'acme',
    })
    expect(access).toMatchObject({
      token_use: 'access',
      client_id: outputs.UserPoolClientId,
      scope: ADMIN_SCOPE,
    })
  })

  test('rejects a request without a token, or with one that is not a JWT', async () => {
    for (const route of ['id', 'admin', 'acme', 'globex']) {
      const { body } = await expectRejected(route, undefined, 401)
      expect(JSON.parse(body)).toEqual({ message: 'Unauthorized' })
      await expectRejected(route, 'Bearer abc.def.ghi', 401)
      await expectRejected(route, 'not-a-token', 401)
    }
  })

  test('a route without scopes accepts ID tokens and rejects access tokens', async () => {
    await expectAccepted('id', `Bearer ${idToken}`)
    await expectRejected('id', `Bearer ${accessToken}`, 401)
  })

  test('a route with scopes accepts access tokens with the scope and rejects ID tokens', async () => {
    await expectAccepted('admin', `Bearer ${accessToken}`)
    await expectRejected('admin', `Bearer ${idToken}`, 401)
  })

  test('an additional claim rule accepts a matching token and denies another', async () => {
    await expectAccepted('acme', `Bearer ${idToken}`)
    const { response } = await expectRejected(
      'globex',
      `Bearer ${idToken}`,
      403,
    )
    expect(response.headers.get('www-authenticate')).toContain(
      'the token does not satisfy the required claims',
    )
  })

  test('the function receives the claims where the Region delivers them', async () => {
    const { authorizer } = await expectAccepted('acme', `Bearer ${idToken}`)
    if (!CLAIMS_REGIONS.has(TEST_REGION) && authorizer?.claims == null) {
      console.warn(
        `No JWT claims reached the function in ${TEST_REGION}; their content is checked in ${[...CLAIMS_REGIONS].join(', ')}.`,
      )
      return
    }
    const id = decodePayload(idToken)
    expect(authorizer.claims).toMatchObject({
      sub: id.sub,
      'custom:tenant': 'acme',
      token_use: 'id',
    })
  })
})
