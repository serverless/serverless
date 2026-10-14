import { describe, expect, test } from '@jest/globals'

const { shouldWarnEdgeFirstByteBudget } =
  await import('../../../../../../lib/plugins/aws/mcp/lib/endpoint-type.js')

// The ~29 s first-byte budget belongs to CloudFront, so the warning about it
// belongs to the endpoints CloudFront fronts. A regional or private endpoint
// carries the integration timeout instead - a live 35 s tool call returns 200
// through a dev session on `endpointType: REGIONAL` - and the generic
// configured-timeout warning already owns that bound.
describe('shouldWarnEdgeFirstByteBudget', () => {
  test('warns on the edge-optimized default the provider leaves unset', () => {
    expect(
      shouldWarnEdgeFirstByteBudget({
        provider: { runtime: 'nodejs20.x' },
        executionTimeInMs: 29001,
      }),
    ).toBe(true)
  })

  test.each(['EDGE', 'edge', 'Edge'])('warns on an explicit %s', (value) => {
    expect(
      shouldWarnEdgeFirstByteBudget({
        provider: { endpointType: value },
        executionTimeInMs: 35000,
      }),
    ).toBe(true)
  })

  test.each(['REGIONAL', 'regional', 'PRIVATE', 'private'])(
    'stays silent on %s',
    (value) => {
      expect(
        shouldWarnEdgeFirstByteBudget({
          provider: { endpointType: value },
          executionTimeInMs: 35000,
        }),
      ).toBe(false)
    },
  )

  test.each([29000, 1200, 0])(
    'stays silent at %sms, inside the budget',
    (executionTimeInMs) => {
      expect(
        shouldWarnEdgeFirstByteBudget({ provider: {}, executionTimeInMs }),
      ).toBe(false)
    },
  )

  // An endpoint type the resolver cannot place is treated as edge: an
  // over-eager warning costs a line of output, a missing one costs a dropped
  // response the user has to rediscover.
  test.each([
    ['an unrecognized value', { endpointType: 'ORBITAL' }],
    ['a non-string value', { endpointType: 42 }],
    ['no provider at all', undefined],
  ])('warns on %s', (_label, provider) => {
    expect(
      shouldWarnEdgeFirstByteBudget({ provider, executionTimeInMs: 35000 }),
    ).toBe(true)
  })
})
