import {
  parse,
  serialize,
  serializeError,
} from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/sqs/protocol-json.js'
import { SqsOpError } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/sqs/ops.js'

/**
 * Minimal fake Hapi response toolkit capturing the `.response().code().type()`
 * chain into an inspectable record.
 *
 * @returns {{ response: Function, _last: () => object }}
 */
function makeH() {
  let result = {}
  return {
    response(payload) {
      result = { payload, statusCode: 200, contentType: '' }
      const chain = {
        code(n) {
          result.statusCode = n
          return chain
        },
        type(t) {
          result.contentType = t
          return chain
        },
      }
      return chain
    },
    _last() {
      return result
    },
  }
}

// ---------------------------------------------------------------------------
// parse
// ---------------------------------------------------------------------------

it('parse derives the action from X-Amz-Target and params from the JSON payload', () => {
  const request = {
    headers: { 'x-amz-target': 'AmazonSQS.SendMessage' },
    payload: { QueueUrl: 'u', MessageBody: 'hello' },
  }

  const { action, params } = parse(request)

  expect(action).toBe('SendMessage')
  expect(params).toEqual({ QueueUrl: 'u', MessageBody: 'hello' })
})

it('parse accepts a raw JSON string payload', () => {
  const request = {
    headers: { 'x-amz-target': 'AmazonSQS.ReceiveMessage' },
    payload: JSON.stringify({ QueueUrl: 'u', MaxNumberOfMessages: 3 }),
  }

  const { action, params } = parse(request)

  expect(action).toBe('ReceiveMessage')
  expect(params).toEqual({ QueueUrl: 'u', MaxNumberOfMessages: 3 })
})

it('parse tolerates a missing/empty payload', () => {
  const request = {
    headers: { 'x-amz-target': 'AmazonSQS.ListQueues' },
  }

  const { action, params } = parse(request)

  expect(action).toBe('ListQueues')
  expect(params).toEqual({})
})

// ---------------------------------------------------------------------------
// serialize
// ---------------------------------------------------------------------------

it('serialize writes the result as 200 JSON with the amz content type', () => {
  const h = makeH()

  serialize({ MessageId: 'abc', MD5OfMessageBody: 'deadbeef' }, h)
  const result = h._last()

  expect(result.statusCode).toBe(200)
  expect(result.contentType).toBe('application/x-amz-json-1.0')
  expect(result.payload).toEqual({
    MessageId: 'abc',
    MD5OfMessageBody: 'deadbeef',
  })
})

// ---------------------------------------------------------------------------
// serializeError
// ---------------------------------------------------------------------------

it('serializeError emits the __type / Message envelope with the op status', () => {
  const h = makeH()
  const error = new SqsOpError(
    'AWS.SimpleQueueService.NonExistentQueue',
    400,
    'The specified queue does not exist: u',
  )

  serializeError(error, h)
  const result = h._last()

  expect(result.statusCode).toBe(400)
  expect(result.contentType).toBe('application/x-amz-json-1.0')
  expect(result.payload).toEqual({
    __type: 'AWS.SimpleQueueService.NonExistentQueue',
    Message: 'The specified queue does not exist: u',
  })
})
