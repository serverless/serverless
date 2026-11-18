import { describe, expect, it } from '@jest/globals'
import {
  getWebAppRuntime,
  isSupportedRuntime,
} from '../../../../../../lib/plugins/aws/web-apps/runtime.js'

describe('isSupportedRuntime', () => {
  it.each(['nodejs24.x', 'nodejs26.x', 'nodejs100.x'])('accepts %p', (r) => {
    expect(isSupportedRuntime(r)).toBe(true)
  })

  it.each([
    'nodejs22.x',
    'nodejs20.x',
    'nodejs024.x',
    'nodejs24',
    'python3.12',
    24,
    undefined,
    null,
  ])('rejects %p', (r) => {
    expect(isSupportedRuntime(r)).toBe(false)
  })
})

describe('getWebAppRuntime', () => {
  it("uses the web app's own runtime over provider.runtime", () => {
    expect(getWebAppRuntime({ runtime: 'nodejs24.x' }, 'nodejs26.x')).toBe(
      'nodejs24.x',
    )
    expect(getWebAppRuntime({ runtime: 'nodejs26.x' }, 'nodejs24.x')).toBe(
      'nodejs26.x',
    )
  })

  it.each(['nodejs24.x', 'nodejs26.x'])(
    'inherits provider.runtime %p without its own',
    (providerRuntime) => {
      expect(getWebAppRuntime({}, providerRuntime)).toBe(providerRuntime)
    },
  )

  it.each(['nodejs22.x', 'nodejs20.x', 'python3.12', undefined, 24, {}])(
    'falls back to nodejs24.x for provider.runtime %p',
    (providerRuntime) => {
      expect(getWebAppRuntime({}, providerRuntime)).toBe('nodejs24.x')
    },
  )

  it('falls back to nodejs24.x without a web app', () => {
    expect(getWebAppRuntime(undefined, undefined)).toBe('nodejs24.x')
  })
})
