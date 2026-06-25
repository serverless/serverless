'use strict'

import http from 'http'
import net from 'net'
import { startInstanceProxy } from './proxy.js'

// Best-effort, bounded wait for a TCP port to accept connections. Used to let a freshly
// started container bind its hook server (:9000) before we deliver lifecycle hooks — otherwise
// the run-hook payload is POSTed to a not-yet-listening port and lost. Resolves true once
// reachable, false on timeout (the caller proceeds either way).
function defaultWaitForPort(host, port, timeoutMs = 15000, intervalMs = 200) {
  if (!port) return Promise.resolve(false)
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve) => {
    const attempt = () => {
      const sock = net.connect({ host, port })
      sock.once('connect', () => {
        sock.destroy()
        resolve(true)
      })
      sock.once('error', () => {
        sock.destroy()
        if (Date.now() >= deadline) resolve(false)
        else setTimeout(attempt, intervalMs)
      })
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
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
  reapIntervalMs = 5000,
  fireHook = async () => {},
  hookPort = 9000,
  readinessTimeoutMs = 15000,
  waitForPort = defaultWaitForPort,
}) {
  const send = (res, status, obj) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(obj))
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
            return 'forward'
          }
          return decision // 'forward' | 'reject'
        },
      })
      const endpoint = `http://127.0.0.1:${port}`
      registry.markRunning(microvmId, { endpoint, proxyServer: server })
      // Let the container bind its hook server before delivering lifecycle hooks, so the
      // run-hook payload isn't POSTed to a not-yet-listening :9000 and lost. Best-effort + bounded.
      await waitForPort(host, inst.portMap[hookPort], readinessTimeoutMs)
      await fireHook('ready', inst)
      await fireHook('run', inst, body?.runHookPayload)
      return { microvmId, endpoint, state: 'RUNNING' }
    },

    GetMicrovm: (_req, _body, params) => {
      const inst = registry.getInstance(params.microvmIdentifier)
      if (!inst) return notFound(params.microvmIdentifier)
      return {
        microvmId: inst.microvmId,
        state: inst.state,
        endpoint: inst.endpoint,
      }
    },

    CreateMicrovmAuthToken: (_req, body, params) => {
      const ports = (body?.allowedPorts || [{ port: 8080 }]).map((p) => p.port)
      const token = registry.issueToken(params.microvmIdentifier, ports)
      if (!token) return notFound(params.microvmIdentifier)
      return { authToken: { 'X-aws-proxy-auth': token } }
    },

    // Explicit lifecycle ops (real API; confirmed empty `{}` responses, Appendix A).
    SuspendMicrovm: async (_req, _body, params) => {
      const inst = registry.getInstance(params.microvmIdentifier)
      if (!inst) return notFound(params.microvmIdentifier)
      await fireHook('suspend', inst)
      await inst.pauseFn().catch(() => {})
      registry.markSuspended(params.microvmIdentifier)
      return {}
    },
    ResumeMicrovm: async (_req, _body, params) => {
      const inst = registry.getInstance(params.microvmIdentifier)
      if (!inst) return notFound(params.microvmIdentifier)
      await inst.unpauseFn().catch(() => {})
      await fireHook('resume', inst)
      registry.markResumed(params.microvmIdentifier)
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
      return {} // real AWS returns an empty body
    },
  }

  const server = createServer(async (req, res) => {
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
      return send(res, 500, { message: err.message })
    }
  })

  await new Promise((resolve) => server.listen(0, host, resolve))
  const port = server.address().port

  // One reaper pass: apply idlePolicy-driven suspend/terminate transitions.
  const reapTick = async () => {
    for (const { microvmId, action } of registry.dueTransitions()) {
      const inst = registry.getInstance(microvmId)
      if (!inst) continue
      if (action === 'suspend') {
        await fireHook('suspend', inst)
        await inst.pauseFn().catch(() => {})
        registry.markSuspended(microvmId)
      } else if (action === 'terminate') {
        try {
          inst.proxyServer?.close?.()
        } catch {
          /* ignore */
        }
        await fireHook('terminate', inst)
        await inst.stopFn().catch(() => {})
        registry.terminate(microvmId)
      }
    }
  }
  const reaperTimer = setIntervalImpl(() => {
    reapTick().catch(() => {})
  }, reapIntervalMs)

  const shutdown = async () => {
    clearIntervalImpl(reaperTimer)
    for (const inst of registry.liveInstances()) {
      try {
        inst.proxyServer?.close?.()
      } catch {
        /* ignore */
      }
      await inst.stopFn().catch(() => {})
      registry.terminate(inst.microvmId)
    }
    await new Promise((resolve) => server.close(resolve))
  }

  return { server, port, url: `http://127.0.0.1:${port}`, shutdown, reapTick }
}
