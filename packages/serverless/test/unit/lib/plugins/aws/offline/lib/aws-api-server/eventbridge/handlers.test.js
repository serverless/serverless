import { createEventBridgeHandlers } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/eventbridge/handlers.js'
import { createBusStore } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/eventbridge/bus-store.js'
import { createRegistry } from '../../../../../../../../../lib/plugins/aws/offline/lib/provisioner/registry.js'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal fake Hapi response toolkit supporting the fluent
 * `.response(payload).code(n).type(s)` chain. The final result is inspectable
 * as `{ payload, statusCode, contentType }`.
 *
 * @returns {{ response: Function, _last: () => object }}
 */
function makeH() {
  let result = {}
  const toolkit = {
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
  return toolkit
}

/**
 * Build a JSON-RPC EventBridge request: action via `X-Amz-Target`, JSON body.
 *
 * @param {{ action: string, body?: object }} opts
 * @returns {{ headers: object, payload: object }}
 */
function jsonRequest({ action, body = {} }) {
  return {
    headers: {
      'x-amz-target': `AWSEvents.${action}`,
      'content-type': 'application/x-amz-json-1.1',
    },
    payload: body,
  }
}

/** Set up store + registry + deliver spy, returning the handler. */
function setup() {
  const store = createBusStore()
  const registry = createRegistry()
  const delivered = []
  const deliver = async (busName, event) => {
    delivered.push({ busName, event })
  }
  const handler = createEventBridgeHandlers({ store, registry, deliver })
  return { handler, store, registry, delivered }
}

// ===========================================================================
// Round trip
// ===========================================================================

it('1. PutEvents round-trips through the handler and calls deliver', async () => {
  const { handler, delivered } = setup()
  const h = makeH()
  await handler(
    jsonRequest({
      action: 'PutEvents',
      body: {
        Entries: [
          { Source: 'shop', DetailType: 'd', Detail: JSON.stringify({ a: 1 }) },
        ],
      },
    }),
    h,
  )
  const res = h._last()
  expect(res.statusCode).toBe(200)
  expect(res.contentType).toBe('application/x-amz-json-1.1')
  expect(res.payload.FailedEntryCount).toBe(0)
  expect(res.payload.Entries[0].EventId).toEqual(expect.any(String))
  expect(delivered).toHaveLength(1)
})

it('2. a raw string payload (Buffer-tolerant) is parsed', async () => {
  const { handler } = setup()
  const h = makeH()
  const request = jsonRequest({ action: 'PutRule', body: {} })
  request.payload = JSON.stringify({ Name: 'r1' })
  await handler(request, h)
  const res = h._last()
  expect(res.statusCode).toBe(200)
  expect(res.payload.RuleArn).toBe(
    'arn:aws:events:us-east-1:000000000000:rule/r1',
  )
})

// ===========================================================================
// Error envelope
// ===========================================================================

it('3. an op error becomes a { __type, message } envelope with its status', async () => {
  const { handler } = setup()
  const h = makeH()
  await handler(
    jsonRequest({ action: 'DescribeRule', body: { Name: 'ghost' } }),
    h,
  )
  const res = h._last()
  expect(res.statusCode).toBe(404)
  expect(res.contentType).toBe('application/x-amz-json-1.1')
  expect(res.payload.__type).toBe('ResourceNotFoundException')
  expect(res.payload.message).toEqual(expect.any(String))
})

it('4. an unexpected fault becomes a 500', async () => {
  const store = createBusStore()
  const registry = createRegistry()
  // A deliver that blows up forces an unexpected (non-EbOpError) fault.
  const deliver = async () => {
    throw new Error('boom')
  }
  const handler = createEventBridgeHandlers({ store, registry, deliver })
  const h = makeH()
  await handler(
    jsonRequest({
      action: 'PutEvents',
      body: { Entries: [{ Source: 's', DetailType: 'd', Detail: '{}' }] },
    }),
    h,
  )
  const res = h._last()
  expect(res.statusCode).toBe(500)
  expect(res.contentType).toBe('application/x-amz-json-1.1')
  expect(res.payload.__type).toBeDefined()
})
