import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SignJWT } from 'jose'

import { requireEnv } from './_preflight.js'
import { bootOffline } from './_harness.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REST_FIXTURE = path.join(__dirname, 'fixtures/authorizers/rest')
const HTTPAPI_FIXTURE = path.join(__dirname, 'fixtures/authorizers/httpapi')

// A configured REST API key (provider.apiGateway.apiKeys). The community
// plugin honors this exact key; deployed AWS denies a private route with no
// usable key in its usage plan.
const API_KEY = 'it-auth-rest-key-abc123'

const JWT_ISSUER = 'https://issuer.example.com'
const JWT_AUDIENCE = 'it-auth-audience'
const JWT_SECRET = new TextEncoder().encode('it-auth-jwt-secret-32-bytes-long!')

// Sign a real JWT with `jose`. The fixture sets ignoreJWTSignature so the
// signature is not verified, but every claim check (exp / iss / aud / scope)
// still runs — so the token must carry valid claims.
async function signToken({
  issuer = JWT_ISSUER,
  audience = JWT_AUDIENCE,
  expiresInSeconds = 3600,
  scope = 'read write',
} = {}) {
  return new SignJWT({ sub: 'jwt-user', scope })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .sign(JWT_SECRET)
}

// The REST proxy + HTTP API v2 handlers echo the event as the response body
// (AWS_PROXY unwraps statusCode/headers/body), so the HTTP body IS the event.
async function event(res) {
  return JSON.parse(await res.text())
}

// ---------------------------------------------------------------------------
// The assertions below are the captured-and-verified baseline. Each flavor was
// captured from the community serverless-offline plugin (see
// fixtures/authorizers/.captured/*.json) and validated against the AWS API
// Gateway authorizer contract. Where the community plugin diverges from AWS,
// the AWS-correct value is asserted and the divergence is recorded.
// ---------------------------------------------------------------------------

describe('REST API (v1) authorizers', () => {
  let offline
  beforeAll(async () => {
    await requireEnv({}) // node-only fixtures; no docker/runtimes needed
    offline = await bootOffline({ cwd: REST_FIXTURE })
  })
  afterAll(async () => offline?.stop())

  describe('API key (private: true)', () => {
    it('rejects a request with no x-api-key (403 Forbidden)', async () => {
      const res = await offline.http('/dev/private')
      expect(res.status).toBe(403)
      expect(res.headers.get('x-amzn-errortype')).toBe('ForbiddenException')
      expect(await res.json()).toEqual({ message: 'Forbidden' })
    })

    it('rejects an invalid x-api-key (403 Forbidden)', async () => {
      const res = await offline.http('/dev/private', {
        headers: { 'x-api-key': 'not-a-valid-key' },
      })
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ message: 'Forbidden' })
    })

    it('accepts a valid x-api-key (200)', async () => {
      const res = await offline.http('/dev/private', {
        headers: { 'x-api-key': API_KEY },
      })
      expect(res.status).toBe(200)
      const ev = await event(res)
      // A private route has no Lambda authorizer, so no authorizer context.
      expect(ev.requestContext.authorizer).toBeUndefined()
    })
  })

  describe('IAM authorizer (aws_iam)', () => {
    it('runs the route unauthenticated locally (200, no authorizer context)', async () => {
      // SigV4 (IAM) authorization is not emulated; the route is reachable
      // locally. AWS-fidelity assertion: OUR offline omits the authorizer
      // block entirely (the community plugin injects a placeholder
      // `authorizer.principalId`; AWS attaches no Lambda-authorizer context
      // to an aws_iam route).
      const res = await offline.http('/dev/iam')
      expect(res.status).toBe(200)
      const ev = await event(res)
      expect('authorizer' in ev.requestContext).toBe(false)
    })
  })

  describe('Lambda authorizer TOKEN', () => {
    it('rejects a request with no token (401 Unauthorized)', async () => {
      const res = await offline.http('/dev/token')
      expect(res.status).toBe(401)
      expect(res.headers.get('x-amzn-errortype')).toBe('UnauthorizedException')
      // AWS-fidelity assertion: AWS emits `{"message":"Unauthorized"}`; the
      // community plugin returns a Boom-style envelope instead.
      expect(await res.json()).toEqual({ message: 'Unauthorized' })
    })

    it('returns 401 when the authorizer returns the Unauthorized literal', async () => {
      const res = await offline.http('/dev/token', {
        headers: { Authorization: 'deny-401' },
      })
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ message: 'Unauthorized' })
    })

    it('returns 403 when the authorizer returns a Deny policy', async () => {
      const res = await offline.http('/dev/token', {
        headers: { Authorization: 'this-is-not-allow-me' },
      })
      expect(res.status).toBe(403)
      expect(res.headers.get('x-amzn-errortype')).toBe('ForbiddenException')
      expect(await res.json()).toEqual({ message: 'Forbidden' })
    })

    it('returns 200 and surfaces the authorizer context on Allow', async () => {
      const res = await offline.http('/dev/token', {
        headers: { Authorization: 'allow-me' },
      })
      expect(res.status).toBe(200)
      const ev = await event(res)
      // principalId + the returned context reach the handler. Context values
      // are String-coerced by AWS (count 7 -> "7", flag true -> "true").
      expect(ev.requestContext.authorizer).toEqual({
        principalId: 'user-token-123',
        scope: 'read',
        tier: 'gold',
        count: '7',
        flag: 'true',
      })
    })
  })

  describe('Lambda authorizer REQUEST', () => {
    it('rejects when the identitySource header is absent (401 Unauthorized)', async () => {
      const res = await offline.http('/dev/request')
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ message: 'Unauthorized' })
    })

    it('returns 403 when the authorizer returns a Deny policy', async () => {
      const res = await offline.http('/dev/request', {
        headers: { Authorization: 'this-is-not-allow-me' },
      })
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ message: 'Forbidden' })
    })

    it('returns 200 and surfaces the authorizer context on Allow', async () => {
      const res = await offline.http('/dev/request', {
        headers: { Authorization: 'allow-me' },
      })
      expect(res.status).toBe(200)
      const ev = await event(res)
      expect(ev.requestContext.authorizer).toEqual({
        principalId: 'user-request-456',
        dept: 'eng',
      })
    })
  })
})

describe('HTTP API (v2) authorizers', () => {
  let offline
  beforeAll(async () => {
    await requireEnv({})
    offline = await bootOffline({ cwd: HTTPAPI_FIXTURE })
  })
  afterAll(async () => offline?.stop())

  describe('JWT authorizer', () => {
    it('rejects a request with no token (401 Unauthorized)', async () => {
      const res = await offline.http('/jwt')
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ message: 'Unauthorized' })
    })

    it('rejects a token from the wrong issuer (401 Unauthorized)', async () => {
      const token = await signToken({ issuer: 'https://evil.example.com' })
      const res = await offline.http('/jwt', {
        headers: { Authorization: `Bearer ${token}` },
      })
      expect(res.status).toBe(401)
    })

    it('rejects a token with the wrong audience (401 Unauthorized)', async () => {
      const token = await signToken({ audience: 'wrong-audience' })
      const res = await offline.http('/jwt', {
        headers: { Authorization: `Bearer ${token}` },
      })
      expect(res.status).toBe(401)
    })

    it('rejects an expired token (401 Unauthorized)', async () => {
      const token = await signToken({ expiresInSeconds: -10 })
      const res = await offline.http('/jwt', {
        headers: { Authorization: `Bearer ${token}` },
      })
      expect(res.status).toBe(401)
    })

    it('returns 200 and surfaces requestContext.authorizer.jwt.claims on a valid token', async () => {
      const token = await signToken()
      const res = await offline.http('/jwt', {
        headers: { Authorization: `Bearer ${token}` },
      })
      expect(res.status).toBe(200)
      const ev = await event(res)
      const jwt = ev.requestContext.authorizer.jwt
      expect(jwt.claims.iss).toBe(JWT_ISSUER)
      expect(jwt.claims.aud).toBe(JWT_AUDIENCE)
      expect(jwt.claims.sub).toBe('jwt-user')
      expect(jwt.scopes).toEqual(['read', 'write'])
      // AWS-fidelity assertion: OUR offline surfaces ONLY the `jwt` block; the
      // community plugin adds a spurious empty `lambda: {}` sibling. AWS
      // populates exactly one of jwt/lambda per the route's authorizer type.
      expect(ev.requestContext.authorizer.lambda).toBeUndefined()
    })
  })

  describe('Lambda authorizer REQUEST (simple responses)', () => {
    it('rejects when the identitySource header is absent (401 Unauthorized)', async () => {
      const res = await offline.http('/v2request')
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ message: 'Unauthorized' })
    })

    it('returns 403 when the authorizer denies (isAuthorized: false)', async () => {
      const res = await offline.http('/v2request', {
        headers: { Authorization: 'this-is-not-allow-me' },
      })
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ message: 'Forbidden' })
    })

    it('returns 200 and surfaces requestContext.authorizer.lambda on authorize', async () => {
      const res = await offline.http('/v2request', {
        headers: { Authorization: 'allow-me' },
      })
      expect(res.status).toBe(200)
      const ev = await event(res)
      expect(ev.requestContext.authorizer.lambda).toEqual({
        role: 'admin',
        team: 'core',
      })
      // AWS-fidelity assertion: OUR offline surfaces ONLY the `lambda` block;
      // the community plugin adds a spurious empty `jwt: {}` sibling.
      expect(ev.requestContext.authorizer.jwt).toBeUndefined()
    })
  })

  describe('Custom authentication provider', () => {
    it('returns 200 and surfaces the injected context at requestContext.authorizer.lambda', async () => {
      const res = await offline.http('/custom')
      expect(res.status).toBe(200)
      const ev = await event(res)
      // The provider attaches credentials.authorizer = { lambda: <ctx> }; the
      // v2 event factory surfaces it verbatim. The captured community baseline
      // surfaces the same `authorizer.lambda` shape from credentials.context
      // (the credentials-key and global-vs-named application scope differ
      // between the two; the handler-visible surface is identical).
      expect(ev.requestContext.authorizer.lambda).toEqual({
        source: 'custom-provider',
        expected: 'it works',
      })
    })
  })
})
