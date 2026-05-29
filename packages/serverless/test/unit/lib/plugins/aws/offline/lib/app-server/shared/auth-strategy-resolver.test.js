import { resolveAuthStrategy } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/shared/auth-strategy-resolver.js'

describe('resolveAuthStrategy', () => {
  it('returns undefined when event is null/undefined', () => {
    expect(
      resolveAuthStrategy({
        event: null,
        privateStrategy: 'api-key',
        authorizerStrategies: new Map(),
      }),
    ).toBeUndefined()
  })

  it('returns undefined when event is a string (short-form YAML)', () => {
    expect(
      resolveAuthStrategy({
        event: 'GET /users',
        privateStrategy: 'api-key',
        authorizerStrategies: new Map(),
      }),
    ).toBeUndefined()
  })

  it('returns the privateStrategy when event.private === true', () => {
    expect(
      resolveAuthStrategy({
        event: { method: 'GET', path: '/p', private: true },
        privateStrategy: 'api-key',
        authorizerStrategies: new Map(),
      }),
    ).toBe('api-key')
  })

  it('returns undefined when private:true but no privateStrategy registered', () => {
    expect(
      resolveAuthStrategy({
        event: { private: true },
        privateStrategy: null,
        authorizerStrategies: new Map(),
      }),
    ).toBeUndefined()
  })

  it('looks up authorizer by string name', () => {
    expect(
      resolveAuthStrategy({
        event: { authorizer: 'authFn' },
        privateStrategy: null,
        authorizerStrategies: new Map([['authFn', 'lambda-authorizer:authFn']]),
      }),
    ).toBe('lambda-authorizer:authFn')
  })

  it('looks up authorizer by object.name', () => {
    expect(
      resolveAuthStrategy({
        event: { authorizer: { name: 'authFn' } },
        privateStrategy: null,
        authorizerStrategies: new Map([['authFn', 'lambda-authorizer:authFn']]),
      }),
    ).toBe('lambda-authorizer:authFn')
  })

  it('returns undefined when authorizer name is not registered', () => {
    expect(
      resolveAuthStrategy({
        event: { authorizer: { name: 'missing' } },
        privateStrategy: null,
        authorizerStrategies: new Map(),
      }),
    ).toBeUndefined()
  })

  it('authorizer takes precedence over private when both are declared', () => {
    // When a route declares both `private: true` and an `authorizer`, the
    // authorizer strategy must run through Hapi auth so the authorizer Lambda
    // is actually invoked. The api-key requirement is enforced separately by
    // the route handler.
    expect(
      resolveAuthStrategy({
        event: { private: true, authorizer: { name: 'authFn' } },
        privateStrategy: 'api-key',
        authorizerStrategies: new Map([['authFn', 'lambda-authorizer:authFn']]),
      }),
    ).toBe('lambda-authorizer:authFn')
  })

  it('falls back to private when both are declared but the authorizer is unregistered', () => {
    expect(
      resolveAuthStrategy({
        event: { private: true, authorizer: { name: 'missing' } },
        privateStrategy: 'api-key',
        authorizerStrategies: new Map(),
      }),
    ).toBe('api-key')
  })
})
