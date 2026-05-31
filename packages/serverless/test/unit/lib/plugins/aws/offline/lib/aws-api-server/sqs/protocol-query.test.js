import {
  parse,
  serialize,
  serializeError,
} from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/sqs/protocol-query.js'
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

/**
 * Build a query-protocol request from a form-urlencoded body string.
 *
 * @param {string} body
 * @returns {{ headers: object, payload: string }}
 */
function queryRequest(body) {
  return {
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: body,
  }
}

// ---------------------------------------------------------------------------
// parse — scalars
// ---------------------------------------------------------------------------

it('parse reads the Action and scalar params from a raw form-urlencoded body', () => {
  const request = queryRequest(
    'Action=SendMessage&QueueUrl=http%3A%2F%2Fh%2F0%2FQ&MessageBody=hello&DelaySeconds=5',
  )

  const { action, params } = parse(request)

  expect(action).toBe('SendMessage')
  expect(params.QueueUrl).toBe('http://h/0/Q')
  expect(params.MessageBody).toBe('hello')
  expect(params.DelaySeconds).toBe('5')
})

it('parse accepts an already-parsed payload object', () => {
  const request = {
    headers: {},
    payload: {
      Action: 'ReceiveMessage',
      QueueUrl: 'u',
      MaxNumberOfMessages: '2',
    },
  }

  const { action, params } = parse(request)

  expect(action).toBe('ReceiveMessage')
  expect(params.QueueUrl).toBe('u')
  expect(params.MaxNumberOfMessages).toBe('2')
})

// ---------------------------------------------------------------------------
// parse — indexed MessageAttribute.N.*
// ---------------------------------------------------------------------------

it('parse folds MessageAttribute.N.* into a MessageAttributes map', () => {
  const request = queryRequest(
    [
      'Action=SendMessage',
      'QueueUrl=u',
      'MessageBody=hi',
      'MessageAttribute.1.Name=Author',
      'MessageAttribute.1.Value.DataType=String',
      'MessageAttribute.1.Value.StringValue=alice',
    ].join('&'),
  )

  const { params } = parse(request)

  expect(params.MessageAttributes).toEqual({
    Author: { DataType: 'String', StringValue: 'alice' },
  })
})

// ---------------------------------------------------------------------------
// parse — Attribute.N.* and AttributeName.N
// ---------------------------------------------------------------------------

it('parse folds Attribute.N.Name/.Value into an Attributes map', () => {
  const request = queryRequest(
    [
      'Action=SetQueueAttributes',
      'QueueUrl=u',
      'Attribute.1.Name=VisibilityTimeout',
      'Attribute.1.Value=90',
    ].join('&'),
  )

  const { params } = parse(request)

  expect(params.Attributes).toEqual({ VisibilityTimeout: '90' })
})

it('parse collects AttributeName.N into an AttributeNames array', () => {
  const request = queryRequest(
    'Action=GetQueueAttributes&QueueUrl=u&AttributeName.1=VisibilityTimeout&AttributeName.2=DelaySeconds',
  )

  const { params } = parse(request)

  expect(params.AttributeNames).toEqual(['VisibilityTimeout', 'DelaySeconds'])
})

// ---------------------------------------------------------------------------
// parse — batch entries
// ---------------------------------------------------------------------------

it('parse folds SendMessageBatchRequestEntry.N.* into an Entries array', () => {
  const request = queryRequest(
    [
      'Action=SendMessageBatch',
      'QueueUrl=u',
      'SendMessageBatchRequestEntry.1.Id=a',
      'SendMessageBatchRequestEntry.1.MessageBody=one',
      'SendMessageBatchRequestEntry.2.Id=b',
      'SendMessageBatchRequestEntry.2.MessageBody=two',
    ].join('&'),
  )

  const { params } = parse(request)

  expect(params.Entries).toEqual([
    { Id: 'a', MessageBody: 'one' },
    { Id: 'b', MessageBody: 'two' },
  ])
})

it('parse folds batch-entry nested MessageAttribute.N.* into the entry', () => {
  const request = queryRequest(
    [
      'Action=SendMessageBatch',
      'QueueUrl=u',
      'SendMessageBatchRequestEntry.1.Id=a',
      'SendMessageBatchRequestEntry.1.MessageBody=one',
      'SendMessageBatchRequestEntry.1.MessageAttribute.1.Name=K',
      'SendMessageBatchRequestEntry.1.MessageAttribute.1.Value.DataType=String',
      'SendMessageBatchRequestEntry.1.MessageAttribute.1.Value.StringValue=V',
    ].join('&'),
  )

  const { params } = parse(request)

  expect(params.Entries[0].MessageAttributes).toEqual({
    K: { DataType: 'String', StringValue: 'V' },
  })
})

// ---------------------------------------------------------------------------
// serialize — SendMessage result XML
// ---------------------------------------------------------------------------

it('serialize wraps a SendMessage result in the AWS XML envelope', () => {
  const h = makeH()

  serialize(
    'SendMessage',
    { MD5OfMessageBody: 'abc123', MessageId: 'mid-1' },
    h,
  )
  const result = h._last()

  expect(result.statusCode).toBe(200)
  expect(result.contentType).toBe('text/xml')
  expect(result.payload).toContain('<SendMessageResponse')
  expect(result.payload).toContain('<SendMessageResult>')
  expect(result.payload).toContain(
    '<MD5OfMessageBody>abc123</MD5OfMessageBody>',
  )
  expect(result.payload).toContain('<MessageId>mid-1</MessageId>')
  expect(result.payload).toContain('<ResponseMetadata>')
  expect(result.payload).toContain('<RequestId>')
  expect(result.payload).toContain('</SendMessageResponse>')
})

// ---------------------------------------------------------------------------
// serialize — ReceiveMessage result XML (repeated <Message> elements)
// ---------------------------------------------------------------------------

it('serialize renders ReceiveMessage Messages as repeated <Message> elements', () => {
  const h = makeH()

  serialize(
    'ReceiveMessage',
    {
      Messages: [
        {
          MessageId: 'm1',
          ReceiptHandle: 'rh1',
          Body: 'hello',
          MD5OfBody: 'md5a',
          Attributes: { ApproximateReceiveCount: '1', SentTimestamp: '123' },
        },
      ],
    },
    h,
  )
  const xml = h._last().payload

  expect(xml).toContain('<ReceiveMessageResult>')
  expect(xml).toContain('<Message>')
  expect(xml).toContain('<MessageId>m1</MessageId>')
  expect(xml).toContain('<ReceiptHandle>rh1</ReceiptHandle>')
  expect(xml).toContain('<Body>hello</Body>')
  expect(xml).toContain('<MD5OfBody>md5a</MD5OfBody>')
  // System attributes render as repeated <Attribute><Name>..</Name><Value>..</Value>.
  expect(xml).toContain('<Name>ApproximateReceiveCount</Name>')
  expect(xml).toContain('<Value>1</Value>')
})

it('serialize escapes special characters in element values', () => {
  const h = makeH()

  serialize('SendMessage', { MessageId: 'a&b<c>d"e', MD5OfMessageBody: 'x' }, h)
  const xml = h._last().payload

  expect(xml).toContain('<MessageId>a&amp;b&lt;c&gt;d&quot;e</MessageId>')
})

it('serialize renders ListQueues QueueUrls as repeated <QueueUrl> elements', () => {
  const h = makeH()

  serialize('ListQueues', { QueueUrls: ['http://h/0/A', 'http://h/0/B'] }, h)
  const xml = h._last().payload

  expect(xml).toContain('<QueueUrl>http://h/0/A</QueueUrl>')
  expect(xml).toContain('<QueueUrl>http://h/0/B</QueueUrl>')
})

// ---------------------------------------------------------------------------
// serializeError — error XML
// ---------------------------------------------------------------------------

it('serializeError emits a Sender-fault ErrorResponse for a 4xx op status', () => {
  const h = makeH()
  const error = new SqsOpError(
    'AWS.SimpleQueueService.NonExistentQueue',
    400,
    'The specified queue does not exist: u',
  )

  serializeError(error, h)
  const result = h._last()

  expect(result.statusCode).toBe(400)
  expect(result.contentType).toBe('text/xml')
  expect(result.payload).toContain('<ErrorResponse')
  expect(result.payload).toContain('<Type>Sender</Type>')
  expect(result.payload).toContain(
    '<Code>AWS.SimpleQueueService.NonExistentQueue</Code>',
  )
  expect(result.payload).toContain(
    '<Message>The specified queue does not exist: u</Message>',
  )
  expect(result.payload).toContain('<RequestId>')
})

it('serializeError emits a Receiver-fault ErrorResponse for a 5xx op status', () => {
  const h = makeH()
  const error = new SqsOpError('InternalFailure', 500, 'boom')

  serializeError(error, h)
  const result = h._last()

  expect(result.statusCode).toBe(500)
  expect(result.payload).toContain('<Type>Receiver</Type>')
  expect(result.payload).not.toContain('<Type>Sender</Type>')
})
