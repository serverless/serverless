import {
  NO_BODY_METHODS,
  toHapiMethod,
  normalizeHttpEvent,
} from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/shared/hapi-helpers.js'

describe('NO_BODY_METHODS', () => {
  it('contains exactly GET / HEAD / DELETE / OPTIONS / TRACE', () => {
    expect(NO_BODY_METHODS).toBeInstanceOf(Set)
    expect([...NO_BODY_METHODS].sort()).toEqual(
      ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'TRACE'].sort(),
    )
  })
})

describe('toHapiMethod', () => {
  it('passes GET through unchanged', () => {
    expect(toHapiMethod('GET')).toBe('GET')
  })

  it('folds HEAD onto GET (Hapi auto-serves HEAD)', () => {
    expect(toHapiMethod('HEAD')).toBe('GET')
  })

  it('maps ANY and * to Hapi wildcard *', () => {
    expect(toHapiMethod('ANY')).toBe('*')
    expect(toHapiMethod('*')).toBe('*')
  })

  it('passes POST through unchanged', () => {
    expect(toHapiMethod('POST')).toBe('POST')
  })
})

describe('normalizeHttpEvent', () => {
  it('parses the string short-form "GET /users"', () => {
    expect(normalizeHttpEvent('GET /users')).toEqual({
      method: 'GET',
      path: '/users',
    })
  })

  it('expands the bare "*" catch-all shorthand', () => {
    expect(normalizeHttpEvent('*')).toEqual({ method: 'ANY', path: '*' })
  })

  it('uppercases the method on object form', () => {
    expect(normalizeHttpEvent({ method: 'post', path: '/users/{id}' })).toEqual(
      { method: 'POST', path: '/users/{id}' },
    )
  })
})
