import {
  unauthorized,
  forbidden,
  authorizerConfigurationError,
} from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/shared/auth-envelopes.js'

/**
 * Drive the envelope helpers with a recording Hapi `h` toolkit stub.
 */
function makeH() {
  const calls = { headers: [], takeover: false }
  const builder = {
    code(c) {
      calls.statusCode = c
      return builder
    },
    type(t) {
      calls.contentType = t
      return builder
    },
    header(name, value) {
      calls.headers.push({ name, value })
      return builder
    },
    takeover() {
      calls.takeover = true
      return builder
    },
  }
  return {
    calls,
    response(payload) {
      calls.payload = payload
      return builder
    },
  }
}

describe('unauthorized', () => {
  it('emits 401 with the Unauthorized AWS envelope and takes over the request', () => {
    const h = makeH()
    unauthorized(h)
    expect(h.calls.statusCode).toBe(401)
    expect(h.calls.payload).toEqual({ message: 'Unauthorized' })
    expect(h.calls.contentType).toBe('application/json')
    expect(h.calls.headers).toContainEqual({
      name: 'x-amzn-ErrorType',
      value: 'UnauthorizedException',
    })
    expect(h.calls.takeover).toBe(true)
  })
})

describe('forbidden', () => {
  it('emits 403 with the Forbidden AWS envelope and takes over the request', () => {
    const h = makeH()
    forbidden(h)
    expect(h.calls.statusCode).toBe(403)
    expect(h.calls.payload).toEqual({ message: 'Forbidden' })
    expect(h.calls.contentType).toBe('application/json')
    expect(h.calls.headers).toContainEqual({
      name: 'x-amzn-ErrorType',
      value: 'ForbiddenException',
    })
    expect(h.calls.takeover).toBe(true)
  })
})

describe('authorizerConfigurationError', () => {
  it('emits 500 with the AuthorizerConfigurationException envelope and takes over the request', () => {
    const h = makeH()
    authorizerConfigurationError(h)
    expect(h.calls.statusCode).toBe(500)
    expect(h.calls.payload).toEqual({
      message: 'Authorizer configuration error',
    })
    expect(h.calls.contentType).toBe('application/json')
    expect(h.calls.headers).toContainEqual({
      name: 'x-amzn-ErrorType',
      value: 'AuthorizerConfigurationException',
    })
    expect(h.calls.takeover).toBe(true)
  })
})
