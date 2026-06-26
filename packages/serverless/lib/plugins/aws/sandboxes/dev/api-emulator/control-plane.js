'use strict'

import http from 'http'
import { startInstanceProxy } from './proxy.js'
import { shortMicrovmId } from './container-logs.js'

// Best-effort, bounded wait for a freshly started container's hook server to accept HTTP, before
// we deliver lifecycle hooks — otherwise the run-hook payload is POSTed to a not-yet-ready :9000
// and lost. This MUST be an HTTP-level probe, not a bare TCP connect: Docker's published-port proxy
// (docker-proxy / Docker Desktop's vpnkit) binds the host port and accepts connections the instant
// the container starts, well before the in-container process binds :9000 — so a TCP connect succeeds
// prematurely and the following POST fails. An HTTP request only completes once the in-VM server is
// actually serving (any status code counts; a hooks server replying 404/501 to GET is "ready").
// Resolves true once the server responds, false on timeout (the caller proceeds either way).
export function defaultWaitForPort(
  host,
  port,
  timeoutMs = 15000,
  intervalMs = 200,
) {
  if (!port) return Promise.resolve(false)
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve) => {
    const attempt = () => {
      const req = http.request(
        { host, port, method: 'GET', path: '/', timeout: 1000 },
        (res) => {
          res.resume() // drain so the socket can close
          resolve(true)
        },
      )
      const retry = () => {
        req.destroy()
        if (Date.now() >= deadline) resolve(false)
        else setTimeout(attempt, intervalMs)
      }
      req.once('error', retry)
      req.once('timeout', retry)
      req.end()
    }
    attempt()
  })
}

// Each route: HTTP method + a matcher that returns captured params or null.
export const ROUTES = [
  {
    op: 'RunMicrovm',
    method: 'POST',
    match: (p) => (p === '/microvms' ? {} : null),
  },
  {
    op: 'CreateMicrovmAuthToken',
    method: 'POST',
    match: (p) => {
      // Real route is `auth-token` (singular) — confirmed via SDK wire capture (Appendix A).
      const m = p.match(/^\/microvms\/([^/]+)\/auth-token$/)
      return m ? { microvmIdentifier: decodeURIComponent(m[1]) } : null
    },
  },
  {
    op: 'SuspendMicrovm',
    method: 'POST',
    match: (p) => {
      const m = p.match(/^\/microvms\/([^/]+)\/suspend$/)
      return m ? { microvmIdentifier: decodeURIComponent(m[1]) } : null
    },
  },
  {
    op: 'ResumeMicrovm',
    method: 'POST',
    match: (p) => {
      const m = p.match(/^\/microvms\/([^/]+)\/resume$/)
      return m ? { microvmIdentifier: decodeURIComponent(m[1]) } : null
    },
  },
  {
    op: 'GetMicrovm',
    method: 'GET',
    match: (p) => {
      const m = p.match(/^\/microvms\/([^/]+)$/)
      return m ? { microvmIdentifier: decodeURIComponent(m[1]) } : null
    },
  },
  {
    op: 'TerminateMicrovm',
    method: 'DELETE',
    match: (p) => {
      const m = p.match(/^\/microvms\/([^/]+)$/)
      return m ? { microvmIdentifier: decodeURIComponent(m[1]) } : null
    },
  },
  {
    op: 'GetMicrovmImageVersion',
    method: 'GET',
    match: (p) => {
      const m = p.match(/^\/microvm-images\/([^/]+)\/versions\/([^/]+)$/)
      return m
        ? {
            imageIdentifier: decodeURIComponent(m[1]),
            imageVersion: decodeURIComponent(m[2]),
          }
        : null
    },
  },
  {
    op: 'GetMicrovmImage',
    method: 'GET',
    match: (p) => {
      const m = p.match(/^\/microvm-images\/([^/]+)$/)
      return m ? { imageIdentifier: decodeURIComponent(m[1]) } : null
    },
  },
]

function readJson(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString()
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        resolve({})
      }
    })
  })
}

export async function startControlPlane({
  registry,
  containerManager,
  startProxy = startInstanceProxy,
  createServer = http.createServer,
  host = '127.0.0.1',
  // Control-plane listen port. Default 0 = OS-assigned ephemeral (used by embedding callers and
  // tests so concurrent instances never collide). `serverless dev --sandbox` passes a stable,
  // user-customizable port so the endpoint address doesn't change between runs.
  port = 0,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
  reapIntervalMs = 5000,
  fireHook = async () => {},
  hookPort = 9000,
  readinessTimeoutMs = 15000,
  waitForPort = defaultWaitForPort,
  // Narrates emulator operations to the dev terminal (grey `aside` lines); no-op by default so
  // embedding callers/tests stay silent.
  logger = { aside() {}, notice() {}, debug() {} },
  // attachLogs(containerName, microvmId) -> stop(): begin streaming a container's logs to the dev
  // terminal (prefixed per MicroVM); returns a stop fn called on terminate. No-op by default.
  attachLogs = () => () => {},
  // beforeRun(): awaited at the start of RunMicrovm, before a container is launched. Used to
  // refresh injected credentials when they're near expiry, so a long-running dev session doesn't
  // hand a freshly launched MicroVM stale creds. No-op by default.
  beforeRun = async () => {},
}) {
  const send = (res, status, obj) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(obj))
  }

  // Per-MicroVM container-log stream stoppers, so terminate/reap can stop tailing.
  const logStops = new Map()
  const stopLogsFor = (id) => {
    const stop = logStops.get(id)
    if (stop) {
      try {
        stop()
      } catch {
        /* ignore */
      }
      logStops.delete(id)
    }
  }

  // Real AWS returns ResourceNotFoundException (HTTP 404). Setting x-amzn-errortype makes the
  // SDK surface err.name === 'ResourceNotFoundException' (matching real-code error checks).
  const notFound = (id) => ({
    __status: 404,
    __errorType: 'ResourceNotFoundException',
    message: `Unable to find microvmIdentifier ${id}`,
  })

  const handlers = {
    GetMicrovmImage: (_req, _body, params) =>
      registry.getImage(params.imageIdentifier),
    GetMicrovmImageVersion: (_req, _body, params) =>
      registry.getImageVersion(params.imageIdentifier, params.imageVersion),

    RunMicrovm: async (_req, body) => {
      await beforeRun() // refresh near-expiry injected creds before launching the container
      const c = await containerManager.run()
      const microvmId = registry.createInstance({
        portMap: c.portMap,
        stopFn: c.stop,
        pauseFn: c.pause,
        unpauseFn: c.unpause,
        idlePolicy: body?.idlePolicy,
        maximumDurationInSeconds: body?.maximumDurationInSeconds,
      })
      const inst = registry.getInstance(microvmId)
      const { server, port } = await startProxy({
        validateToken: (t) => registry.validateToken(microvmId, t),
        isPortAllowed: (p) => registry.isPortAllowed(microvmId, p),
        resolveHostPort: (inVmPort) => inst.portMap[inVmPort],
        onRequest: async () => {
          const decision = registry.onRequest(microvmId)
          if (decision === 'resume') {
            await inst.unpauseFn().catch(() => {})
            await fireHook('resume', inst)
            logger.aside(`▶ ${shortMicrovmId(microvmId)}  resumed (traffic)`)
            return 'forward'
          }
          return decision // 'forward' | 'reject'
        },
        // Narrate each forwarded request's outcome — otherwise an execution that logs nothing is
        // invisible. Grey, like functions Dev Mode's `← λ launcher (200)`.
        onResponse: (status, method, p) =>
          logger.aside(
            `← ${shortMicrovmId(microvmId)}  ${status}  ${method} ${p}`,
          ),
      })
      const endpoint = `http://127.0.0.1:${port}`
      registry.markRunning(microvmId, { endpoint, proxyServer: server })
      // Surface the idle policy on launch so the later "terminated (idle)" line is self-explaining
      // — a human/agent learns *when* this VM will be reaped without reading the config or docs.
      const maxIdle = body?.idlePolicy?.maxIdleDurationSeconds
      const lifecycleNote = maxIdle
        ? `terminates after ${maxIdle}s idle`
        : 'runs until terminated'
      // Lead with the short tag (matches this VM's streamed log prefix, so the two correlate); keep
      // the full id in parens for `aws lambda-microvms` copy-paste. The marker implies the state, so
      // no "RUNNING" word.
      const short = shortMicrovmId(microvmId)
      logger.aside(
        `→ RunMicrovm  ${short}  ·  ${endpoint}  ·  ${lifecycleNote}   (${microvmId})`,
      )
      // Stream this MicroVM's container logs to the dev terminal (prefixed per MicroVM).
      const stop = attachLogs(c.containerName, microvmId)
      if (typeof stop === 'function') logStops.set(microvmId, stop)
      // Let the container bind its hook server before delivering lifecycle hooks, so the
      // run-hook payload isn't POSTed to a not-yet-listening :9000 and lost. Best-effort + bounded.
      const ready = await waitForPort(
        host,
        inst.portMap[hookPort],
        readinessTimeoutMs,
      )
      // A silent readiness timeout would make the hooks below quietly not fire; say so.
      if (!ready)
        logger.aside(
          `⚠ ${short} not ready after ${Math.round(readinessTimeoutMs / 1000)}s — hooks may not have been delivered`,
        )
      // Deliver the lifecycle hooks AND enforce the platform's gate: a non-2xx ready/run is a
      // failure, not just a log line. Live AWS fails the MicrovmImage build on a bad `ready` and
      // TERMINATES the VM on a bad `run` (findings: microvms-lifecycle-hooks.txt). Mirror that so dev
      // surfaces what prod would reject. (Hook impls returning a bare truthy value instead of
      // { status } — e.g. test doubles — are treated as delivered-OK; no gate.)
      const firedHooks = []
      let gate = null
      for (const [name, payload] of [
        ['ready', undefined],
        ['run', body?.runHookPayload],
      ]) {
        const res = await fireHook(name, inst, payload)
        if (!res) continue // not enabled / not delivered
        firedHooks.push(name)
        const status = res.status
        if (
          !gate &&
          typeof status === 'number' &&
          (status < 200 || status >= 300)
        )
          gate = { name, status }
      }
      if (gate) {
        const stateReason =
          gate.name === 'run'
            ? `Run lifecycle hook returned HTTP status ${gate.status}. Please check your hook endpoint and application logs for more details.`
            : `Ready lifecycle hook returned HTTP status ${gate.status}; in production this fails the MicrovmImage build.`
        try {
          server.close?.()
        } catch {
          /* ignore */
        }
        await inst.stopFn?.().catch(() => {})
        stopLogsFor(microvmId)
        const terminated = registry.terminate(microvmId)
        if (terminated) terminated.stateReason = stateReason
        logger.aside(
          `✕ ${short} terminated — ${gate.name} hook returned ${gate.status}`,
        )
        return { microvmId, state: 'TERMINATED', stateReason }
      }
      if (firedHooks.length)
        logger.aside(`  hooks ${firedHooks.join('+')} delivered  ${short}`)
      return { microvmId, endpoint, state: 'RUNNING' }
    },

    GetMicrovm: (_req, _body, params) => {
      const inst = registry.getInstance(params.microvmIdentifier)
      if (!inst) return notFound(params.microvmIdentifier)
      return {
        microvmId: inst.microvmId,
        state: inst.state,
        endpoint: inst.endpoint,
        ...(inst.stateReason ? { stateReason: inst.stateReason } : {}),
      }
    },

    CreateMicrovmAuthToken: (_req, body, params) => {
      const ports = (body?.allowedPorts || [{ port: 8080 }]).map((p) => p.port)
      const token = registry.issueToken(params.microvmIdentifier, ports)
      if (!token) return notFound(params.microvmIdentifier)
      // Internal proxy handshake — useful for debugging, noise for everyday use; keep at debug.
      logger.debug?.(
        `auth token issued ${shortMicrovmId(params.microvmIdentifier)} ports=[${ports.join(',')}]`,
      )
      return { authToken: { 'X-aws-proxy-auth': token } }
    },

    // Explicit lifecycle ops (real API; confirmed empty `{}` responses, Appendix A).
    SuspendMicrovm: async (_req, _body, params) => {
      const inst = registry.getInstance(params.microvmIdentifier)
      if (!inst) return notFound(params.microvmIdentifier)
      await fireHook('suspend', inst)
      await inst.pauseFn().catch(() => {})
      registry.markSuspended(params.microvmIdentifier)
      logger.aside(
        `⏸ SuspendMicrovm  ${shortMicrovmId(params.microvmIdentifier)}`,
      )
      return {}
    },
    ResumeMicrovm: async (_req, _body, params) => {
      const inst = registry.getInstance(params.microvmIdentifier)
      if (!inst) return notFound(params.microvmIdentifier)
      await inst.unpauseFn().catch(() => {})
      await fireHook('resume', inst)
      registry.markResumed(params.microvmIdentifier)
      logger.aside(
        `▶ ResumeMicrovm  ${shortMicrovmId(params.microvmIdentifier)}`,
      )
      return {}
    },

    TerminateMicrovm: async (_req, _body, params) => {
      const inst = registry.terminate(params.microvmIdentifier)
      if (!inst) return notFound(params.microvmIdentifier)
      try {
        inst.proxyServer?.close?.()
      } catch {
        /* ignore */
      }
      await fireHook('terminate', inst)
      await inst.stopFn().catch(() => {})
      stopLogsFor(params.microvmIdentifier)
      logger.aside(
        `✕ TerminateMicrovm  ${shortMicrovmId(params.microvmIdentifier)}`,
      )
      return {} // real AWS returns an empty body
    },
  }

  const server = createServer(async (req, res) => {
    let op = 'request'
    try {
      // The SDK prefixes every path with an API version date, e.g. `/2025-09-09/microvms`
      // (confirmed via wire capture, Appendix A). Strip a leading `/YYYY-MM-DD` so the ROUTES
      // stay clean and we don't pin a specific version date.
      const pathname = req.url
        .split('?')[0]
        .replace(/^\/\d{4}-\d{2}-\d{2}(?=\/)/, '')
      const route = ROUTES.find(
        (r) => r.method === req.method && r.match(pathname),
      )
      if (!route)
        return send(res, 404, {
          message: `No route for ${req.method} ${pathname}`,
        })
      op = route.op
      const params = route.match(pathname)
      const body =
        req.method === 'GET' || req.method === 'DELETE'
          ? {}
          : await readJson(req)
      const result = await handlers[route.op](req, body, params)
      if (result && result.__status) {
        const { __status, __errorType, ...rest } = result
        const headers = { 'content-type': 'application/json' }
        if (__errorType) headers['x-amzn-errortype'] = __errorType // SDK maps this to err.name
        res.writeHead(__status, headers)
        res.end(JSON.stringify(rest))
        return
      }
      return send(res, 200, result)
    } catch (err) {
      // Surface the failure in the dev terminal — otherwise it's only a 500 in the caller's output
      // and the op silently never appears here.
      logger.aside(`✕ ${op} failed — ${err.message}`)
      return send(res, 500, { message: err.message })
    }
  })

  await new Promise((resolve, reject) => {
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        const e = new Error(
          `Local MicroVMs API port ${port} is already in use.`,
        )
        e.code = 'EADDRINUSE'
        reject(e)
      } else {
        reject(err)
      }
    })
    server.listen(port, host, resolve)
  })
  // With port 0 the OS assigned one; read back the actual bound port either way.
  const boundPort = server.address().port

  // One reaper pass: apply idlePolicy-driven suspend/terminate transitions.
  // Re-entrancy guard: a pass awaits fireHook + Docker pause/stop before the registry state flips,
  // so without this a slow pass overlapping the next interval tick would see the same instance still
  // "due" and fire suspend/terminate (and pause/stop) a second time — violating the fire-once hook
  // contract. An overlapping tick returns immediately; the next tick picks up anything still due.
  let reaping = false
  const reapTick = async () => {
    if (reaping) return
    reaping = true
    try {
      for (const { microvmId, action } of registry.dueTransitions()) {
        const inst = registry.getInstance(microvmId)
        if (!inst) continue
        if (action === 'suspend') {
          await fireHook('suspend', inst)
          await inst.pauseFn().catch(() => {})
          registry.markSuspended(microvmId)
          logger.aside(`⏸ ${shortMicrovmId(microvmId)}  suspended (idle)`)
        } else if (action === 'terminate') {
          try {
            inst.proxyServer?.close?.()
          } catch {
            /* ignore */
          }
          await fireHook('terminate', inst)
          await inst.stopFn().catch(() => {})
          registry.terminate(microvmId)
          stopLogsFor(microvmId)
          logger.aside(`✕ ${shortMicrovmId(microvmId)}  terminated (idle)`)
        }
      }
    } finally {
      reaping = false
    }
  }
  const reaperTimer = setIntervalImpl(() => {
    reapTick().catch(() => {})
  }, reapIntervalMs)

  const shutdown = async () => {
    clearIntervalImpl(reaperTimer)
    let terminated = 0
    for (const inst of registry.liveInstances()) {
      try {
        inst.proxyServer?.close?.()
      } catch {
        /* ignore */
      }
      await inst.stopFn().catch(() => {})
      stopLogsFor(inst.microvmId)
      registry.terminate(inst.microvmId)
      terminated++
    }
    await new Promise((resolve) => server.close(resolve))
    return terminated
  }

  return {
    server,
    port: boundPort,
    url: `http://127.0.0.1:${boundPort}`,
    shutdown,
    reapTick,
  }
}
