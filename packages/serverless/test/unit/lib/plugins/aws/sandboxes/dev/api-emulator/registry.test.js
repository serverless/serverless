'use strict'

import { EmulatorRegistry } from '../../../../../../../../lib/plugins/aws/sandboxes/dev/api-emulator/registry.js'

// Fake clock: tests advance time explicitly; no real waiting.
function clock(start = 0) {
  let t = start
  return { now: () => t, advance: (ms) => (t += ms) }
}

const make = (now) =>
  new EmulatorRegistry({
    sandboxName: 'echo',
    minimumMemoryInMiB: 2048,
    imageArn: 'arn:aws:lambda:us-east-1:000000000000:microvm-image:echo-dev',
    idFactory: (() => {
      let n = 0
      return () => `mvm-${++n}`
    })(),
    now,
  })

const noop = async () => {}
const POLICY = {
  maxIdleDurationSeconds: 60,
  suspendedDurationSeconds: 0,
  autoResumeEnabled: false,
}

test('getImage returns CREATED with the real field names + version 1.0', () => {
  const img = make().getImage('any-arn')
  expect(img.state).toBe('CREATED')
  expect(img.latestActiveImageVersion).toBe('1.0')
  expect(img.imageArn).toBe('any-arn') // real response uses imageArn, not imageIdentifier
})

test('getImageVersion echoes memory + a base image version', () => {
  const v = make().getImageVersion('arn', '1')
  expect(v.resources[0].minimumMemoryInMiB).toBe(2048)
  expect(v.baseImageVersion).toBeTruthy()
})

test('instance lifecycle: PENDING -> RUNNING -> TERMINATED', () => {
  const r = make()
  const id = r.createInstance({
    portMap: { 8080: 50000 },
    stopFn: noop,
    idlePolicy: POLICY,
  })
  expect(id).toBe('mvm-1')
  expect(r.getInstance(id).state).toBe('PENDING')
  r.markRunning(id, { endpoint: 'http://127.0.0.1:40001', proxyServer: {} })
  expect(r.getInstance(id).state).toBe('RUNNING')
  expect(r.getInstance(id).endpoint).toBe('http://127.0.0.1:40001')
  expect(r.terminate(id).state).toBe('TERMINATED')
})

test('token issue/validate is per-instance; allowedPorts gates ports', () => {
  const r = make()
  const id = r.createInstance({
    portMap: { 8080: 50000 },
    stopFn: noop,
    idlePolicy: POLICY,
  })
  const token = r.issueToken(id, [8080])
  expect(r.validateToken(id, token)).toBe(true)
  expect(r.validateToken(id, 'nope')).toBe(false)
  expect(r.validateToken(id, undefined)).toBe(false)
  expect(r.validateToken('mvm-999', token)).toBe(false)
  // allowedPorts gating (real AWS returns 403 "Access to port denied" for a disallowed port)
  expect(r.isPortAllowed(id, 8080)).toBe(true)
  expect(r.isPortAllowed(id, 9999)).toBe(false)
})

test('a token is rejected once its expiration window passes', () => {
  const c = clock()
  const r = make(c.now)
  const id = r.createInstance({ portMap: {}, stopFn: noop, idlePolicy: POLICY })
  const token = r.issueToken(id, [8080], 10) // 10-minute expiry
  expect(r.validateToken(id, token)).toBe(true)
  c.advance(9 * 60_000) // still inside the window
  expect(r.validateToken(id, token)).toBe(true)
  c.advance(2 * 60_000) // now past 10 minutes
  expect(r.validateToken(id, token)).toBe(false)
})

test('issued tokens do not stay valid forever (default expiration applies)', () => {
  const c = clock()
  const r = make(c.now)
  const id = r.createInstance({ portMap: {}, stopFn: noop, idlePolicy: POLICY })
  const token = r.issueToken(id, [8080]) // no explicit expiration
  expect(r.validateToken(id, token)).toBe(true)
  c.advance(365 * 24 * 60 * 60_000) // a year later
  expect(r.validateToken(id, token)).toBe(false)
})

test('liveInstances excludes terminated', () => {
  const r = make()
  const a = r.createInstance({ portMap: {}, stopFn: noop, idlePolicy: POLICY })
  const b = r.createInstance({ portMap: {}, stopFn: noop, idlePolicy: POLICY })
  r.terminate(a)
  expect(r.liveInstances().map((i) => i.microvmId)).toEqual([b])
})

test('idlePolicy {60,0,false}: idle 60s -> terminate directly (no suspend window)', () => {
  const c = clock()
  const r = make(c.now)
  const id = r.createInstance({ portMap: {}, stopFn: noop, idlePolicy: POLICY })
  r.markRunning(id, { endpoint: 'e', proxyServer: {} })
  c.advance(59_000)
  expect(r.dueTransitions()).toEqual([]) // not yet idle
  c.advance(2_000) // 61s idle
  expect(r.dueTransitions()).toEqual([{ microvmId: id, action: 'terminate' }])
})

test('idlePolicy with suspend window: idle -> suspend, then -> terminate', () => {
  const c = clock()
  const r = make(c.now)
  const id = r.createInstance({
    portMap: {},
    stopFn: noop,
    pauseFn: noop,
    unpauseFn: noop,
    idlePolicy: {
      maxIdleDurationSeconds: 30,
      suspendedDurationSeconds: 120,
      autoResumeEnabled: true,
    },
  })
  r.markRunning(id, { endpoint: 'e', proxyServer: {} })
  c.advance(31_000)
  expect(r.dueTransitions()).toEqual([{ microvmId: id, action: 'suspend' }])
  r.markSuspended(id)
  expect(r.getInstance(id).state).toBe('SUSPENDED')
  c.advance(119_000)
  expect(r.dueTransitions()).toEqual([]) // still within suspend window
  c.advance(2_000)
  expect(r.dueTransitions()).toEqual([{ microvmId: id, action: 'terminate' }])
})

test('onRequest: RUNNING forwards + resets idle clock', () => {
  const c = clock()
  const r = make(c.now)
  const id = r.createInstance({
    portMap: {},
    stopFn: noop,
    idlePolicy: { maxIdleDurationSeconds: 60 },
  })
  r.markRunning(id, { endpoint: 'e', proxyServer: {} })
  c.advance(59_000)
  expect(r.onRequest(id)).toBe('forward')
  c.advance(59_000) // 59s since the touch, not 118s
  expect(r.dueTransitions()).toEqual([])
})

test('onRequest: SUSPENDED + autoResume true -> resume; false -> reject', () => {
  const c = clock()
  const r = make(c.now)
  const resumable = r.createInstance({
    portMap: {},
    stopFn: noop,
    pauseFn: noop,
    unpauseFn: noop,
    idlePolicy: {
      maxIdleDurationSeconds: 1,
      suspendedDurationSeconds: 60,
      autoResumeEnabled: true,
    },
  })
  r.markRunning(resumable, { endpoint: 'e', proxyServer: {} })
  r.markSuspended(resumable)
  expect(r.onRequest(resumable)).toBe('resume')
  expect(r.getInstance(resumable).state).toBe('RUNNING')

  const noResume = r.createInstance({
    portMap: {},
    stopFn: noop,
    pauseFn: noop,
    unpauseFn: noop,
    idlePolicy: {
      maxIdleDurationSeconds: 1,
      suspendedDurationSeconds: 60,
      autoResumeEnabled: false,
    },
  })
  r.markRunning(noResume, { endpoint: 'e', proxyServer: {} })
  r.markSuspended(noResume)
  expect(r.onRequest(noResume)).toBe('reject')
  expect(r.getInstance(noResume).state).toBe('SUSPENDED')
})
