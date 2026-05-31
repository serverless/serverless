import {
  parse,
  serialize,
  serializeError,
} from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/sns/protocol-query.js'
import { SnsOpError } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/sns/ops.js'

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
    [
      'Action=Publish',
      'TopicArn=arn%3Aaws%3Asns%3Aus-east-1%3A000000000000%3AT',
      'Message=hello',
      'Subject=hi',
      'MessageGroupId=g1',
      'MessageDeduplicationId=d1',
      'MessageStructure=json',
    ].join('&'),
  )

  const { action, params } = parse(request)

  expect(action).toBe('Publish')
  expect(params.TopicArn).toBe('arn:aws:sns:us-east-1:000000000000:T')
  expect(params.Message).toBe('hello')
  expect(params.Subject).toBe('hi')
  expect(params.MessageGroupId).toBe('g1')
  expect(params.MessageDeduplicationId).toBe('d1')
  expect(params.MessageStructure).toBe('json')
})

it('parse reads the Subscribe scalar params', () => {
  const request = queryRequest(
    [
      'Action=Subscribe',
      'TopicArn=arn%3Aaws%3Asns%3Aus-east-1%3A000000000000%3AT',
      'Protocol=lambda',
      'Endpoint=arn%3Aaws%3Alambda%3Aus-east-1%3A000000000000%3Afunction%3Afn',
      'ReturnSubscriptionArn=true',
    ].join('&'),
  )

  const { action, params } = parse(request)

  expect(action).toBe('Subscribe')
  expect(params.Protocol).toBe('lambda')
  expect(params.Endpoint).toBe(
    'arn:aws:lambda:us-east-1:000000000000:function:fn',
  )
  expect(params.ReturnSubscriptionArn).toBe('true')
})

it('parse accepts an already-parsed payload object', () => {
  const request = {
    headers: {},
    payload: { Action: 'ListTopics' },
  }

  const { action, params } = parse(request)

  expect(action).toBe('ListTopics')
  expect(params).toEqual({})
})

// ---------------------------------------------------------------------------
// parse — indexed MessageAttributes.entry.N.*
// ---------------------------------------------------------------------------

it('parse folds MessageAttributes.entry.N.* into a MessageAttributes map', () => {
  const request = queryRequest(
    [
      'Action=Publish',
      'TopicArn=arn',
      'Message=hi',
      'MessageAttributes.entry.1.Name=color',
      'MessageAttributes.entry.1.Value.DataType=String',
      'MessageAttributes.entry.1.Value.StringValue=red',
    ].join('&'),
  )

  const { params } = parse(request)

  expect(params.MessageAttributes).toEqual({
    color: { DataType: 'String', StringValue: 'red' },
  })
})

it('parse folds a Binary MessageAttributes.entry value', () => {
  const request = queryRequest(
    [
      'Action=Publish',
      'TopicArn=arn',
      'Message=hi',
      'MessageAttributes.entry.1.Name=blob',
      'MessageAttributes.entry.1.Value.DataType=Binary',
      'MessageAttributes.entry.1.Value.BinaryValue=AAEC',
    ].join('&'),
  )

  const { params } = parse(request)

  expect(params.MessageAttributes).toEqual({
    blob: { DataType: 'Binary', BinaryValue: 'AAEC' },
  })
})

// ---------------------------------------------------------------------------
// parse — Attributes.entry.N.key / .value
// ---------------------------------------------------------------------------

it('parse folds Attributes.entry.N.key/.value into an Attributes map', () => {
  const request = queryRequest(
    [
      'Action=Subscribe',
      'TopicArn=arn',
      'Protocol=lambda',
      'Attributes.entry.1.key=FilterPolicy',
      'Attributes.entry.1.value=%7B%22a%22%3A%5B%221%22%5D%7D',
      'Attributes.entry.2.key=RawMessageDelivery',
      'Attributes.entry.2.value=true',
    ].join('&'),
  )

  const { params } = parse(request)

  expect(params.Attributes).toEqual({
    FilterPolicy: '{"a":["1"]}',
    RawMessageDelivery: 'true',
  })
})

// ---------------------------------------------------------------------------
// parse — PublishBatchRequestEntries.member.N.*
// ---------------------------------------------------------------------------

it('parse folds PublishBatchRequestEntries.member.N.* into an entries array', () => {
  const request = queryRequest(
    [
      'Action=PublishBatch',
      'TopicArn=arn',
      'PublishBatchRequestEntries.member.1.Id=a',
      'PublishBatchRequestEntries.member.1.Message=one',
      'PublishBatchRequestEntries.member.2.Id=b',
      'PublishBatchRequestEntries.member.2.Message=two',
    ].join('&'),
  )

  const { params } = parse(request)

  expect(params.PublishBatchRequestEntries).toEqual([
    { Id: 'a', Message: 'one' },
    { Id: 'b', Message: 'two' },
  ])
})

it('parse folds nested MessageAttributes on a batch entry', () => {
  const request = queryRequest(
    [
      'Action=PublishBatch',
      'TopicArn=arn',
      'PublishBatchRequestEntries.member.1.Id=a',
      'PublishBatchRequestEntries.member.1.Message=one',
      'PublishBatchRequestEntries.member.1.MessageAttributes.entry.1.Name=k',
      'PublishBatchRequestEntries.member.1.MessageAttributes.entry.1.Value.DataType=String',
      'PublishBatchRequestEntries.member.1.MessageAttributes.entry.1.Value.StringValue=v',
    ].join('&'),
  )

  const { params } = parse(request)

  expect(params.PublishBatchRequestEntries[0].MessageAttributes).toEqual({
    k: { DataType: 'String', StringValue: 'v' },
  })
})

// ---------------------------------------------------------------------------
// serialize — Publish result XML
// ---------------------------------------------------------------------------

it('serialize wraps a Publish result in the AWS XML envelope', () => {
  const h = makeH()

  serialize('Publish', { MessageId: 'mid-1' }, h)
  const result = h._last()

  expect(result.statusCode).toBe(200)
  expect(result.contentType).toBe('text/xml')
  expect(result.payload).toContain(
    '<PublishResponse xmlns="http://sns.amazonaws.com/doc/2010-03-31/">',
  )
  expect(result.payload).toContain('<PublishResult>')
  expect(result.payload).toContain('<MessageId>mid-1</MessageId>')
  expect(result.payload).toContain('<ResponseMetadata>')
  expect(result.payload).toContain('<RequestId>')
  expect(result.payload).toContain('</PublishResponse>')
})

it('serialize wraps a Subscribe result', () => {
  const h = makeH()

  serialize('Subscribe', { SubscriptionArn: 'arn:sub' }, h)
  const xml = h._last().payload

  expect(xml).toContain('<SubscribeResult>')
  expect(xml).toContain('<SubscriptionArn>arn:sub</SubscriptionArn>')
})

// ---------------------------------------------------------------------------
// serialize — nested lists
// ---------------------------------------------------------------------------

it('serialize renders ListTopics Topics as <Topics><member>…', () => {
  const h = makeH()

  serialize(
    'ListTopics',
    { Topics: [{ TopicArn: 'arn:a' }, { TopicArn: 'arn:b' }] },
    h,
  )
  const xml = h._last().payload

  expect(xml).toContain('<Topics>')
  expect(xml).toContain('<member><TopicArn>arn:a</TopicArn></member>')
  expect(xml).toContain('<member><TopicArn>arn:b</TopicArn></member>')
})

it('serialize renders ListSubscriptions Subscriptions as members', () => {
  const h = makeH()

  serialize(
    'ListSubscriptions',
    {
      Subscriptions: [
        {
          SubscriptionArn: 'arn:sub',
          TopicArn: 'arn:t',
          Protocol: 'lambda',
          Endpoint: 'arn:fn',
          Owner: '000000000000',
        },
      ],
    },
    h,
  )
  const xml = h._last().payload

  expect(xml).toContain('<Subscriptions>')
  expect(xml).toContain('<member>')
  expect(xml).toContain('<SubscriptionArn>arn:sub</SubscriptionArn>')
  expect(xml).toContain('<Protocol>lambda</Protocol>')
  expect(xml).toContain('<Owner>000000000000</Owner>')
})

it('serialize renders GetTopicAttributes Attributes as entry key/value pairs', () => {
  const h = makeH()

  serialize(
    'GetTopicAttributes',
    { Attributes: { TopicArn: 'arn:t', DisplayName: 'D' } },
    h,
  )
  const xml = h._last().payload

  expect(xml).toContain('<Attributes>')
  expect(xml).toContain(
    '<entry><key>TopicArn</key><value>arn:t</value></entry>',
  )
  expect(xml).toContain('<entry><key>DisplayName</key><value>D</value></entry>')
})

it('serialize renders PublishBatch Successful and Failed members', () => {
  const h = makeH()

  serialize(
    'PublishBatch',
    {
      Successful: [{ Id: 'a', MessageId: 'm1' }],
      Failed: [
        {
          Id: 'b',
          Code: 'InvalidParameter',
          Message: 'bad',
          SenderFault: true,
        },
      ],
    },
    h,
  )
  const xml = h._last().payload

  expect(xml).toContain('<Successful>')
  expect(xml).toContain('<member><Id>a</Id><MessageId>m1</MessageId></member>')
  expect(xml).toContain('<Failed>')
  expect(xml).toContain('<Id>b</Id>')
  expect(xml).toContain('<Code>InvalidParameter</Code>')
  expect(xml).toContain('<SenderFault>true</SenderFault>')
})

it('serialize escapes special characters in element values', () => {
  const h = makeH()

  serialize('Publish', { MessageId: 'a&b<c>d"e' }, h)
  const xml = h._last().payload

  expect(xml).toContain('<MessageId>a&amp;b&lt;c&gt;d&quot;e</MessageId>')
})

// ---------------------------------------------------------------------------
// serializeError — error XML
// ---------------------------------------------------------------------------

it('serializeError emits a Sender-fault ErrorResponse for a 4xx op status', () => {
  const h = makeH()
  const error = new SnsOpError('NotFound', 404, 'Topic does not exist: arn')

  serializeError(error, h)
  const result = h._last()

  expect(result.statusCode).toBe(404)
  expect(result.contentType).toBe('text/xml')
  expect(result.payload).toContain(
    '<ErrorResponse xmlns="http://sns.amazonaws.com/doc/2010-03-31/">',
  )
  expect(result.payload).toContain('<Type>Sender</Type>')
  expect(result.payload).toContain('<Code>NotFound</Code>')
  expect(result.payload).toContain(
    '<Message>Topic does not exist: arn</Message>',
  )
  expect(result.payload).toContain('<RequestId>')
})

it('serializeError emits a Receiver-fault ErrorResponse for a 5xx op status', () => {
  const h = makeH()
  const error = new SnsOpError('InternalFailure', 500, 'boom')

  serializeError(error, h)
  const result = h._last()

  expect(result.statusCode).toBe(500)
  expect(result.payload).toContain('<Type>Receiver</Type>')
  expect(result.payload).not.toContain('<Type>Sender</Type>')
})
