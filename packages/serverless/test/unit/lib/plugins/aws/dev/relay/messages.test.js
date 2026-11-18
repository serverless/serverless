import { describe, expect, test } from '@jest/globals'
import {
  AWAY_WINDOW_MS,
  NOT_RUN_WINDOW_MS,
  awayLine,
  clockOffLine,
  connectionLostLine,
  createAwayCount,
  createClockWarning,
  createNotRunWarning,
  credentialSourceOf,
  credentialsExpiredLine,
  credentialsFixLine,
  credentialsWorkAgainLine,
  lateLine,
  livenessDeniedLine,
  livenessUnansweredLine,
  newBrokerLine,
  reconnectedLine,
  refusedLine,
  sideChannelOffLine,
  throughputLine,
} from '../../../../../../../lib/plugins/aws/dev/relay/messages.js'
import { manualClock } from './manual-clock.js'

describe('where the credentials come from', () => {
  // A provider of a run the CLI told where its credentials come from.
  const told = (awsCredentialSource) => ({
    getProfile: () => 'dev',
    serverless: { awsCredentialSource },
  })

  test('a Dashboard Provider', () => {
    expect(
      credentialsFixLine(credentialSourceOf(told({ source: 'dashboard' }))),
    ).toBe(
      "The credentials come from the org's Serverless Dashboard Provider: check that Provider's settings.",
    )
  })

  test('an aws resolver in serverless.yml, by name', () => {
    expect(
      credentialsFixLine(
        credentialSourceOf(
          told({ source: 'profile', profile: 'ops', resolver: 'awsOps' }),
        ),
      ),
    ).toBe(
      'The credentials come from AWS profile "ops", set by resolver "awsOps" in serverless.yml: sign in again with "serverless login aws --aws-profile ops" (or "serverless login aws sso" for an SSO profile) in an interactive terminal, update the profile\'s keys, or change the profile of resolver "awsOps".',
    )
    expect(
      credentialsFixLine(
        credentialSourceOf(
          told({ source: 'resolver-config', resolver: 'awsKeys' }),
        ),
      ),
    ).toBe(
      'The credentials come from accessKeyId/secretAccessKey in the aws resolver configuration in serverless.yml: update them.',
    )
  })

  test('a profile the CLI found, as the profile and environment rule says', () => {
    expect(
      credentialsFixLine(
        credentialSourceOf(told({ source: 'profile', profile: 'dev' })),
      ),
    ).toMatch(/^The credentials come from AWS profile "dev": sign in again/)
    expect(
      credentialsFixLine(credentialSourceOf(told({ source: 'env' }))),
    ).toMatch(
      /^The credentials come from AWS_ACCESS_KEY_ID\/AWS_SECRET_ACCESS_KEY in the environment/,
    )
  })

  test('without the source the CLI found, the profile the command names, then the environment', () => {
    expect(credentialSourceOf({ getProfile: () => 'dev' }, {})).toEqual({
      source: 'profile',
      profile: 'dev',
    })
    expect(
      credentialSourceOf(
        { getProfile: () => undefined },
        { AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 'b' },
      ),
    ).toEqual({ source: 'env' })
    // A provider of a run that was not told (the CLI outside a service, a test).
    expect(
      credentialSourceOf({ getProfile: () => 'dev', serverless: {} }, {}),
    ).toEqual({
      source: 'profile',
      profile: 'dev',
    })
  })
})

describe('the relay lines', () => {
  test('say what happens to invocations, in Dev Mode words', () => {
    expect(connectionLostLine('the connection closed')).toBe(
      'Dev Mode lost its connection to AWS IoT Core (the connection closed). Invocations run the deployed code until this machine reconnects.',
    )
    expect(reconnectedLine(12_400)).toBe(
      'Dev Mode reconnected to AWS IoT Core after 12 s offline.',
    )
    expect(reconnectedLine(80)).toBe(
      'Dev Mode reconnected to AWS IoT Core after 1 s offline.',
    )
    const devSso = credentialSourceOf({ getProfile: () => 'dev-sso' }, {})
    expect(credentialsExpiredLine(devSso)).toBe(
      'Your AWS credentials expired, so Dev Mode cannot reconnect and invocations run the deployed code; Dev Mode keeps trying. The credentials come from AWS profile "dev-sso": sign in again with "serverless login aws --aws-profile dev-sso" (or "serverless login aws sso" for an SSO profile) in an interactive terminal, update the profile\'s keys, or choose another profile with --aws-profile.',
    )
    expect(credentialsExpiredLine(devSso)).not.toContain('aws sso login')
    // Keys in the environment, and no profile named: the advice is about those keys.
    expect(
      credentialsExpiredLine(
        credentialSourceOf(
          { getProfile: () => undefined },
          { AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 'b' },
        ),
      ),
    ).toContain(
      'The credentials come from AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY in the environment',
    )
    expect(credentialsWorkAgainLine()).toBe(
      'Your AWS credentials work again; Dev Mode is reconnecting to AWS IoT Core.',
    )
    expect(throughputLine(1)).toBe(
      '1 invocation ran the deployed code: Dev Mode relays up to about 20 per second.',
    )
    expect(throughputLine(3)).toMatch(/^3 invocations ran/)
    expect(lateLine(1)).toBe(
      "1 invocation ran the deployed code: it reached this machine too late to run here (this machine was asleep, the network was slow, or this machine's clock is ahead of AWS's).",
    )
    expect(lateLine(3)).toMatch(
      /^3 invocations ran the deployed code: they reached this machine too late/,
    )
    expect(lateLine(3)).not.toMatch(/per second/)
    expect(refusedLine(1, 0x87)).toBe(
      '1 invocation ran the deployed code: AWS IoT Core refused the acceptance this machine sent for it (reason code 0x87, not authorized).',
    )
    expect(refusedLine(2, 0x83)).toBe(
      '2 invocations ran the deployed code: AWS IoT Core refused the acceptances this machine sent for them (reason code 0x83, implementation specific error).',
    )
    expect(refusedLine(1, 0xa2)).toMatch(/\(reason code 0xa2\)\.$/)
    expect(newBrokerLine()).toBe(
      'The new IAM role can take up to 3 minutes to work; until then some invocations run the deployed code.',
    )
    expect(newBrokerLine({ functions: false, webApps: true })).toBe(
      'The new IAM role can take up to 3 minutes to work; until then some web app requests run the deployed code.',
    )
    expect(newBrokerLine({ functions: true, webApps: true })).toBe(
      'The new IAM role can take up to 3 minutes to work; until then some invocations and web app requests run the deployed code.',
    )
    expect(
      newBrokerLine({ widened: true, functions: true, webApps: true }),
    ).toBe(
      "The IAM role's updated trust policy can take up to 3 minutes to work; until then some web app requests run the deployed code.",
    )
    expect(sideChannelOffLine('the bucket uses SSE-C')).toMatch(
      /^Payloads above 126 KB cannot be relayed in this session: the bucket uses SSE-C\./,
    )
    expect(livenessDeniedLine('iot:SendDirectMessage was denied')).toMatch(
      /yours are attached to this session\.$/,
    )
    expect(livenessUnansweredLine('AWS IoT Core did not answer in time')).toBe(
      'Dev Mode could not learn whether another Dev Mode session is running (AWS IoT Core did not answer in time), so its functions stay with it. Run "serverless dev --take-over" to take them.',
    )
    expect(clockOffLine()).toBe(
      'This machine\'s clock moved by more than a minute while Dev Mode ran, so Dev Mode cannot tell invocations from replayed ones, and the deployed code is answering them. Check that the clock is set automatically, then run "serverless dev" again.',
    )
    for (const line of [
      connectionLostLine('x'),
      reconnectedLine(1),
      throughputLine(2),
      lateLine(2),
      refusedLine(2, 0x87),
      newBrokerLine('r'),
      clockOffLine(),
    ]) {
      expect(line).not.toMatch(/\b(local|cloud)\b/i)
    }
  })

  test('the throughput warning comes once per burst and at most once per window, and leaves no timer', async () => {
    let time = 0
    const due = new Map()
    let next = 0
    const timers = {
      setTimeout: (fn, ms) => {
        next += 1
        due.set(next, { fn, at: time + ms })
        return next
      },
      clearTimeout: (h) => due.delete(h),
    }
    const advance = (ms) => {
      const end = time + ms
      for (;;) {
        const [h, t] =
          [...due.entries()].sort((a, b) => a[1].at - b[1].at)[0] ?? []
        if (!t || t.at > end) break
        time = t.at
        due.delete(h)
        t.fn()
      }
      time = end
    }
    const lines = []
    // A warning always says something: building one without its line is a mistake caught at once.
    expect(() => createNotRunWarning({ warn: () => {}, timers })).toThrow(
      'createNotRunWarning needs the line it prints',
    )
    const warning = createNotRunWarning({
      warn: (line) => lines.push(line),
      now: () => time,
      timers,
      line: throughputLine,
    })
    for (let i = 0; i < 5; i++) warning.notRun()
    advance(1_000)
    expect(lines).toEqual([throughputLine(5)])
    warning.notRun()
    advance(1_000)
    expect(lines).toHaveLength(1)
    warning.notRun()
    advance(NOT_RUN_WINDOW_MS)
    expect(lines).toEqual([throughputLine(5), throughputLine(2)])
    warning.notRun()
    warning.stop()
    expect(due.size).toBe(0)
  })

  test('a warning built with another line counts and says that line', () => {
    let time = 0
    const due = []
    const timers = {
      setTimeout: (fn, ms) => due.push({ fn, at: time + ms }),
      clearTimeout: () => {},
    }
    const lines = []
    const warning = createNotRunWarning({
      warn: (line) => lines.push(line),
      now: () => time,
      timers,
      line: lateLine,
    })
    warning.notRun()
    warning.notRun()
    time = 1_000
    due.shift().fn()
    expect(lines).toEqual([lateLine(2)])
  })

  test("a warning's line gets the detail of the last refusal it counted", () => {
    let time = 0
    const due = []
    const timers = {
      setTimeout: (fn, ms) => due.push({ fn, at: time + ms }),
      clearTimeout: () => {},
    }
    const lines = []
    const warning = createNotRunWarning({
      warn: (line) => lines.push(line),
      now: () => time,
      timers,
      line: refusedLine,
    })
    warning.notRun(0x80)
    warning.notRun(0x87)
    time = 1_000
    due.shift().fn()
    expect(lines).toEqual([refusedLine(2, 0x87)])
  })

  test('the clock line comes once, after two refusals in a row of requests that look too old', () => {
    const lines = []
    const warning = createClockWarning({ warn: (line) => lines.push(line) })
    warning.stale(1)
    expect(lines).toEqual([])
    // A request that was not too old came in between: the count starts again.
    warning.stale(1)
    expect(lines).toEqual([])
    warning.stale(2)
    expect(lines).toEqual([clockOffLine()])
    warning.stale(3)
    warning.stale(2)
    expect(lines).toHaveLength(1)
  })
})

describe('the away line', () => {
  test('says at least how many, and names up to five functions, most first', () => {
    expect(awayLine([{ functionKey: 'createOrder', count: 1 }])).toBe(
      'At least 1 invocation ran the deployed code while Dev Mode could not reach this session (createOrder ×1).',
    )
    expect(
      awayLine([
        { functionKey: 'a', count: 2 },
        { functionKey: 'b', count: 1 },
      ]),
    ).toBe(
      'At least 3 invocations ran the deployed code while Dev Mode could not reach this session (a ×2, b ×1).',
    )
    const seven = [7, 6, 5, 4, 3, 2, 1].map((count) => ({
      functionKey: `f${8 - count}`,
      count,
    }))
    expect(awayLine(seven)).toBe(
      'At least 28 invocations ran the deployed code while Dev Mode could not reach this session (f1 ×7, f2 ×6, f3 ×5, f4 ×4, f5 ×3, …and 2 more).',
    )
  })
})

describe('the away count', () => {
  const start = () => {
    const clock = manualClock()
    const lines = []
    const records = []
    const away = createAwayCount({
      warn: (line) => lines.push(line),
      record: (fields) => records.push(fields),
      timers: clock.timers,
    })
    return { clock, lines, records, away }
  }

  test('sums what arrives within five seconds of a reconnect into one line and one record per function', async () => {
    const { clock, lines, records, away } = start()
    away.reconnected()
    away.passed({ functionKey: 'b', count: 1 })
    await clock.advance(AWAY_WINDOW_MS - 1_000)
    away.passed({ functionKey: 'a', count: 2 })
    away.passed({ functionKey: 'b', count: 1 })
    expect(lines).toEqual([])
    await clock.advance(1_000)
    expect(lines).toEqual([
      'At least 4 invocations ran the deployed code while Dev Mode could not reach this session (a ×2, b ×2).',
    ])
    expect(records).toEqual([
      { function: 'a', count: 2, reason: 'offline', at_least: true },
      { function: 'b', count: 2, reason: 'offline', at_least: true },
    ])
    expect(clock.live()).toBe(0)
  })

  test('a count with no reconnect before it opens a window of its own', async () => {
    const { clock, lines, away } = start()
    away.passed({ functionKey: 'a', count: 1 })
    await clock.advance(AWAY_WINDOW_MS - 1)
    expect(lines).toEqual([])
    await clock.advance(1)
    expect(lines).toHaveLength(1)
    // A later count is a new line.
    away.passed({ functionKey: 'a', count: 2 })
    await clock.advance(AWAY_WINDOW_MS)
    expect(lines[1]).toContain('At least 2 invocations')
  })

  test('a reconnect with no count says nothing', async () => {
    const { clock, lines, records, away } = start()
    away.reconnected()
    await clock.advance(AWAY_WINDOW_MS)
    expect(lines).toEqual([])
    expect(records).toEqual([])
    expect(clock.live()).toBe(0)
  })

  test('stopping records what it holds without a line, leaves no timer, and counts nothing after', async () => {
    const { clock, lines, records, away } = start()
    away.passed({ functionKey: 'a', count: 3 })
    away.stop()
    expect(lines).toEqual([])
    expect(records).toEqual([
      { function: 'a', count: 3, reason: 'offline', at_least: true },
    ])
    expect(clock.live()).toBe(0)
    away.passed({ functionKey: 'a', count: 1 })
    away.reconnected()
    await clock.advance(AWAY_WINDOW_MS)
    expect(records).toHaveLength(1)
    expect(clock.live()).toBe(0)
  })
})
