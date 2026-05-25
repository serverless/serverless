/**
 * Integration-type detector for REST API `events[].http` declarations.
 *
 * APIGW v1 supports five integration types — AWS_PROXY (Lambda proxy, the
 * default), AWS (Lambda non-proxy with velocity templates), HTTP, HTTP_PROXY,
 * and MOCK. Real-world Framework users overwhelmingly use AWS_PROXY (the
 * default) and occasionally AWS; HTTP / HTTP_PROXY / MOCK are not on the
 * local-development path. The detector returns the normalized integration
 * name for the two we serve and rejects the rest with a clear, actionable
 * error so users hit a documented boundary instead of a silent miss.
 *
 * Recognised aliases (from Framework's YAML history):
 *   AWS_PROXY: 'AWS_PROXY' | 'lambda-proxy'
 *   AWS:       'AWS' | 'lambda'
 */

import ServerlessError from '../../../../../../serverless-error.js'

/**
 * Normalize an http event entry to its integration name.
 *
 * @param {string | { integration?: string }} httpEvent
 *   The value of `events[N].http` — either the short string form
 *   (`'GET /users'`) or the long-form object.
 * @returns {'AWS_PROXY' | 'AWS'}
 * @throws {ServerlessError} OFFLINE_UNSUPPORTED_INTEGRATION
 */
export function detectIntegration(httpEvent) {
  // Short string form is always lambda-proxy — there is no place to declare
  // a different integration type when only `method path` is given.
  if (typeof httpEvent === 'string') return 'AWS_PROXY'

  const raw = httpEvent.integration
  if (raw === undefined || raw === null) return 'AWS_PROXY'

  switch (raw) {
    case 'AWS_PROXY':
    case 'lambda-proxy':
      return 'AWS_PROXY'
    case 'AWS':
    case 'lambda':
      return 'AWS'
    default:
      throw new ServerlessError(
        `Integration type "${raw}" is not supported by sls offline. ` +
          'Supported: AWS_PROXY (default, alias "lambda-proxy") and AWS (alias "lambda").',
        'OFFLINE_UNSUPPORTED_INTEGRATION',
      )
  }
}
