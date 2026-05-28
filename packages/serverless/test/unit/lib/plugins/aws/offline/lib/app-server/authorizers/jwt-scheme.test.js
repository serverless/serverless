import Hapi from '@hapi/hapi'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import { jest } from '@jest/globals'
import { createJwtScheme } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/authorizers/jwt-scheme.js'

function b64url(json) {
  return Buffer.from(JSON.stringify(json))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function makeJwt(payload, header = { alg: 'none', typ: 'JWT' }) {
  return `${b64url(header)}.${b64url(payload)}.sig`
}

async function makeServer(authorizerDef, opts = {}) {
  const schemeArgs = { authorizerDef }
  if (opts.useDefaultSignatureMode !== true) {
    schemeArgs.ignoreJWTSignature = opts.ignoreJWTSignature ?? true
  }
  const scheme = createJwtScheme(schemeArgs)
  const server = Hapi.server({ host: 'localhost', port: 0 })
  server.auth.scheme('jwt', scheme)
  server.auth.strategy('jwt', 'jwt')
  server.route({
    method: 'GET',
    path: '/p',
    options: { auth: 'jwt' },
    handler: (request) => ({
      ok: true,
      authorizer: request.auth.credentials.authorizer,
    }),
  })
  await server.initialize()
  return server
}

async function makeJwksIssuer() {
  const { publicKey, privateKey } = await generateKeyPair('RS256')
  const jwk = await exportJWK(publicKey)
  const key = { ...jwk, kid: 'test-key', alg: 'RS256', use: 'sig' }
  const server = Hapi.server({ host: 'localhost', port: 0 })
  server.route({
    method: 'GET',
    path: '/.well-known/jwks.json',
    handler: () => ({ keys: [key] }),
  })
  await server.start()
  return { issuerUrl: server.info.uri, privateKey, server }
}

async function makeSignedJwt({ issuerUrl, privateKey, audience = 'client-1' }) {
  return new SignJWT({ sub: 'user-7', scope: 'read profile' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(issuerUrl)
    .setAudience(audience)
    .setExpirationTime('1h')
    .sign(privateKey)
}

const FUTURE = Math.floor(Date.now() / 1000) + 3600
const PAST = Math.floor(Date.now() / 1000) - 60

describe('jwt-scheme — happy path', () => {
  it('200s with credentials.authorizer.jwt populated on a valid token', async () => {
    const server = await makeServer({
      issuerUrl: 'https://issuer.example.com',
      audience: ['client-1'],
    })
    try {
      const token = makeJwt({
        iss: 'https://issuer.example.com',
        aud: 'client-1',
        exp: FUTURE,
        sub: 'user-7',
      })
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.payload)
      expect(body.authorizer).toEqual({
        jwt: {
          claims: expect.objectContaining({
            iss: 'https://issuer.example.com',
            aud: 'client-1',
            sub: 'user-7',
          }),
          scopes: null,
        },
      })
    } finally {
      await server.stop()
    }
  })

  it('strips Bearer prefix case-insensitively', async () => {
    const server = await makeServer({
      issuerUrl: 'https://issuer.example.com',
      audience: ['client-1'],
    })
    try {
      const token = makeJwt({
        iss: 'https://issuer.example.com',
        aud: 'client-1',
        exp: FUTURE,
      })
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: `bEaReR ${token}` },
      })
      expect(res.statusCode).toBe(200)
    } finally {
      await server.stop()
    }
  })

  it('accepts an aud claim as array with overlap', async () => {
    const server = await makeServer({
      issuerUrl: 'https://issuer.example.com',
      audience: ['a', 'b', 'c'],
    })
    try {
      const token = makeJwt({
        iss: 'https://issuer.example.com',
        aud: ['x', 'b'],
        exp: FUTURE,
      })
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
    } finally {
      await server.stop()
    }
  })

  it('falls back to client_id when aud is missing', async () => {
    const server = await makeServer({
      issuerUrl: 'https://issuer.example.com',
      audience: ['client-7'],
    })
    try {
      const token = makeJwt({
        iss: 'https://issuer.example.com',
        client_id: 'client-7',
        exp: FUTURE,
      })
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
    } finally {
      await server.stop()
    }
  })

  it('emits scopes (parsed from space-separated scope claim) when configured', async () => {
    const server = await makeServer({
      issuerUrl: 'https://issuer.example.com',
      audience: ['c'],
      scopes: ['read', 'write'],
    })
    try {
      const token = makeJwt({
        iss: 'https://issuer.example.com',
        aud: 'c',
        scope: 'read profile',
        exp: FUTURE,
      })
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.payload)
      expect(body.authorizer.jwt.scopes).toEqual(['read', 'profile'])
    } finally {
      await server.stop()
    }
  })
})

describe('jwt-scheme — signature verification', () => {
  it('verifies JWT signatures by default against the issuer JWKS', async () => {
    const issuer = await makeJwksIssuer()
    const server = await makeServer(
      {
        issuerUrl: issuer.issuerUrl,
        audience: ['client-1'],
      },
      { useDefaultSignatureMode: true },
    )
    try {
      const token = await makeSignedJwt(issuer)
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.payload).authorizer.jwt.claims.sub).toBe('user-7')
    } finally {
      await server.stop()
      await issuer.server.stop()
    }
  })

  it('401s forged tokens when ignoreJWTSignature is false', async () => {
    const issuer = await makeJwksIssuer()
    const server = await makeServer(
      {
        issuerUrl: issuer.issuerUrl,
        audience: ['client-1'],
      },
      { ignoreJWTSignature: false },
    )
    try {
      const token = makeJwt({
        iss: issuer.issuerUrl,
        aud: 'client-1',
        exp: FUTURE,
        sub: 'user-7',
      })
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(401)
    } finally {
      await server.stop()
      await issuer.server.stop()
    }
  })

  it('accepts forged tokens when ignoreJWTSignature is true', async () => {
    const issuer = await makeJwksIssuer()
    const server = await makeServer(
      {
        issuerUrl: issuer.issuerUrl,
        audience: ['client-1'],
      },
      { ignoreJWTSignature: true },
    )
    try {
      const token = makeJwt({
        iss: issuer.issuerUrl,
        aud: 'client-1',
        exp: FUTURE,
        sub: 'user-7',
      })
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
    } finally {
      await server.stop()
      await issuer.server.stop()
    }
  })
})

describe('jwt-scheme — 401 paths', () => {
  it('401s when the identity-source header is missing', async () => {
    const server = await makeServer({
      issuerUrl: 'https://i',
      audience: ['c'],
    })
    try {
      const res = await server.inject({ method: 'GET', url: '/p' })
      expect(res.statusCode).toBe(401)
      expect(JSON.parse(res.payload)).toEqual({ message: 'Unauthorized' })
      expect(res.headers['x-amzn-errortype']).toBe('UnauthorizedException')
    } finally {
      await server.stop()
    }
  })

  it('401s when the token is malformed', async () => {
    const server = await makeServer({
      issuerUrl: 'https://i',
      audience: ['c'],
    })
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: 'Bearer not-a-jwt' },
      })
      expect(res.statusCode).toBe(401)
    } finally {
      await server.stop()
    }
  })

  it('401s when exp is in the past', async () => {
    const server = await makeServer({
      issuerUrl: 'https://i',
      audience: ['c'],
    })
    try {
      const token = makeJwt({ iss: 'https://i', aud: 'c', exp: PAST })
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(401)
    } finally {
      await server.stop()
    }
  })

  it('401s when iss does not match configured issuerUrl', async () => {
    const server = await makeServer({
      issuerUrl: 'https://issuer-A',
      audience: ['c'],
    })
    try {
      const token = makeJwt({ iss: 'https://issuer-B', aud: 'c', exp: FUTURE })
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(401)
    } finally {
      await server.stop()
    }
  })

  it('401s when audience has no overlap and no client_id fallback', async () => {
    const server = await makeServer({
      issuerUrl: 'https://i',
      audience: ['c'],
    })
    try {
      const token = makeJwt({ iss: 'https://i', aud: 'x', exp: FUTURE })
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(401)
    } finally {
      await server.stop()
    }
  })

  it('403s when scopes configured but token has none in common', async () => {
    const server = await makeServer({
      issuerUrl: 'https://i',
      audience: ['c'],
      scopes: ['read'],
    })
    try {
      const token = makeJwt({
        iss: 'https://i',
        aud: 'c',
        exp: FUTURE,
        scope: 'write',
      })
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(403)
    } finally {
      await server.stop()
    }
  })

  it('403s when scopes configured but the token has no scope claim', async () => {
    const server = await makeServer({
      issuerUrl: 'https://i',
      audience: ['c'],
      scopes: ['read'],
    })
    try {
      const token = makeJwt({ iss: 'https://i', aud: 'c', exp: FUTURE })
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(403)
    } finally {
      await server.stop()
    }
  })

  it('accepts the scp array claim when it satisfies configured scopes', async () => {
    const server = await makeServer({
      issuerUrl: 'https://i',
      audience: ['c'],
      scopes: ['read'],
    })
    try {
      const token = makeJwt({
        iss: 'https://i',
        aud: 'c',
        exp: FUTURE,
        scp: ['read', 'write'],
      })
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.payload).authorizer.jwt.scopes).toEqual([
        'read',
        'write',
      ])
    } finally {
      await server.stop()
    }
  })

  it('401s when exp claim is absent', async () => {
    const server = await makeServer({
      issuerUrl: 'https://i',
      audience: ['c'],
    })
    try {
      const token = makeJwt({ iss: 'https://i', aud: 'c' })
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(401)
    } finally {
      await server.stop()
    }
  })
})
