import { matchesEventPattern } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/eventbridge/rule-engine.js'

/**
 * A representative EventBridge event used across the matching corpus. Mirrors
 * the envelope EventBridge wraps around a PutEvents entry (top-level metadata
 * plus a nested `detail` object).
 */
function sampleEvent(overrides = {}) {
  return {
    version: '0',
    id: '12345678-1234-1234-1234-123456789012',
    'detail-type': 'EC2 Instance State-change Notification',
    source: 'aws.ec2',
    account: '000000000000',
    time: '2026-05-31T12:00:00Z',
    region: 'us-east-1',
    resources: ['arn:aws:ec2:us-east-1:000000000000:instance/i-abc'],
    detail: {
      'instance-id': 'i-abc',
      state: 'running',
      cpu: 42,
      tags: ['prod', 'web'],
    },
    ...overrides,
  }
}

// ===========================================================================
// Empty / absent pattern
// ===========================================================================

it('1. an empty pattern object matches any event', () => {
  expect(matchesEventPattern({}, sampleEvent())).toBe(true)
})

it('2. a null/undefined pattern matches any event', () => {
  expect(matchesEventPattern(null, sampleEvent())).toBe(true)
  expect(matchesEventPattern(undefined, sampleEvent())).toBe(true)
})

// ===========================================================================
// Top-level field matching (source / detail-type)
// ===========================================================================

it('3. matches on source', () => {
  expect(matchesEventPattern({ source: ['aws.ec2'] }, sampleEvent())).toBe(true)
})

it('4. does not match a different source', () => {
  expect(matchesEventPattern({ source: ['aws.s3'] }, sampleEvent())).toBe(false)
})

it('5. matches on a detail-type value listed in an array (OR within field)', () => {
  const pattern = {
    'detail-type': [
      'EC2 Instance State-change Notification',
      'Some Other Type',
    ],
  }
  expect(matchesEventPattern(pattern, sampleEvent())).toBe(true)
})

it('6. all specified top-level keys must match (AND across keys)', () => {
  const matching = {
    source: ['aws.ec2'],
    'detail-type': ['EC2 Instance State-change Notification'],
  }
  expect(matchesEventPattern(matching, sampleEvent())).toBe(true)

  const oneWrong = {
    source: ['aws.ec2'],
    'detail-type': ['Nope'],
  }
  expect(matchesEventPattern(oneWrong, sampleEvent())).toBe(false)
})

it('7. a pattern key absent from the event does not match', () => {
  expect(matchesEventPattern({ missing: ['x'] }, sampleEvent())).toBe(false)
})

// ===========================================================================
// Nested detail matching
// ===========================================================================

it('8. matches on a nested detail field by exact value', () => {
  expect(
    matchesEventPattern({ detail: { state: ['running'] } }, sampleEvent()),
  ).toBe(true)
})

it('9. does not match a wrong nested detail value', () => {
  expect(
    matchesEventPattern({ detail: { state: ['stopped'] } }, sampleEvent()),
  ).toBe(false)
})

it('10. matches a value inside a detail array field', () => {
  expect(
    matchesEventPattern({ detail: { tags: ['web'] } }, sampleEvent()),
  ).toBe(true)
})

// ===========================================================================
// numeric operator (single + range)
// ===========================================================================

it('11. numeric single comparison matches', () => {
  expect(
    matchesEventPattern(
      { detail: { cpu: [{ numeric: ['>', 40] }] } },
      sampleEvent(),
    ),
  ).toBe(true)
})

it('12. numeric single comparison fails when out of range', () => {
  expect(
    matchesEventPattern(
      { detail: { cpu: [{ numeric: ['>', 50] }] } },
      sampleEvent(),
    ),
  ).toBe(false)
})

it('13. numeric range comparison matches', () => {
  expect(
    matchesEventPattern(
      { detail: { cpu: [{ numeric: ['>=', 40, '<', 50] }] } },
      sampleEvent(),
    ),
  ).toBe(true)
})

it('14. numeric equality matches', () => {
  expect(
    matchesEventPattern(
      { detail: { cpu: [{ numeric: ['=', 42] }] } },
      sampleEvent(),
    ),
  ).toBe(true)
})

it('15. numeric does not match a non-numeric string value', () => {
  const event = sampleEvent()
  event.detail.cpu = '42'
  expect(
    matchesEventPattern({ detail: { cpu: [{ numeric: ['=', 42] }] } }, event),
  ).toBe(false)
})

// ===========================================================================
// prefix / suffix / equals-ignore-case
// ===========================================================================

it('16. prefix matches', () => {
  expect(
    matchesEventPattern({ source: [{ prefix: 'aws.' }] }, sampleEvent()),
  ).toBe(true)
})

it('17. prefix does not match', () => {
  expect(
    matchesEventPattern({ source: [{ prefix: 'gcp.' }] }, sampleEvent()),
  ).toBe(false)
})

it('18. prefix equals-ignore-case matches', () => {
  expect(
    matchesEventPattern(
      { source: [{ prefix: { 'equals-ignore-case': 'AWS.' } }] },
      sampleEvent(),
    ),
  ).toBe(true)
})

it('19. suffix matches', () => {
  expect(
    matchesEventPattern(
      { detail: { 'instance-id': [{ suffix: 'abc' }] } },
      sampleEvent(),
    ),
  ).toBe(true)
})

it('20. suffix equals-ignore-case matches', () => {
  expect(
    matchesEventPattern(
      {
        detail: {
          'instance-id': [{ suffix: { 'equals-ignore-case': 'ABC' } }],
        },
      },
      sampleEvent(),
    ),
  ).toBe(true)
})

it('21. equals-ignore-case matches regardless of case', () => {
  expect(
    matchesEventPattern(
      { detail: { state: [{ 'equals-ignore-case': 'RUNNING' }] } },
      sampleEvent(),
    ),
  ).toBe(true)
})

// ===========================================================================
// exists
// ===========================================================================

it('22. exists:true matches a present field', () => {
  expect(
    matchesEventPattern(
      { detail: { state: [{ exists: true }] } },
      sampleEvent(),
    ),
  ).toBe(true)
})

it('23. exists:true does not match an absent field', () => {
  expect(
    matchesEventPattern(
      { detail: { absent: [{ exists: true }] } },
      sampleEvent(),
    ),
  ).toBe(false)
})

it('24. exists:false matches an absent field', () => {
  expect(
    matchesEventPattern(
      { detail: { absent: [{ exists: false }] } },
      sampleEvent(),
    ),
  ).toBe(true)
})

it('25. exists:false does not match a present field', () => {
  expect(
    matchesEventPattern(
      { detail: { state: [{ exists: false }] } },
      sampleEvent(),
    ),
  ).toBe(false)
})

// ===========================================================================
// anything-but (scalar / list / prefix / suffix / equals-ignore-case)
// ===========================================================================

it('26. anything-but scalar matches when value differs', () => {
  expect(
    matchesEventPattern(
      { detail: { state: [{ 'anything-but': 'stopped' }] } },
      sampleEvent(),
    ),
  ).toBe(true)
})

it('27. anything-but scalar fails when value equals', () => {
  expect(
    matchesEventPattern(
      { detail: { state: [{ 'anything-but': 'running' }] } },
      sampleEvent(),
    ),
  ).toBe(false)
})

it('28. anything-but list matches when value not in list', () => {
  expect(
    matchesEventPattern(
      { detail: { state: [{ 'anything-but': ['stopped', 'pending'] }] } },
      sampleEvent(),
    ),
  ).toBe(true)
})

it('29. anything-but prefix matches when value lacks the prefix', () => {
  expect(
    matchesEventPattern(
      { source: [{ 'anything-but': { prefix: 'gcp.' } }] },
      sampleEvent(),
    ),
  ).toBe(true)
})

it('30. anything-but prefix fails when value has the prefix', () => {
  expect(
    matchesEventPattern(
      { source: [{ 'anything-but': { prefix: 'aws.' } }] },
      sampleEvent(),
    ),
  ).toBe(false)
})

it('31. anything-but on an absent field never matches', () => {
  expect(
    matchesEventPattern(
      { detail: { absent: [{ 'anything-but': 'x' }] } },
      sampleEvent(),
    ),
  ).toBe(false)
})

// ===========================================================================
// $or across sub-patterns
// ===========================================================================

it('32. $or matches when one branch matches', () => {
  const pattern = {
    $or: [{ source: ['aws.s3'] }, { source: ['aws.ec2'] }],
  }
  expect(matchesEventPattern(pattern, sampleEvent())).toBe(true)
})

it('33. $or fails when no branch matches', () => {
  const pattern = {
    $or: [{ source: ['aws.s3'] }, { source: ['aws.sns'] }],
  }
  expect(matchesEventPattern(pattern, sampleEvent())).toBe(false)
})

it('34. $or combined with a sibling key requires both', () => {
  const pattern = {
    'detail-type': ['EC2 Instance State-change Notification'],
    $or: [{ source: ['aws.s3'] }, { source: ['aws.ec2'] }],
  }
  expect(matchesEventPattern(pattern, sampleEvent())).toBe(true)

  const failing = {
    'detail-type': ['Nope'],
    $or: [{ source: ['aws.s3'] }, { source: ['aws.ec2'] }],
  }
  expect(matchesEventPattern(failing, sampleEvent())).toBe(false)
})

// ===========================================================================
// cidr
// ===========================================================================

it('35. cidr matches an IPv4 address in range', () => {
  const event = sampleEvent()
  event.detail['source-ip'] = '10.0.0.5'
  expect(
    matchesEventPattern(
      { detail: { 'source-ip': [{ cidr: '10.0.0.0/24' }] } },
      event,
    ),
  ).toBe(true)
})

it('36. cidr does not match an IPv4 address out of range', () => {
  const event = sampleEvent()
  event.detail['source-ip'] = '10.0.1.5'
  expect(
    matchesEventPattern(
      { detail: { 'source-ip': [{ cidr: '10.0.0.0/24' }] } },
      event,
    ),
  ).toBe(false)
})

it('37. cidr matches an IPv6 address in range', () => {
  const event = sampleEvent()
  event.detail['source-ip'] = '2001:db8::1'
  expect(
    matchesEventPattern(
      { detail: { 'source-ip': [{ cidr: '2001:db8::/32' }] } },
      event,
    ),
  ).toBe(true)
})

// ===========================================================================
// JSON-string inputs
// ===========================================================================

it('38. a JSON-string pattern is parsed', () => {
  expect(matchesEventPattern('{"source":["aws.ec2"]}', sampleEvent())).toBe(
    true,
  )
})

it('39. a JSON-string event is parsed', () => {
  expect(
    matchesEventPattern({ source: ['aws.ec2'] }, JSON.stringify(sampleEvent())),
  ).toBe(true)
})

it('40. a non-object JSON event never matches', () => {
  expect(matchesEventPattern({ source: ['aws.ec2'] }, '42')).toBe(false)
  expect(matchesEventPattern({ source: ['aws.ec2'] }, 'not json')).toBe(false)
})

// ===========================================================================
// A fully non-matching event
// ===========================================================================

it('41. a comprehensive pattern that does not match the event', () => {
  const pattern = {
    source: ['aws.ec2'],
    'detail-type': ['EC2 Instance State-change Notification'],
    detail: {
      state: ['stopped'],
    },
  }
  expect(matchesEventPattern(pattern, sampleEvent())).toBe(false)
})

it('42. a comprehensive pattern that does match the event', () => {
  const pattern = {
    source: [{ prefix: 'aws.' }],
    'detail-type': ['EC2 Instance State-change Notification'],
    detail: {
      state: ['running'],
      cpu: [{ numeric: ['>=', 40, '<=', 50] }],
    },
  }
  expect(matchesEventPattern(pattern, sampleEvent())).toBe(true)
})

// ===========================================================================
// Typed equality (mirroring Python ==): number vs string
// ===========================================================================

it('43. an exact numeric value matches a numeric event field', () => {
  expect(matchesEventPattern({ detail: { cpu: [42] } }, sampleEvent())).toBe(
    true,
  )
})

it('44. a string "42" does not match a numeric 42 (typed equality)', () => {
  expect(matchesEventPattern({ detail: { cpu: ['42'] } }, sampleEvent())).toBe(
    false,
  )
})

it('45. boolean and null exact equality', () => {
  const event = sampleEvent()
  event.detail.flag = true
  event.detail.empty = null
  expect(matchesEventPattern({ detail: { flag: [true] } }, event)).toBe(true)
  expect(matchesEventPattern({ detail: { empty: [null] } }, event)).toBe(true)
  expect(matchesEventPattern({ detail: { flag: [false] } }, event)).toBe(false)
})
