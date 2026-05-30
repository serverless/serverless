import {
  toInvokeResponse,
  toInvokeError,
  toNotFound,
  toInvalidParameterValue,
} from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/lambda-invoke/response.js'

function makeH() {
  const resp = {
    body: undefined,
    statusCode: null,
    contentType: null,
    headers: {},
    code(c) {
      this.statusCode = c
      return this
    },
    type(t) {
      this.contentType = t
      return this
    },
    header(k, v) {
      this.headers[k] = v
      return this
    },
  }
  const h = {
    response(body) {
      resp.body = body
      return resp
    },
  }
  return { h, resp }
}

describe('lambda invoke response shapers', () => {
  describe('toInvokeResponse', () => {
    it('returns 200 with a JSON body and the executed-version header', () => {
      const { h, resp } = makeH()
      const out = toInvokeResponse({ ok: true }, h)

      expect(out).toBe(resp)
      expect(resp.body).toBe('{"ok":true}')
      expect(resp.statusCode).toBe(200)
      expect(resp.contentType).toBe('application/json')
      expect(resp.headers['X-Amz-Executed-Version']).toBe('$LATEST')
    })

    it('returns an empty body when the result is undefined', () => {
      const { h, resp } = makeH()
      toInvokeResponse(undefined, h)

      expect(resp.body).toBe('')
      expect(resp.statusCode).toBe(200)
    })

    it('serializes a falsy-but-defined result (0) rather than emptying it', () => {
      const { h, resp } = makeH()
      toInvokeResponse(0, h)

      expect(resp.body).toBe('0')
      expect(resp.statusCode).toBe(200)
    })
  })

  describe('toInvokeError', () => {
    it('returns 200 with the function-error header and an error envelope', () => {
      const { h, resp } = makeH()
      toInvokeError(new Error('boom'), h)

      expect(resp.statusCode).toBe(200)
      expect(resp.contentType).toBe('application/json')
      expect(resp.headers['X-Amz-Function-Error']).toBe('Unhandled')

      const parsed = JSON.parse(resp.body)
      expect(parsed.errorType).toBe('Error')
      expect(parsed.errorMessage).toBe('boom')
      expect(Array.isArray(parsed.trace)).toBe(true)
    })

    it('uses a custom error name as the errorType', () => {
      const { h, resp } = makeH()
      const err = new Error('custom failure')
      err.name = 'MyError'
      toInvokeError(err, h)

      const parsed = JSON.parse(resp.body)
      expect(parsed.errorType).toBe('MyError')
    })

    it('handles a thrown non-Error value with safe fallbacks', () => {
      const { h, resp } = makeH()
      toInvokeError('boom', h)

      expect(resp.statusCode).toBe(200)
      expect(resp.headers['X-Amz-Function-Error']).toBe('Unhandled')

      const parsed = JSON.parse(resp.body)
      expect(parsed.errorType).toBe('Error')
      expect(parsed.errorMessage).toBe('boom')
      expect(parsed.trace).toEqual([])
    })
  })

  describe('toNotFound', () => {
    it('returns 404 with the resource-not-found envelope and header', () => {
      const { h, resp } = makeH()
      toNotFound('svc-dev-x', h)

      expect(resp.statusCode).toBe(404)
      expect(resp.contentType).toBe('application/json')
      expect(resp.headers['x-amzn-ErrorType']).toBe('ResourceNotFoundException')

      const parsed = JSON.parse(resp.body)
      expect(parsed).toEqual({
        Type: 'User',
        Message: 'Function not found: svc-dev-x',
      })
    })
  })

  describe('toInvalidParameterValue', () => {
    it('returns 400 with a capitalized Message key (AWS envelope)', () => {
      const { h, resp } = makeH()
      toInvalidParameterValue('Unsupported invocation type: Bogus', h)

      expect(resp.statusCode).toBe(400)
      expect(resp.headers['x-amzn-ErrorType']).toBe(
        'InvalidParameterValueException',
      )
      expect(JSON.parse(resp.body)).toEqual({
        Type: 'User',
        Message: 'Unsupported invocation type: Bogus',
      })
    })
  })
})
