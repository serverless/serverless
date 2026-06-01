import {
  DEFAULT_APP_PORT,
  DEFAULT_HOST,
  DEFAULT_LAMBDA_PORT,
  DEFAULT_STAGE,
  DEFAULT_TERMINATE_IDLE_LAMBDA_TIME,
  DEFAULT_WATCH,
  FAKE_ACCOUNT_ID,
  FAKE_REGION,
  LOG_NAMESPACE,
} from '../../../../../../../lib/plugins/aws/offline/lib/constants.js'

describe('offline constants', () => {
  it('exposes default ports', () => {
    expect(DEFAULT_APP_PORT).toBe(3000)
    expect(DEFAULT_LAMBDA_PORT).toBe(3002)
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

  it('exposes default host', () => {
    expect(DEFAULT_HOST).toBe('localhost')
  })

  it('exposes default watch flag', () => {
    expect(DEFAULT_WATCH).toBe(false)
  })

  it('exposes default terminate idle lambda time in seconds', () => {
    expect(DEFAULT_TERMINATE_IDLE_LAMBDA_TIME).toBe(60)
  })
})
