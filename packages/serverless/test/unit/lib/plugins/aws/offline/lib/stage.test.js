import { getStage } from '../../../../../../../lib/plugins/aws/offline/lib/stage.js'
import { DEFAULT_STAGE } from '../../../../../../../lib/plugins/aws/offline/lib/constants.js'

describe('getStage', () => {
  it('returns the configured provider.stage', () => {
    const serverless = {
      service: { provider: { stage: 'prod' } },
    }
    expect(getStage(serverless)).toBe('prod')
  })

  it('returns the default stage when provider.stage is missing', () => {
    const serverless = { service: { provider: {} } }
    expect(getStage(serverless)).toBe(DEFAULT_STAGE)
  })

  it('returns the default stage when service.provider is missing', () => {
    const serverless = { service: {} }
    expect(getStage(serverless)).toBe(DEFAULT_STAGE)
  })

  it('returns the default stage when serverless or service is missing', () => {
    expect(getStage(undefined)).toBe(DEFAULT_STAGE)
    expect(getStage({})).toBe(DEFAULT_STAGE)
  })

  it('reflects a stage override applied after construction', () => {
    // Framework wires --stage by writing to provider.stage on the same
    // serverless instance, so the accessor must read the live value, not
    // a captured copy.
    const serverless = {
      service: { provider: { stage: 'dev' } },
    }
    expect(getStage(serverless)).toBe('dev')
    serverless.service.provider.stage = 'staging'
    expect(getStage(serverless)).toBe('staging')
  })
})
