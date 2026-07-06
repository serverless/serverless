// control-plane.test.js
import http from 'http'
import { jest } from '@jest/globals'
import { startControlPlane } from '../../../../../../../../lib/plugins/aws/sandboxes/dev/api-emulator/control-plane.js'
import { EmulatorRegistry } from '../../../../../../../../lib/plugins/aws/sandboxes/dev/api-emulator/registry.js'

function req(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () =>
        resolve({
          status: res.statusCode,
          json: JSON.parse(Buffer.concat(chunks).toString() || '{}'),
        }),
      )
    })
    r.on('error', reject)
    if (body) r.write(JSON.stringify(body))
    r.end()
  })
}

function clock(start = 0) {
  let t = start
  return { now: () => t, advance: (ms) => (t += ms) }
}

function recordingContainerManager(containers) {
  return {
    run: async () => {
      const handle = {
        containerName: `c${containers.length + 1}`,
        portMap: { 8080: 50080, 9000: 50090 },
        stop: jest.fn(async () => {}),
        pause: jest.fn(async () => {}),
        unpause: jest.fn(async () => {}),
      }
      containers.push(handle)
      return handle
    },
  }
}

// startProxy stub: avoids opening real per-instance servers in unit tests.
const fakeStartProxy = async () => ({ server: { close() {} }, port: 40001 })

async function harness({ c, fireHook, port, ...overrides } = {}) {
  const containers = []
  const registry = new EmulatorRegistry({
    sandboxName: 'echo',
    minimumMemoryInMiB: 2048,
    imageArn: 'arn:local',
    idFactory: (() => {
      let n = 0
      return () => `mvm-${++n}`
    })(),
    now: c ? c.now : undefined,
  })
  const cp = await startControlPlane({
    registry,
    containerManager: recordingContainerManager(containers),
    startProxy: fakeStartProxy,
    setIntervalImpl: () => 0, // no background reaping in tests — drive cp.reapTick() manually
    clearIntervalImpl: () => {},
    waitForPort: async () => true, // fake containers have no real port to probe; skip the readiness wait
    ...(port !== undefined ? { port } : {}), // default 0 (ephemeral) keeps concurrent tests collision-free
    ...(fireHook ? { fireHook } : {}),
    ...overrides,
  })
  return { cp, registry, containers }
}

test('GetMicrovmImage returns CREATED', async () => {
  const { cp } = await harness()
  try {
    const res = await req(cp.port, 'GET', '/microvm-images/arn:local')
    expect(res.status).toBe(200)
    expect(res.json.state).toBe('CREATED')
    expect(res.json.latestActiveImageVersion).toBeTruthy()
  } finally {
    await cp.shutdown()
  }
})

test('RunMicrovm -> GetMicrovm RUNNING -> CreateMicrovmAuthToken -> Terminate', async () => {
  const { cp } = await harness()
  try {
    const run = await req(cp.port, 'POST', '/microvms', {
      imageIdentifier: 'arn:local',
    })
    expect(run.status).toBe(200)
    expect(run.json.microvmId).toBe('mvm-1')
    expect(run.json.endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(run.json.state).toBe('RUNNING')

    const get = await req(cp.port, 'GET', `/microvms/${run.json.microvmId}`)
    expect(get.json.state).toBe('RUNNING')
    expect(get.json.endpoint).toBe(run.json.endpoint)

    const tok = await req(
      cp.port,
      'POST',
      `/microvms/${run.json.microvmId}/auth-token`,
      {
        allowedPorts: [{ port: 8080 }],
      },
    )
    expect(tok.json.authToken['X-aws-proxy-auth']).toBeTruthy()

    const del = await req(cp.port, 'DELETE', `/microvms/${run.json.microvmId}`)
    expect(del.status).toBe(200)
    const after = await req(cp.port, 'GET', `/microvms/${run.json.microvmId}`)
    expect(after.json.state).toBe('TERMINATED')
  } finally {
    await cp.shutdown()
  }
})

test('unknown route returns 4xx JSON, not a crash', async () => {
  const { cp } = await harness()
  try {
    const res = await req(cp.port, 'GET', '/nope')
    expect(res.status).toBeGreaterThanOrEqual(400)
  } finally {
    await cp.shutdown()
  }
})

test('reaper honors idlePolicy {maxIdle:1,suspended:0}: idle -> TERMINATED + container stopped', async () => {
  const c = clock()
  const { cp, registry, containers } = await harness({ c })
  try {
    const run = await req(cp.port, 'POST', '/microvms', {
      idlePolicy: {
        maxIdleDurationSeconds: 1,
        suspendedDurationSeconds: 0,
        autoResumeEnabled: false,
      },
    })
    const id = run.json.microvmId
    c.advance(2000)
    await cp.reapTick()
    expect(registry.getInstance(id).state).toBe('TERMINATED')
    expect(containers[0].stop).toHaveBeenCalled()
  } finally {
    await cp.shutdown()
  }
})

test('reaper honors a suspend window: idle -> SUSPENDED (pause) -> TERMINATED', async () => {
  const c = clock()
  const { cp, registry, containers } = await harness({ c })
  try {
    const run = await req(cp.port, 'POST', '/microvms', {
      idlePolicy: {
        maxIdleDurationSeconds: 1,
        suspendedDurationSeconds: 5,
        autoResumeEnabled: true,
      },
    })
    const id = run.json.microvmId
    c.advance(2000)
    await cp.reapTick()
    expect(registry.getInstance(id).state).toBe('SUSPENDED')
    expect(containers[0].pause).toHaveBeenCalled()
    c.advance(6000)
    await cp.reapTick()
    expect(registry.getInstance(id).state).toBe('TERMINATED')
    expect(containers[0].stop).toHaveBeenCalled()
  } finally {
    await cp.shutdown()
  }
})

test('explicit SuspendMicrovm / ResumeMicrovm pause + resume the instance (empty {} body)', async () => {
  const { cp, registry, containers } = await harness()
  try {
    const id = (await req(cp.port, 'POST', '/microvms', {})).json.microvmId
    const sus = await req(cp.port, 'POST', `/microvms/${id}/suspend`)
    expect(sus.status).toBe(200)
    expect(sus.json).toEqual({})
    expect(registry.getInstance(id).state).toBe('SUSPENDED')
    expect(containers[0].pause).toHaveBeenCalled()
    const res = await req(cp.port, 'POST', `/microvms/${id}/resume`)
    expect(res.status).toBe(200)
    expect(registry.getInstance(id).state).toBe('RUNNING')
    expect(containers[0].unpause).toHaveBeenCalled()
  } finally {
    await cp.shutdown()
  }
})

test('lifecycle fires hooks: ready+run on RunMicrovm, suspend/resume/terminate on the ops', async () => {
  const fired = []
  // harness extended to inject fireHook (thread it through to startControlPlane).
  const { cp } = await harness({
    fireHook: async (name, inst, payload) =>
      fired.push([name, payload ?? null]),
  })
  try {
    const id = (
      await req(cp.port, 'POST', '/microvms', { runHookPayload: 'P' })
    ).json.microvmId
    await req(cp.port, 'POST', `/microvms/${id}/suspend`)
    await req(cp.port, 'POST', `/microvms/${id}/resume`)
    await req(cp.port, 'DELETE', `/microvms/${id}`)
    expect(fired).toEqual([
      ['ready', null],
      ['run', 'P'],
      ['suspend', null],
      ['resume', null],
      ['terminate', null],
    ])
  } finally {
    await cp.shutdown()
  }
})

test('narrates ops via logger.aside and streams container logs (attach on run, stop on terminate)', async () => {
  const aside = []
  const logger = { aside: (m) => aside.push(m), notice() {}, debug() {} }
  const attachStops = []
  const attachLogs = jest.fn((containerName, microvmId) => {
    const stop = jest.fn()
    attachStops.push({ containerName, microvmId, stop })
    return stop
  })
  const containers = []
  const registry = new EmulatorRegistry({
    sandboxName: 'echo',
    minimumMemoryInMiB: 2048,
    imageArn: 'arn:local',
    idFactory: () => 'mvm-1',
  })
  const cp = await startControlPlane({
    registry,
    containerManager: recordingContainerManager(containers),
    startProxy: fakeStartProxy,
    setIntervalImpl: () => 0,
    clearIntervalImpl: () => {},
    waitForPort: async () => true,
    logger,
    attachLogs,
  })
  try {
    const id = (await req(cp.port, 'POST', '/microvms', {})).json.microvmId
    // attachLogs called with the container name + microvm id; a RunMicrovm aside line emitted.
    expect(attachLogs).toHaveBeenCalledWith(containers[0].containerName, id)
    expect(aside.some((l) => l.includes('RunMicrovm') && l.includes(id))).toBe(
      true,
    )
    expect(attachStops[0].stop).not.toHaveBeenCalled()

    await req(cp.port, 'DELETE', `/microvms/${id}`)
    // terminate stops the log stream + logs a terminate aside line.
    expect(attachStops[0].stop).toHaveBeenCalledTimes(1)
    expect(
      aside.some((l) => l.includes('TerminateMicrovm') && l.includes(id)),
    ).toBe(true)
  } finally {
    await cp.shutdown()
  }
})

test('a run hook that times out terminates the instance (mirrors AWS run-hook timeout)', async () => {
  // fireHook reports a timeout for `run` — the emulator must treat it as a gate
  // failure and terminate, exactly as AWS does when a run hook exceeds its timeout.
  const fireHook = async (name) =>
    name === 'run' ? { timedOut: true } : { status: 200 }
  const { cp, registry } = await harness({ fireHook })
  try {
    const run = await req(cp.port, 'POST', '/microvms', {})
    expect(run.json.state).toBe('TERMINATED')
    expect(run.json.stateReason).toMatch(/run .*timed out/i)
    expect(registry.getInstance(run.json.microvmId).state).toBe('TERMINATED')
  } finally {
    await cp.shutdown()
  }
})

test('the hooks line reflects only the hooks that actually fired (not a hardcoded ready+run)', async () => {
  const aside = []
  const logger = { aside: (m) => aside.push(m), notice() {}, debug() {} }
  // Simulate a sandbox where only `ready` is enabled/delivered (run does not fire).
  const fireHook = async (name) => name === 'ready'
  const registry = new EmulatorRegistry({
    sandboxName: 'echo',
    minimumMemoryInMiB: 2048,
    imageArn: 'arn:local',
    idFactory: () => 'mvm-1',
  })
  const cp = await startControlPlane({
    registry,
    containerManager: recordingContainerManager([]),
    startProxy: fakeStartProxy,
    setIntervalImpl: () => 0,
    clearIntervalImpl: () => {},
    waitForPort: async () => true,
    logger,
    fireHook,
  })
  try {
    await req(cp.port, 'POST', '/microvms', {})
    const hookLine = aside.find(
      (l) => l.includes('hooks') && l.includes('delivered'),
    )
    expect(hookLine).toContain('ready')
    expect(hookLine).not.toContain('run') // run did not fire → not listed
  } finally {
    await cp.shutdown()
  }
})

test('logs a failure (✕) and returns 500 when a handler throws', async () => {
  const aside = []
  const logger = { aside: (m) => aside.push(m), notice() {}, debug() {} }
  const registry = new EmulatorRegistry({
    sandboxName: 'echo',
    minimumMemoryInMiB: 2048,
    imageArn: 'arn:local',
    idFactory: () => 'mvm-1',
  })
  const cp = await startControlPlane({
    registry,
    // run() throws → the RunMicrovm handler throws → 500 + a terminal failure line
    containerManager: {
      run: async () => {
        throw new Error('boom')
      },
    },
    startProxy: fakeStartProxy,
    setIntervalImpl: () => 0,
    clearIntervalImpl: () => {},
    waitForPort: async () => true,
    logger,
  })
  try {
    const res = await req(cp.port, 'POST', '/microvms', {})
    expect(res.status).toBe(500)
    expect(
      aside.some((l) => l.includes('RunMicrovm failed') && l.includes('boom')),
    ).toBe(true)
  } finally {
    await cp.shutdown()
  }
})

test('warns (⚠) when the container never becomes ready (waitForPort times out)', async () => {
  const aside = []
  const logger = { aside: (m) => aside.push(m), notice() {}, debug() {} }
  const registry = new EmulatorRegistry({
    sandboxName: 'echo',
    minimumMemoryInMiB: 2048,
    imageArn: 'arn:local',
    idFactory: () => 'mvm-1',
  })
  const cp = await startControlPlane({
    registry,
    containerManager: recordingContainerManager([]),
    startProxy: fakeStartProxy,
    setIntervalImpl: () => 0,
    clearIntervalImpl: () => {},
    waitForPort: async () => false, // never ready
    logger,
  })
  try {
    await req(cp.port, 'POST', '/microvms', {})
    expect(
      aside.some((l) => l.includes('not ready') && l.includes('mvm-1')),
    ).toBe(true)
  } finally {
    await cp.shutdown()
  }
})

test('a non-2xx run hook gates the launch: VM TERMINATED with a stateReason (matches live AWS)', async () => {
  const aside = []
  const logger = { aside: (m) => aside.push(m), notice() {}, debug() {} }
  const containers = []
  const registry = new EmulatorRegistry({
    sandboxName: 'echo',
    minimumMemoryInMiB: 2048,
    imageArn: 'arn:local',
    idFactory: () => 'mvm-1',
  })
  const cp = await startControlPlane({
    registry,
    containerManager: recordingContainerManager(containers),
    startProxy: fakeStartProxy,
    setIntervalImpl: () => 0,
    clearIntervalImpl: () => {},
    waitForPort: async () => true,
    // ready ok (200), run fails (500) — like a worker whose run hook errors
    fireHook: async (name) =>
      name === 'run' ? { status: 500 } : { status: 200 },
    logger,
  })
  try {
    const res = await req(cp.port, 'POST', '/microvms', {})
    // RunMicrovm reflects the terminal state + AWS's stateReason string
    expect(res.json.state).toBe('TERMINATED')
    expect(res.json.stateReason).toMatch(
      /Run lifecycle hook returned HTTP status 500/,
    )
    // container stopped + a terminate aside logged
    expect(containers[0].stop).toHaveBeenCalled()
    expect(
      aside.some(
        (l) =>
          l.includes('terminated') &&
          l.includes('run hook returned HTTP status 500'),
      ),
    ).toBe(true)
    // GetMicrovm surfaces the same terminal state + reason
    const got = await req(cp.port, 'GET', `/microvms/${res.json.microvmId}`)
    expect(got.json.state).toBe('TERMINATED')
    expect(got.json.stateReason).toMatch(/HTTP status 500/)
  } finally {
    await cp.shutdown()
  }
})

test('a 2xx run hook does NOT gate: VM stays RUNNING', async () => {
  const registry = new EmulatorRegistry({
    sandboxName: 'echo',
    minimumMemoryInMiB: 2048,
    imageArn: 'arn:local',
    idFactory: () => 'mvm-1',
  })
  const cp = await startControlPlane({
    registry,
    containerManager: recordingContainerManager([]),
    startProxy: fakeStartProxy,
    setIntervalImpl: () => 0,
    clearIntervalImpl: () => {},
    waitForPort: async () => true,
    fireHook: async () => ({ status: 200 }),
  })
  try {
    const res = await req(cp.port, 'POST', '/microvms', {})
    expect(res.json.state).toBe('RUNNING')
    expect(res.json.stateReason).toBeUndefined()
  } finally {
    await cp.shutdown()
  }
})

test('awaits beforeRun before launching the container on RunMicrovm', async () => {
  const seq = []
  const beforeRun = jest.fn(async () => {
    seq.push('beforeRun')
  })
  const containerManager = {
    run: async () => {
      seq.push('run')
      return {
        containerName: 'c1',
        portMap: { 8080: 50080, 9000: 50090 },
        stop: jest.fn(async () => {}),
        pause: jest.fn(async () => {}),
        unpause: jest.fn(async () => {}),
      }
    },
  }
  const registry = new EmulatorRegistry({
    sandboxName: 'echo',
    minimumMemoryInMiB: 2048,
    imageArn: 'arn:local',
    idFactory: () => 'mvm-1',
  })
  const cp = await startControlPlane({
    registry,
    containerManager,
    startProxy: fakeStartProxy,
    setIntervalImpl: () => 0,
    clearIntervalImpl: () => {},
    waitForPort: async () => true,
    beforeRun,
  })
  try {
    await req(cp.port, 'POST', '/microvms', {})
    expect(beforeRun).toHaveBeenCalledTimes(1)
    expect(seq).toEqual(['beforeRun', 'run']) // refresh happens before the container launches
  } finally {
    await cp.shutdown()
  }
})

test('tears down the container and registry entry when proxy setup fails mid-launch', async () => {
  const containers = []
  const registry = new EmulatorRegistry({
    sandboxName: 'echo',
    minimumMemoryInMiB: 2048,
    imageArn: 'arn:local',
    idFactory: () => 'mvm-1',
  })
  const cp = await startControlPlane({
    registry,
    containerManager: recordingContainerManager(containers),
    startProxy: async () => {
      throw new Error('proxy boom')
    },
    setIntervalImpl: () => 0,
    clearIntervalImpl: () => {},
    waitForPort: async () => true,
  })
  try {
    const res = await req(cp.port, 'POST', '/microvms', {})
    expect(res.status).toBe(500)
    // The container launched, so a failed launch must not leave it (or a live
    // registry entry) behind.
    expect(containers[0].stop).toHaveBeenCalled()
    expect(registry.getInstance('mvm-1').state).toBe('TERMINATED')
    expect(registry.liveInstances()).toEqual([])
  } finally {
    await cp.shutdown()
  }
})

test('tears down the container when readiness probing throws mid-launch', async () => {
  const containers = []
  const registry = new EmulatorRegistry({
    sandboxName: 'echo',
    minimumMemoryInMiB: 2048,
    imageArn: 'arn:local',
    idFactory: () => 'mvm-1',
  })
  const cp = await startControlPlane({
    registry,
    containerManager: recordingContainerManager(containers),
    startProxy: fakeStartProxy,
    setIntervalImpl: () => 0,
    clearIntervalImpl: () => {},
    waitForPort: async () => {
      throw new Error('probe boom')
    },
  })
  try {
    const res = await req(cp.port, 'POST', '/microvms', {})
    expect(res.status).toBe(500)
    expect(containers[0].stop).toHaveBeenCalled()
    expect(registry.getInstance('mvm-1').state).toBe('TERMINATED')
  } finally {
    await cp.shutdown()
  }
})

test('CreateMicrovmAuthToken accepts the {allPorts: {}} and {range} spec shapes from the real API', async () => {
  const { cp, registry } = await harness()
  try {
    const run = await req(cp.port, 'POST', '/microvms', {
      imageIdentifier: 'arn:local',
    })
    const id = run.json.microvmId

    // {allPorts: {}} — every port must be allowed (real AWS accepts this shape).
    const all = await req(cp.port, 'POST', `/microvms/${id}/auth-token`, {
      allowedPorts: [{ allPorts: {} }],
    })
    expect(all.json.authToken['X-aws-proxy-auth']).toBeTruthy()
    expect(registry.isPortAllowed(id, 8080)).toBe(true)
    expect(registry.isPortAllowed(id, 12345)).toBe(true)

    // {range: {startPort, endPort}} — ports inside the range allowed, outside denied.
    await req(cp.port, 'POST', `/microvms/${id}/auth-token`, {
      allowedPorts: [{ range: { startPort: 9000, endPort: 9100 } }],
    })
    expect(registry.isPortAllowed(id, 9050)).toBe(true)
    expect(registry.isPortAllowed(id, 8080)).toBe(false)
  } finally {
    await cp.shutdown()
  }
})

test('RunMicrovm skips the hook-port readiness wait (and its warning) when hooks are disabled', async () => {
  const waitForPort = jest.fn(async () => false) // would warn if it ran
  const asides = []
  const { cp } = await harness({
    hooksEnabled: false,
    waitForPort,
    logger: { aside: (l) => asides.push(l), notice() {}, debug() {} },
  })
  try {
    const run = await req(cp.port, 'POST', '/microvms', {
      imageIdentifier: 'arn:local',
    })
    expect(run.status).toBe(200)
    expect(run.json.state).toBe('RUNNING')
    expect(waitForPort).not.toHaveBeenCalled()
    expect(asides.join('\n')).not.toMatch(/not ready after/)
  } finally {
    await cp.shutdown()
  }
})

test('CreateMicrovmAuthToken forwards the requested expiration to the registry', async () => {
  const containers = []
  const registry = new EmulatorRegistry({
    sandboxName: 'echo',
    minimumMemoryInMiB: 2048,
    imageArn: 'arn:local',
    idFactory: () => 'mvm-1',
  })
  const issueSpy = jest.spyOn(registry, 'issueToken')
  const cp = await startControlPlane({
    registry,
    containerManager: recordingContainerManager(containers),
    startProxy: fakeStartProxy,
    setIntervalImpl: () => 0,
    clearIntervalImpl: () => {},
    waitForPort: async () => true,
  })
  try {
    const id = (await req(cp.port, 'POST', '/microvms', {})).json.microvmId
    await req(cp.port, 'POST', `/microvms/${id}/auth-token`, {
      allowedPorts: [{ port: 8080 }],
      expirationInMinutes: 15,
    })
    // allowedPorts specs pass through to the registry unchanged (it owns the matching).
    expect(issueSpy).toHaveBeenCalledWith('mvm-1', [{ port: 8080 }], 15)
  } finally {
    await cp.shutdown()
  }
})

test('readiness probe targets loopback, not the control-plane bind host', async () => {
  const probed = []
  const registry = new EmulatorRegistry({
    sandboxName: 'echo',
    minimumMemoryInMiB: 2048,
    imageArn: 'arn:local',
    idFactory: () => 'mvm-1',
  })
  const cp = await startControlPlane({
    registry,
    containerManager: recordingContainerManager([]),
    startProxy: fakeStartProxy,
    setIntervalImpl: () => 0,
    clearIntervalImpl: () => {},
    host: '0.0.0.0', // bind the API to all interfaces
    waitForPort: async (host, port) => {
      probed.push({ host, port })
      return true
    },
  })
  try {
    await req(cp.port, 'POST', '/microvms', {})
    // The container's hook port is published on loopback regardless of which interface
    // the control-plane API binds, so the probe must target 127.0.0.1, not `host`.
    expect(probed[0].host).toBe('127.0.0.1')
  } finally {
    await cp.shutdown()
  }
})

test('binds the requested control-plane port (stable, customizable endpoint)', async () => {
  // Discover a free port via an ephemeral bind, release it, then ask for it explicitly.
  const probe = await harness()
  const wanted = probe.cp.port
  await probe.cp.shutdown()

  const { cp } = await harness({ port: wanted })
  try {
    expect(cp.port).toBe(wanted)
    expect(cp.url).toBe(`http://127.0.0.1:${wanted}`)
  } finally {
    await cp.shutdown()
  }
})

test('rejects with EADDRINUSE when the requested port is already taken', async () => {
  const first = await harness() // ephemeral port
  try {
    await expect(harness({ port: first.cp.port })).rejects.toMatchObject({
      code: 'EADDRINUSE',
    })
  } finally {
    await first.cp.shutdown()
  }
})
