import {
  translateRestPath,
  buildMountedPath,
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

  it('translates every {proxy+} occurrence in a path', () => {
    // The /g flag matters when (rare but possible) a single template carries
    // two greedy segments.
    expect(translateRestPath('/{proxy+}/x/{proxy+}')).toBe('/{any*}/x/{any*}')
  })
})

describe('buildMountedPath', () => {
  it('prepends /<stage>/ to a path', () => {
    expect(buildMountedPath('/users', 'dev')).toBe('/dev/users')
  })

  it('prepends /<stage>/ to /', () => {
    expect(buildMountedPath('/', 'dev')).toBe('/dev/')
  })

  it('returns the path unchanged when stage prefix is disabled and no prefix', () => {
    expect(buildMountedPath('/users', 'dev', { includeStage: false })).toBe(
      '/users',
    )
  })

  it('prepends /<stage>/<prefix>/ when both stage and prefix are set', () => {
    expect(buildMountedPath('/users', 'dev', { prefix: 'api' })).toBe(
      '/dev/api/users',
    )
  })

  it('prepends /<prefix>/ only when stage prefix is disabled but prefix set', () => {
    expect(
      buildMountedPath('/users', 'dev', {
        includeStage: false,
        prefix: 'api',
      }),
    ).toBe('/api/users')
  })

  it('trims leading and trailing slashes from prefix', () => {
    expect(buildMountedPath('/users', 'dev', { prefix: '/api/' })).toBe(
      '/dev/api/users',
    )
  })

  it('treats an empty-string prefix the same as no prefix', () => {
    expect(buildMountedPath('/users', 'dev', { prefix: '' })).toBe('/dev/users')
  })

  it('treats a slash-only prefix the same as no prefix', () => {
    expect(buildMountedPath('/users', 'dev', { prefix: '/' })).toBe(
      '/dev/users',
    )
  })
})
