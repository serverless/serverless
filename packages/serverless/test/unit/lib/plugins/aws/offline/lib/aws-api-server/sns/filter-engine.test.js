import { matchesFilterPolicy } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/sns/filter-engine.js'

/**
 * Build an SNS message-attribute map entry in the wire shape
 * `{ DataType, StringValue }`.
 */
function attr(dataType, value) {
  return { DataType: dataType, StringValue: value }
}

// ===========================================================================
// Empty / absent policy
// ===========================================================================

it('1. an empty policy object matches', () => {
  expect(
    matchesFilterPolicy(
      {},
      { messageAttributes: {}, scope: 'MessageAttributes' },
    ),
  ).toBe(true)
})

it('2. a null/undefined policy matches', () => {
  expect(matchesFilterPolicy(null, { messageAttributes: {} })).toBe(true)
  expect(matchesFilterPolicy(undefined, { messageAttributes: {} })).toBe(true)
})

// ===========================================================================
// MessageAttributes scope — exact string equality (default scope)
// ===========================================================================

it('3. exact string match on a single attribute (default scope)', () => {
  const policy = { store: ['example_corp'] }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { store: attr('String', 'example_corp') },
    }),
  ).toBe(true)
})

it('4. exact string mismatch does not match', () => {
  const policy = { store: ['example_corp'] }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { store: attr('String', 'other_corp') },
    }),
  ).toBe(false)
})

it('5. a single field condition array is OR-ed (any value matches)', () => {
  const policy = { store: ['a', 'b', 'c'] }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { store: attr('String', 'b') },
    }),
  ).toBe(true)
})

it('6. multiple fields are AND-ed (all must match)', () => {
  const policy = { store: ['example_corp'], event: ['order_placed'] }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: {
        store: attr('String', 'example_corp'),
        event: attr('String', 'order_placed'),
      },
    }),
  ).toBe(true)
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: {
        store: attr('String', 'example_corp'),
        event: attr('String', 'order_cancelled'),
      },
    }),
  ).toBe(false)
})

// ===========================================================================
// Numeric equality on attributes
// ===========================================================================

it('7. a bare numeric condition does NOT match a Number attribute (string value)', () => {
  // Attribute values are always strings, and equality is typed: '100' !== 100.
  // Use a string condition or { numeric } to match a Number attribute.
  const policy = { price: [100] }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { price: attr('Number', '100') },
    }),
  ).toBe(false)
})

it('8. a string condition matches a Number attribute by string equality', () => {
  const policy = { price: ['100'] }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { price: attr('Number', '100') },
    }),
  ).toBe(true)
})

// ===========================================================================
// exists true / false
// ===========================================================================

it('9. { exists: true } matches when the attribute is present', () => {
  const policy = { store: [{ exists: true }] }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { store: attr('String', 'anything') },
    }),
  ).toBe(true)
})

it('10. { exists: true } does not match a missing attribute', () => {
  const policy = { store: [{ exists: true }] }
  expect(matchesFilterPolicy(policy, { messageAttributes: {} })).toBe(false)
})

it('11. { exists: false } matches only a missing attribute', () => {
  const policy = { store: [{ exists: false }] }
  expect(matchesFilterPolicy(policy, { messageAttributes: {} })).toBe(true)
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { store: attr('String', 'present') },
    }),
  ).toBe(false)
})

it('12. a missing attribute matches ONLY an { exists: false } condition', () => {
  expect(matchesFilterPolicy({ store: ['x'] }, { messageAttributes: {} })).toBe(
    false,
  )
})

// ===========================================================================
// prefix / suffix
// ===========================================================================

it('13. { prefix } matches a leading substring', () => {
  const policy = { region: [{ prefix: 'us-' }] }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { region: attr('String', 'us-east-1') },
    }),
  ).toBe(true)
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { region: attr('String', 'eu-west-1') },
    }),
  ).toBe(false)
})

it('14. { suffix } matches a trailing substring', () => {
  const policy = { file: [{ suffix: '.png' }] }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { file: attr('String', 'photo.png') },
    }),
  ).toBe(true)
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { file: attr('String', 'photo.jpg') },
    }),
  ).toBe(false)
})

// ===========================================================================
// equals-ignore-case
// ===========================================================================

it('15. { equals-ignore-case } matches case-insensitively', () => {
  const policy = { name: [{ 'equals-ignore-case': 'Alice' }] }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { name: attr('String', 'ALICE') },
    }),
  ).toBe(true)
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { name: attr('String', 'bob') },
    }),
  ).toBe(false)
})

// ===========================================================================
// anything-but variants
// ===========================================================================

it('16. { anything-but: scalar } matches everything except the value', () => {
  const policy = { store: [{ 'anything-but': 'example_corp' }] }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { store: attr('String', 'other') },
    }),
  ).toBe(true)
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { store: attr('String', 'example_corp') },
    }),
  ).toBe(false)
})

it('17. { anything-but: [list] } matches values not in the list', () => {
  const policy = { color: [{ 'anything-but': ['red', 'green'] }] }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { color: attr('String', 'blue') },
    }),
  ).toBe(true)
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { color: attr('String', 'red') },
    }),
  ).toBe(false)
})

it('18. { anything-but: { prefix } } matches values not starting with prefix', () => {
  const policy = { region: [{ 'anything-but': { prefix: 'us-' } }] }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { region: attr('String', 'eu-west-1') },
    }),
  ).toBe(true)
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { region: attr('String', 'us-east-1') },
    }),
  ).toBe(false)
})

// ===========================================================================
// numeric — single op and ranges
// ===========================================================================

it('19. numeric equality { numeric: ["=", n] }', () => {
  const policy = { price: [{ numeric: ['=', 100] }] }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { price: attr('Number', '100') },
    }),
  ).toBe(true)
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { price: attr('Number', '101') },
    }),
  ).toBe(false)
})

it('20. numeric greater-than { numeric: [">", n] }', () => {
  const policy = { price: [{ numeric: ['>', 100] }] }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { price: attr('Number', '150') },
    }),
  ).toBe(true)
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { price: attr('Number', '100') },
    }),
  ).toBe(false)
})

it('21. numeric range { numeric: [">=", 0, "<=", 100] } (inclusive bounds)', () => {
  const policy = { price: [{ numeric: ['>=', 0, '<=', 100] }] }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { price: attr('Number', '0') },
    }),
  ).toBe(true)
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { price: attr('Number', '100') },
    }),
  ).toBe(true)
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { price: attr('Number', '50') },
    }),
  ).toBe(true)
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { price: attr('Number', '101') },
    }),
  ).toBe(false)
})

it('22. numeric open range { numeric: [">", 0, "<", 100] } (exclusive bounds)', () => {
  const policy = { price: [{ numeric: ['>', 0, '<', 100] }] }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { price: attr('Number', '0') },
    }),
  ).toBe(false)
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { price: attr('Number', '1') },
    }),
  ).toBe(true)
})

it('23. numeric condition on a non-numeric value does not match', () => {
  const policy = { price: [{ numeric: ['>', 0] }] }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { price: attr('String', 'not-a-number') },
    }),
  ).toBe(false)
})

// ===========================================================================
// cidr — IPv4 and IPv6
// ===========================================================================

it('24. cidr IPv4 hit', () => {
  const policy = { sourceIp: [{ cidr: '10.0.0.0/24' }] }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { sourceIp: attr('String', '10.0.0.5') },
    }),
  ).toBe(true)
})

it('25. cidr IPv4 miss', () => {
  const policy = { sourceIp: [{ cidr: '10.0.0.0/24' }] }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { sourceIp: attr('String', '10.0.1.5') },
    }),
  ).toBe(false)
})

it('26. cidr IPv4 /32 single-host hit and adjacent miss', () => {
  const policy = { sourceIp: [{ cidr: '192.168.1.10/32' }] }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { sourceIp: attr('String', '192.168.1.10') },
    }),
  ).toBe(true)
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { sourceIp: attr('String', '192.168.1.11') },
    }),
  ).toBe(false)
})

it('27. cidr IPv6 hit', () => {
  const policy = { sourceIp: [{ cidr: '2001:db8::/32' }] }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: {
        sourceIp: attr('String', '2001:db8:1234:5678::1'),
      },
    }),
  ).toBe(true)
})

it('28. cidr IPv6 miss', () => {
  const policy = { sourceIp: [{ cidr: '2001:db8::/32' }] }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { sourceIp: attr('String', '2001:dead::1') },
    }),
  ).toBe(false)
})

it('29. cidr on a malformed IP value does not match', () => {
  const policy = { sourceIp: [{ cidr: '10.0.0.0/24' }] }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { sourceIp: attr('String', 'not-an-ip') },
    }),
  ).toBe(false)
})

// ===========================================================================
// String.Array attributes
// ===========================================================================

it('30. String.Array attribute matches when any element satisfies a condition', () => {
  const policy = { tags: ['urgent'] }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: {
        tags: { DataType: 'String.Array', StringValue: '["low","urgent"]' },
      },
    }),
  ).toBe(true)
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: {
        tags: { DataType: 'String.Array', StringValue: '["low","normal"]' },
      },
    }),
  ).toBe(false)
})

it('31. malformed String.Array JSON does not match', () => {
  const policy = { tags: ['urgent'] }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: {
        tags: { DataType: 'String.Array', StringValue: 'not json' },
      },
    }),
  ).toBe(false)
})

// ===========================================================================
// Binary attributes are skipped (no match)
// ===========================================================================

it('32. a Binary attribute never matches a value condition', () => {
  const policy = { blob: ['x'] }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: {
        blob: { DataType: 'Binary', BinaryValue: 'AQID' },
      },
    }),
  ).toBe(false)
})

// ===========================================================================
// Type / Value alias shape
// ===========================================================================

it('33. attributes using { Type, Value } aliases are read', () => {
  const policy = { store: ['example_corp'] }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: { store: { Type: 'String', Value: 'example_corp' } },
    }),
  ).toBe(true)
})

// ===========================================================================
// OR-of-ANDs via $or
// ===========================================================================

it('34. $or creates alternative branches (OR-of-ANDs)', () => {
  const policy = {
    $or: [{ store: ['a'] }, { store: ['b'] }],
    event: ['order'],
  }
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: {
        store: attr('String', 'a'),
        event: attr('String', 'order'),
      },
    }),
  ).toBe(true)
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: {
        store: attr('String', 'b'),
        event: attr('String', 'order'),
      },
    }),
  ).toBe(true)
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: {
        store: attr('String', 'c'),
        event: attr('String', 'order'),
      },
    }),
  ).toBe(false)
  // The shared AND condition (event) must still hold.
  expect(
    matchesFilterPolicy(policy, {
      messageAttributes: {
        store: attr('String', 'a'),
        event: attr('String', 'other'),
      },
    }),
  ).toBe(false)
})

// ===========================================================================
// MessageBody scope
// ===========================================================================

it('35. body scope: exact match on a top-level field', () => {
  const policy = { store: ['example_corp'] }
  expect(
    matchesFilterPolicy(policy, {
      messageBody: JSON.stringify({ store: 'example_corp' }),
      scope: 'MessageBody',
    }),
  ).toBe(true)
})

it('36. body scope: non-JSON body returns false', () => {
  const policy = { store: ['example_corp'] }
  expect(
    matchesFilterPolicy(policy, {
      messageBody: 'this is not json',
      scope: 'MessageBody',
    }),
  ).toBe(false)
})

it('37. body scope: a JSON non-object (array/number/string) returns false', () => {
  const policy = { store: ['example_corp'] }
  expect(
    matchesFilterPolicy(policy, {
      messageBody: JSON.stringify([1, 2, 3]),
      scope: 'MessageBody',
    }),
  ).toBe(false)
  expect(
    matchesFilterPolicy(policy, {
      messageBody: '42',
      scope: 'MessageBody',
    }),
  ).toBe(false)
})

it('38. body scope: nested keys resolved via dotted policy keys', () => {
  const policy = { 'detail.state': ['confirmed'] }
  expect(
    matchesFilterPolicy(policy, {
      messageBody: JSON.stringify({ detail: { state: 'confirmed' } }),
      scope: 'MessageBody',
    }),
  ).toBe(true)
  expect(
    matchesFilterPolicy(policy, {
      messageBody: JSON.stringify({ detail: { state: 'pending' } }),
      scope: 'MessageBody',
    }),
  ).toBe(false)
})

it('39. body scope: nested policy object resolves the same as a dotted key', () => {
  const policy = { detail: { state: ['confirmed'] } }
  expect(
    matchesFilterPolicy(policy, {
      messageBody: JSON.stringify({ detail: { state: 'confirmed' } }),
      scope: 'MessageBody',
    }),
  ).toBe(true)
})

it('40. body scope: arrays of objects — any element may satisfy', () => {
  const policy = { 'items.sku': ['A1'] }
  const body = {
    items: [{ sku: 'B2' }, { sku: 'A1' }],
  }
  expect(
    matchesFilterPolicy(policy, {
      messageBody: JSON.stringify(body),
      scope: 'MessageBody',
    }),
  ).toBe(true)
})

it('41. body scope: numeric condition over a nested number', () => {
  const policy = { 'order.total': [{ numeric: ['>=', 100] }] }
  expect(
    matchesFilterPolicy(policy, {
      messageBody: JSON.stringify({ order: { total: 250 } }),
      scope: 'MessageBody',
    }),
  ).toBe(true)
  expect(
    matchesFilterPolicy(policy, {
      messageBody: JSON.stringify({ order: { total: 50 } }),
      scope: 'MessageBody',
    }),
  ).toBe(false)
})

it('42. body scope: exists on a nested field', () => {
  const policy = { detail: { reason: [{ exists: false }] } }
  expect(
    matchesFilterPolicy(policy, {
      messageBody: JSON.stringify({ detail: { state: 'confirmed' } }),
      scope: 'MessageBody',
    }),
  ).toBe(true)
  expect(
    matchesFilterPolicy(policy, {
      messageBody: JSON.stringify({ detail: { reason: 'x' } }),
      scope: 'MessageBody',
    }),
  ).toBe(false)
})

it('43. body scope: empty policy matches any object', () => {
  expect(
    matchesFilterPolicy(
      {},
      { messageBody: JSON.stringify({ any: 'thing' }), scope: 'MessageBody' },
    ),
  ).toBe(true)
})

it('44. body scope: a numeric payload matches a bare numeric condition (typed equality)', () => {
  // Unlike attributes (always strings), a JSON-decoded number compares equal
  // to a bare numeric condition: 100 === 100.
  const policy = { count: [100] }
  expect(
    matchesFilterPolicy(policy, {
      messageBody: JSON.stringify({ count: 100 }),
      scope: 'MessageBody',
    }),
  ).toBe(true)
  expect(
    matchesFilterPolicy(policy, {
      messageBody: JSON.stringify({ count: 101 }),
      scope: 'MessageBody',
    }),
  ).toBe(false)
})

it('45. body scope: $or OR-of-ANDs over the body', () => {
  const policy = {
    $or: [{ kind: ['a'] }, { kind: ['b'] }],
  }
  expect(
    matchesFilterPolicy(policy, {
      messageBody: JSON.stringify({ kind: 'b' }),
      scope: 'MessageBody',
    }),
  ).toBe(true)
  expect(
    matchesFilterPolicy(policy, {
      messageBody: JSON.stringify({ kind: 'c' }),
      scope: 'MessageBody',
    }),
  ).toBe(false)
})
