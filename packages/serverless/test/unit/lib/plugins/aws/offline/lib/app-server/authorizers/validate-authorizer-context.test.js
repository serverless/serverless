import { validateAuthorizerContext } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/authorizers/validate-authorizer-context.js'

describe('validateAuthorizerContext', () => {
  it('coerces boolean/number/string values to strings', () => {
    expect(validateAuthorizerContext({ a: 'x', b: 5, c: true })).toEqual({
      ok: true,
      context: { a: 'x', b: '5', c: 'true' },
    })
  })

  it('treats null as a valid empty context', () => {
    expect(validateAuthorizerContext(null)).toEqual({ ok: true, context: {} })
  })

  it('treats undefined as a valid empty context', () => {
    expect(validateAuthorizerContext(undefined)).toEqual({
      ok: true,
      context: {},
    })
  })

  it('rejects a nested object value', () => {
    expect(validateAuthorizerContext({ a: { nested: 1 } })).toEqual({
      ok: false,
    })
  })

  it('rejects an array value', () => {
    expect(validateAuthorizerContext({ a: [1, 2] })).toEqual({ ok: false })
  })

  it('rejects a non-object context', () => {
    expect(validateAuthorizerContext('nope')).toEqual({ ok: false })
  })
})
