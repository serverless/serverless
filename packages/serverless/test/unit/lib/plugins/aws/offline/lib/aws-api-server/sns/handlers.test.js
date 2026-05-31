import { createSnsHandlers } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/sns/handlers.js'
import { createTopicStore } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/sns/topic-store.js'
import { createRegistry } from '../../../../../../../../../lib/plugins/aws/offline/lib/provisioner/registry.js'

const TOPIC_ARN = 'arn:aws:sns:us-east-1:000000000000:TestTopic'

/**
 * Build a minimal fake Hapi response toolkit supporting the fluent
 * `.response(payload).code(n).type(s)` chain. The final result is an
 * inspectable `{ payload, statusCode, contentType }`.
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
 * Build a query-protocol request: form-urlencoded body, no `X-Amz-Target`.
 *
 * @param {string} body - The raw form-urlencoded body string.
 * @returns {{ headers: object, payload: string }}
 */
function queryRequest(body) {
  return {
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: body,
  }
}

/**
 * Set up store + registry with one topic, returning the handler and a record of
 * delivered messages.
 *
 * @returns {{ handler: Function, store: object, delivered: object[] }}
 */
function setup() {
  const store = createTopicStore()
  const registry = createRegistry()
  store.ensureTopic(TOPIC_ARN, { name: 'TestTopic' })

  const delivered = []
  const deliver = async (topicArn, record) => {
    delivered.push({ topicArn, record })
  }

  const handler = createSnsHandlers({ store, registry, deliver })
  return { handler, store, delivered }
}

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

it('Publish returns 200 XML with a MessageId and delivers the record', async () => {
  const { handler, delivered } = setup()
  const h = makeH()

  await handler(
    queryRequest(
      `Action=Publish&TopicArn=${encodeURIComponent(TOPIC_ARN)}&Message=hello`,
    ),
    h,
  )
  const result = h._last()

  expect(result.statusCode).toBe(200)
  expect(result.contentType).toBe('text/xml')
  expect(result.payload).toContain('<PublishResponse')
  expect(result.payload).toContain('<MessageId>')
  expect(delivered).toHaveLength(1)
  expect(delivered[0].record.message).toBe('hello')
})

it('CreateTopic round-trips through the query protocol', async () => {
  const { handler } = setup()
  const h = makeH()

  await handler(queryRequest('Action=CreateTopic&Name=NewTopic'), h)
  const result = h._last()

  expect(result.statusCode).toBe(200)
  expect(result.payload).toContain('<CreateTopicResponse')
  expect(result.payload).toContain(
    '<TopicArn>arn:aws:sns:us-east-1:000000000000:NewTopic</TopicArn>',
  )
})

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

it('Publish to an unknown topic returns the ErrorResponse XML (404)', async () => {
  const { handler } = setup()
  const h = makeH()

  await handler(
    queryRequest(
      'Action=Publish&TopicArn=arn%3Aaws%3Asns%3Aus-east-1%3A000000000000%3AGhost&Message=x',
    ),
    h,
  )
  const result = h._last()

  expect(result.statusCode).toBe(404)
  expect(result.contentType).toBe('text/xml')
  expect(result.payload).toContain('<ErrorResponse')
  expect(result.payload).toContain('<Code>NotFound</Code>')
})

it('an unknown action returns the InvalidAction ErrorResponse (400)', async () => {
  const { handler } = setup()
  const h = makeH()

  await handler(queryRequest('Action=Frobnicate'), h)
  const result = h._last()

  expect(result.statusCode).toBe(400)
  expect(result.payload).toContain('<Code>InvalidAction</Code>')
})

it('an unexpected fault becomes a 500 Receiver ErrorResponse', async () => {
  const store = createTopicStore()
  const registry = createRegistry()
  store.ensureTopic(TOPIC_ARN, { name: 'TestTopic' })

  // A deliver that throws an unexpected (non-op) error.
  const deliver = async () => {
    throw new Error('boom')
  }
  const handler = createSnsHandlers({ store, registry, deliver })
  const h = makeH()

  await handler(
    queryRequest(
      `Action=Publish&TopicArn=${encodeURIComponent(TOPIC_ARN)}&Message=hello`,
    ),
    h,
  )
  const result = h._last()

  expect(result.statusCode).toBe(500)
  expect(result.payload).toContain('<Type>Receiver</Type>')
})
