import {
  DEFAULT_APP_PORT,
  DEFAULT_AWS_API_PORT,
  DEFAULT_STAGE,
  FAKE_ACCOUNT_ID,
  FAKE_REGION,
  LOG_NAMESPACE,
} from '../../../../../../../lib/plugins/aws/offline/lib/constants.js'

describe('offline constants', () => {
  it('exposes default ports', () => {
    expect(DEFAULT_APP_PORT).toBe(3000)
    expect(DEFAULT_AWS_API_PORT).toBe(3002)
  })

  it('exposes default stage', () => {
    expect(DEFAULT_STAGE).toBe('dev')
  })

  it('exposes a 12-digit fake account id and a region', () => {
    expect(FAKE_ACCOUNT_ID).toBe('000000000000')
    expect(FAKE_REGION).toBe('us-east-1')
  })

  it('exposes the log namespace', () => {
    expect(LOG_NAMESPACE).toBe('sls:offline')
  })
})
