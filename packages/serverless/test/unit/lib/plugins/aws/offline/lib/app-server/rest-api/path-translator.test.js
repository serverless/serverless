import {
  translateRestPath,
  prependStage,
} from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/rest-api/path-translator.js'

describe('translateRestPath', () => {
  it('passes a placeholder-free path through unchanged', () => {
    expect(translateRestPath('/users')).toBe('/users')
  })

  it('preserves a single placeholder {id}', () => {
    expect(translateRestPath('/users/{id}')).toBe('/users/{id}')
  })

  it('translates {proxy+} (APIGW greedy catch-all) to Hapi {any*}', () => {
    expect(translateRestPath('/api/{proxy+}')).toBe('/api/{any*}')
  })

  it('translates a bare "*" path to Hapi /{any*}', () => {
    expect(translateRestPath('*')).toBe('/{any*}')
  })

  it('preserves multiple placeholders', () => {
    expect(translateRestPath('/orgs/{org}/users/{id}')).toBe(
      '/orgs/{org}/users/{id}',
    )
  })
})

describe('prependStage', () => {
  it('prepends /<stage>/ to a path', () => {
    expect(prependStage('/users', 'dev')).toBe('/dev/users')
  })

  it('prepends /<stage>/ to /', () => {
    expect(prependStage('/', 'dev')).toBe('/dev/')
  })

  it('returns the path unchanged when stage prefix is disabled and no prefix', () => {
    expect(prependStage('/users', 'dev', { noPrependStage: true })).toBe(
      '/users',
    )
  })

  it('prepends /<stage>/<prefix>/ when both stage and prefix are set', () => {
    expect(prependStage('/users', 'dev', { prefix: 'api' })).toBe(
      '/dev/api/users',
    )
  })

  it('prepends /<prefix>/ only when stage prefix is disabled but prefix set', () => {
    expect(
      prependStage('/users', 'dev', {
        noPrependStage: true,
        prefix: 'api',
      }),
    ).toBe('/api/users')
  })

  it('trims leading and trailing slashes from prefix', () => {
    expect(prependStage('/users', 'dev', { prefix: '/api/' })).toBe(
      '/dev/api/users',
    )
  })
})
