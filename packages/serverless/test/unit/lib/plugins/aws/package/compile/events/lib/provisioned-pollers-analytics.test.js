import { buildProvisionedPollersAnalytics } from '../../../../../../../../../lib/plugins/aws/package/compile/events/lib/provisioned-pollers-analytics.js'

const configWith = (events) => ({
  service: 'svc',
  functions: { fn: { events } },
})

test('returns {} when no event uses the key', () => {
  expect(
    buildProvisionedPollersAnalytics(
      configWith([{ sqs: { arn: 'arn:aws:sqs:r:a:q' } }]),
    ),
  ).toEqual({})
})

test('reports per-source configured counts and sorted unique bounds', () => {
  const out = buildProvisionedPollersAnalytics({
    service: 'svc',
    functions: {
      a: {
        events: [
          { sqs: { arn: 'q1', provisionedPollers: { min: 5, max: 500 } } },
          { sqs: { arn: 'q2', provisionedPollers: { max: 500 } } },
        ],
      },
      b: {
        events: [
          {
            kafka: {
              topic: 't',
              provisionedPollers: { min: 1, max: 100, group: 'g1' },
            },
          },
        ],
      },
    },
  })
  expect(out).toEqual({
    provisionedPollers: {
      sqs: { configured: 2, min: [5], max: [500] },
      kafka: { configured: 1, min: [1], max: [100], groups: 1 },
    },
  })
})

test('reports explicit disables', () => {
  const out = buildProvisionedPollersAnalytics(
    configWith([{ sqs: { arn: 'q', provisionedPollers: false } }]),
  )
  expect(out).toEqual({ provisionedPollers: { sqs: { disabled: 1 } } })
})

test('never reports the group name string', () => {
  const out = buildProvisionedPollersAnalytics(
    configWith([
      {
        msk: {
          arn: 'a',
          topic: 't',
          provisionedPollers: { min: 1, group: 'secret-name' },
        },
      },
    ]),
  )
  expect(JSON.stringify(out)).not.toContain('secret-name')
  expect(out.provisionedPollers.msk.groups).toBe(1)
})

test('never reports groups for sqs (group is invalid config there)', () => {
  const out = buildProvisionedPollersAnalytics(
    configWith([
      { sqs: { arn: 'q', provisionedPollers: { min: 2, group: 'smuggled' } } },
      { kafka: { topic: 't', provisionedPollers: { min: 1, group: 'g' } } },
    ]),
  )
  expect(out.provisionedPollers.sqs).toEqual({ configured: 1, min: [2] })
  expect(out.provisionedPollers.kafka.groups).toBe(1)
})

test('is total: throwing getters degrade to {}', () => {
  const evil = {}
  Object.defineProperty(evil, 'functions', {
    get() {
      throw new Error('boom')
    },
  })
  expect(buildProvisionedPollersAnalytics(evil)).toEqual({})
})

test('is total: malformed shapes degrade gracefully', () => {
  expect(buildProvisionedPollersAnalytics(null)).toEqual({})
  expect(
    buildProvisionedPollersAnalytics(
      configWith([
        { sqs: 'arn:aws:sqs:r:a:q' },
        null,
        { sqs: { provisionedPollers: 'junk' } },
      ]),
    ),
  ).toEqual({})
})
