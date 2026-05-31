import { applyInputTransform } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/eventbridge/input-transform.js'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** A representative EventBridge event. */
const EVENT = {
  version: '0',
  id: 'abc-123',
  'detail-type': 'order placed',
  source: 'shop.orders',
  account: '000000000000',
  time: '2026-05-31T00:00:00Z',
  region: 'us-east-1',
  resources: [],
  detail: { orderId: 'o-9', total: 42, customer: { name: 'Ada' } },
  'event-bus-name': 'default',
}

// ===========================================================================
// No transform
// ===========================================================================

it('1. delivers the whole event unchanged when no transform is configured', () => {
  expect(applyInputTransform(EVENT, {})).toEqual(EVENT)
})

it('2. delivers the whole event when the config is undefined', () => {
  expect(applyInputTransform(EVENT, undefined)).toEqual(EVENT)
})

it('3. delivers the whole event when all transform fields are null', () => {
  expect(
    applyInputTransform(EVENT, {
      input: null,
      inputPath: null,
      inputTransformer: null,
    }),
  ).toEqual(EVENT)
})

// ===========================================================================
// Input (constant)
// ===========================================================================

it('4. Input is a JSON string constant and replaces the event', () => {
  const result = applyInputTransform(EVENT, {
    input: JSON.stringify({ fixed: true, n: 1 }),
  })
  expect(result).toEqual({ fixed: true, n: 1 })
})

it('5. Input that is a JSON scalar string is parsed to that scalar', () => {
  expect(applyInputTransform(EVENT, { input: '42' })).toBe(42)
  expect(applyInputTransform(EVENT, { input: '"hello"' })).toBe('hello')
})

it('6. Input that is not valid JSON is delivered as the raw string', () => {
  expect(applyInputTransform(EVENT, { input: 'not json' })).toBe('not json')
})

it('7. Input takes precedence over InputPath and InputTransformer', () => {
  const result = applyInputTransform(EVENT, {
    input: JSON.stringify({ winner: 'input' }),
    inputPath: '$.detail',
    inputTransformer: { InputPathsMap: {}, InputTemplate: 'x' },
  })
  expect(result).toEqual({ winner: 'input' })
})

// ===========================================================================
// InputPath
// ===========================================================================

it('8. InputPath extracts a nested sub-tree from the event', () => {
  const result = applyInputTransform(EVENT, { inputPath: '$.detail' })
  expect(result).toEqual(EVENT.detail)
})

it('9. InputPath extracts a deeply nested value', () => {
  const result = applyInputTransform(EVENT, {
    inputPath: '$.detail.customer.name',
  })
  expect(result).toBe('Ada')
})

it('10. InputPath that matches nothing yields null', () => {
  const result = applyInputTransform(EVENT, { inputPath: '$.detail.missing' })
  expect(result).toBeNull()
})

it('11. InputPath takes precedence over InputTransformer', () => {
  const result = applyInputTransform(EVENT, {
    inputPath: '$.detail.orderId',
    inputTransformer: { InputPathsMap: {}, InputTemplate: 'x' },
  })
  expect(result).toBe('o-9')
})

// ===========================================================================
// InputTransformer
// ===========================================================================

it('12. InputTransformer auto-quotes a resolved string var so unquoted JSON is valid', () => {
  const result = applyInputTransform(EVENT, {
    inputTransformer: {
      InputPathsMap: { id: '$.detail.orderId', total: '$.detail.total' },
      // No quotes around <id>: AWS auto-quotes the resolved string value, so
      // the assembled template is valid JSON.
      InputTemplate: '{ "order": <id>, "amount": <total> }',
    },
  })
  expect(result).toEqual({ order: 'o-9', amount: 42 })
})

it('13. InputTransformer JSON-encodes a resolved string var into a plain template', () => {
  const result = applyInputTransform(EVENT, {
    inputTransformer: {
      InputPathsMap: { id: '$.detail.orderId' },
      InputTemplate: 'Order <id> received',
    },
  })
  // The resolved string is auto-quoted, so it lands JSON-encoded in the text.
  expect(result).toBe('Order "o-9" received')
})

it('14. InputTransformer stringifies non-string resolved values as JSON', () => {
  const result = applyInputTransform(EVENT, {
    inputTransformer: {
      InputPathsMap: { who: '$.detail.customer' },
      InputTemplate: 'customer=<who>',
    },
  })
  expect(result).toBe('customer={"name":"Ada"}')
})

it('15. InputTransformer substitutes every occurrence of a var', () => {
  const result = applyInputTransform(EVENT, {
    inputTransformer: {
      InputPathsMap: { id: '$.detail.orderId' },
      InputTemplate: '<id>-<id>',
    },
  })
  // Each occurrence is auto-quoted (the resolved value is a string).
  expect(result).toBe('"o-9"-"o-9"')
})

it('16. InputTransformer supports the reserved <aws.events.event.json> var', () => {
  const result = applyInputTransform(EVENT, {
    inputTransformer: {
      InputPathsMap: {},
      InputTemplate: '<aws.events.event.json>',
    },
  })
  expect(result).toEqual(EVENT)
})

it('17. a var that resolves to nothing substitutes an empty string', () => {
  const result = applyInputTransform(EVENT, {
    inputTransformer: {
      InputPathsMap: { gone: '$.detail.missing' },
      InputTemplate: 'value=[<gone>]',
    },
  })
  expect(result).toBe('value=[]')
})

// ---------------------------------------------------------------------------
// String auto-quoting (M4): unquoted vars yield valid JSON
// ---------------------------------------------------------------------------

it('18. an unquoted string var produces valid JSON', () => {
  const result = applyInputTransform(EVENT, {
    inputTransformer: {
      InputPathsMap: { instance: '$.detail.orderId' },
      InputTemplate: '{"id": <instance>}',
    },
  })
  expect(result).toEqual({ id: 'o-9' })
})

it('19. a resolved object var is inserted as JSON (not double-encoded)', () => {
  const result = applyInputTransform(EVENT, {
    inputTransformer: {
      InputPathsMap: { who: '$.detail.customer' },
      InputTemplate: '{"customer": <who>}',
    },
  })
  expect(result).toEqual({ customer: { name: 'Ada' } })
})

// ---------------------------------------------------------------------------
// Reserved variables (M3)
// ---------------------------------------------------------------------------

it('20. <aws.events.event> inserts the event without its detail key', () => {
  const result = applyInputTransform(EVENT, {
    inputTransformer: {
      InputPathsMap: {},
      InputTemplate: '<aws.events.event>',
    },
  })
  const { detail, ...withoutDetail } = EVENT
  expect(result).toEqual(withoutDetail)
  expect('detail' in result).toBe(false)
})

it('21. <aws.events.rule-name> and <aws.events.rule-arn> come from context', () => {
  const result = applyInputTransform(
    EVENT,
    {
      inputTransformer: {
        InputPathsMap: {},
        // The reserved vars are string values and auto-quoted, so they appear
        // unquoted in the template just like InputPathsMap string vars.
        InputTemplate:
          '{"rule": <aws.events.rule-name>, "arn": <aws.events.rule-arn>}',
      },
    },
    {
      ruleName: 'orders-rule',
      ruleArn: 'arn:aws:events:us-east-1:000000000000:rule/orders-rule',
    },
  )
  expect(result).toEqual({
    rule: 'orders-rule',
    arn: 'arn:aws:events:us-east-1:000000000000:rule/orders-rule',
  })
})

it('22. <aws.events.ingestion-time> falls back to the event time when not in context', () => {
  const result = applyInputTransform(EVENT, {
    inputTransformer: {
      InputPathsMap: {},
      InputTemplate: '{"at": <aws.events.ingestion-time>}',
    },
  })
  expect(result).toEqual({ at: EVENT.time })
})

it('23. <aws.events.ingestion-time> uses the context value when provided', () => {
  const result = applyInputTransform(
    EVENT,
    {
      inputTransformer: {
        InputPathsMap: {},
        InputTemplate: '{"at": <aws.events.ingestion-time>}',
      },
    },
    { ingestionTime: '2030-01-01T00:00:00Z' },
  )
  expect(result).toEqual({ at: '2030-01-01T00:00:00Z' })
})
