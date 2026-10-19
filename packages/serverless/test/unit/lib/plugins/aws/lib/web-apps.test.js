import { describe, expect, it } from '@jest/globals'
import {
  bucketMessage,
  getWebAppsConfig,
  serviceHasWebApps,
} from '../../../../../../lib/plugins/aws/lib/web-apps.js'

describe('getWebAppsConfig', () => {
  it('reads service.webApps first', () => {
    const webApps = { api: { entry: 'a.js' } }
    expect(
      getWebAppsConfig({
        service: { webApps },
        configurationInput: { webApps: { other: {} } },
      }),
    ).toBe(webApps)
  })

  it('falls back to configurationInput.webApps', () => {
    const webApps = { api: { entry: 'a.js' } }
    expect(
      getWebAppsConfig({ service: {}, configurationInput: { webApps } }),
    ).toBe(webApps)
  })

  it('returns an empty object without webApps', () => {
    expect(getWebAppsConfig({ service: {} })).toEqual({})
  })
})

describe('serviceHasWebApps', () => {
  it('is true for a non-empty webApps block', () => {
    expect(
      serviceHasWebApps({
        service: {},
        configurationInput: { webApps: { api: { entry: 'a.js' } } },
      }),
    ).toBe(true)
  })

  it.each([undefined, null, {}])('is false for webApps %p', (webApps) => {
    expect(
      serviceHasWebApps({ service: { webApps }, configurationInput: {} }),
    ).toBe(false)
  })

  it('is false without a serverless instance', () => {
    expect(serviceHasWebApps(undefined)).toBe(false)
  })
})

describe('bucketMessage', () => {
  const messages = { reference: 'reference text', webApps: 'web apps text' }
  const webApps = { api: { entry: 'a.js' } }
  const provider = (referenceMode) => ({
    isReferenceCodeStorageMode: () => referenceMode,
  })

  it('uses the reference text in reference mode without web apps', () => {
    expect(bucketMessage({ service: {} }, provider(true), messages)).toBe(
      'reference text',
    )
  })

  it('uses the web apps text for web apps without reference mode', () => {
    expect(
      bucketMessage({ service: { webApps } }, provider(false), messages),
    ).toBe('web apps text')
  })

  it('uses the reference text when the service sets reference mode and has web apps', () => {
    expect(
      bucketMessage({ service: { webApps } }, provider(true), messages),
    ).toBe('reference text')
  })
})
