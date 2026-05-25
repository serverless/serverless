import { detectIntegration } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/rest-api/integration-detector.js'

describe('detectIntegration', () => {
  it('defaults to AWS_PROXY when http event has no integration field', () => {
    expect(detectIntegration({ method: 'GET', path: '/users' })).toBe(
      'AWS_PROXY',
    )
  })

  it('returns AWS_PROXY when explicit "lambda-proxy"', () => {
    expect(detectIntegration({ integration: 'lambda-proxy' })).toBe('AWS_PROXY')
  })

  it('returns AWS_PROXY when explicit "AWS_PROXY"', () => {
    expect(detectIntegration({ integration: 'AWS_PROXY' })).toBe('AWS_PROXY')
  })

  it('returns AWS when explicit "lambda"', () => {
    expect(detectIntegration({ integration: 'lambda' })).toBe('AWS')
  })

  it('returns AWS when explicit "AWS"', () => {
    expect(detectIntegration({ integration: 'AWS' })).toBe('AWS')
  })

  it('treats string short form (e.g. "GET /users") as AWS_PROXY', () => {
    expect(detectIntegration('GET /users')).toBe('AWS_PROXY')
  })

  it('treats null integration as AWS_PROXY default', () => {
    expect(detectIntegration({ integration: null })).toBe('AWS_PROXY')
  })

  it('throws OFFLINE_UNSUPPORTED_INTEGRATION for HTTP', () => {
    expect(() => detectIntegration({ integration: 'HTTP' })).toThrow(
      /OFFLINE_UNSUPPORTED_INTEGRATION|not supported/,
    )
  })

  it('throws OFFLINE_UNSUPPORTED_INTEGRATION for MOCK with the AWS code on the error', () => {
    let caught
    try {
      detectIntegration({ integration: 'MOCK' })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeDefined()
    expect(caught.code).toBe('OFFLINE_UNSUPPORTED_INTEGRATION')
    expect(caught.message).toContain('MOCK')
    expect(caught.message).toContain('AWS_PROXY')
  })
})
