import { applyRequestIdHeaders } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/shared/request-id-headers.js'

function makeResponse() {
  const headers = {}
  const response = {
    header(name, value) {
      headers[name] = value
      return response
    },
  }
  return { response, headers }
}

describe('applyRequestIdHeaders', () => {
  it('REST sets x-amzn-RequestId + x-amz-apigw-id', () => {
    const { response, headers } = makeResponse()
    applyRequestIdHeaders(response, 'rest', {
      requestId: 'r-1',
      extendedRequestId: 'e-1',
    })
    expect(headers['x-amzn-RequestId']).toBe('r-1')
    expect(headers['x-amz-apigw-id']).toBe('e-1')
  })

  it('HTTP sets apigw-requestid only', () => {
    const { response, headers } = makeResponse()
    applyRequestIdHeaders(response, 'http', { requestId: 'r-2' })
    expect(headers['apigw-requestid']).toBe('r-2')
    expect(headers).not.toHaveProperty('x-amzn-RequestId')
    expect(headers).not.toHaveProperty('x-amz-apigw-id')
  })

  it('skips header entries whose value is missing', () => {
    const { response, headers } = makeResponse()
    applyRequestIdHeaders(response, 'rest', { requestId: 'r-3' })
    expect(headers['x-amzn-RequestId']).toBe('r-3')
    expect(headers).not.toHaveProperty('x-amz-apigw-id')
  })

  it('returns the response for chaining', () => {
    const { response } = makeResponse()
    expect(applyRequestIdHeaders(response, 'http', { requestId: 'x' })).toBe(
      response,
    )
  })
})
