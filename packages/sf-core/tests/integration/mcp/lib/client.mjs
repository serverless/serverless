/**
 * The MCP conformance harness: one ordered list of checks that any deployment
 * of the canonical fixture server (`../fixture/src/server.mjs`) must pass.
 *
 * It is the shared client from the `serverless/examples` repo
 * (`aws-mcp-servers/client.mjs`) — our own code — reshaped for jest. The
 * transformation is deliberately narrow: **the assertions are unchanged**, so a
 * green run here means the same thing it means for every hosting example. What
 * changed is the shape around them:
 *
 *   - `ENDPOINT`/`AUTH`/`SERVICE`/`LONG` were read from `process.env` at module
 *     scope; they are now arguments, because the endpoint only exists after a
 *     deploy.
 *   - the script's `check()` caught failures, printed PASS/FAIL and exited with
 *     a code. Each check now simply throws on failure, with the same message,
 *     and jest owns reporting and the process lifecycle.
 *   - a bearer branch was added (the script only knew SigV4): a configured
 *     token rides on every request, including the raw `GET`.
 *   - one check was added for a streaming behavior a live suite has to pin
 *     down: `antiBuffering`.
 *
 * There are no authentication checks in this list, and there is nowhere for one
 * to go: enforcement is the user's — an API Gateway authorizer, or the server
 * module itself — so what a rejection looks like is a property of that choice,
 * not of any deployment of this fixture. `bearerToken` therefore only means
 * "ride this token on every request"; the suites that deploy an enforced server
 * assert its rejections themselves (`../mcp-auth.test.js`).
 *
 * The 2026-07-28 client identity is inherited verbatim from the examples client
 * so requests stay byte-identical on the wire.
 *
 * Usage:
 *
 *   const checks = createMcpChecks({ endpoint, bearerToken, longRunning })
 *   test.each(checks)('$title', async ({ run }) => { await run() })
 *
 * For anything the fixed list does not cover — e.g. echoing `requestState`
 * back to prove the sealed round trip — take the low-level client:
 *
 *   const { request } = createMcpClient({ endpoint })
 */

const PROTOCOL_VERSION = '2026-07-28'
const CLIENT_INFO = { name: 'aws-mcp-servers-client', version: '1.0.0' }
const CAPS_ELICIT = { elicitation: { form: {} } }
const ACCEPT = 'application/json, text/event-stream'

const meta = (capabilities = {}) => ({
  'io.modelcontextprotocol/protocolVersion': PROTOCOL_VERSION,
  'io.modelcontextprotocol/clientInfo': CLIENT_INFO,
  'io.modelcontextprotocol/clientCapabilities': capabilities,
})

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

/**
 * AgentCore runtime URLs embed the agent ARN — the WHOLE ARN must be
 * URL-encoded in the path (including its inner "/") for the signature to match.
 */
const resolveEndpointUrl = ({ endpoint, auth, service }) => {
  const url = new URL(endpoint)
  if (
    auth === 'sigv4' &&
    service === 'bedrock-agentcore' &&
    url.pathname.includes('/runtimes/')
  ) {
    const arn = decodeURIComponent(
      url.pathname.match(/\/runtimes\/(.+?)\/invocations/)[1],
    )
    const rewritten = new URL(
      `${url.origin}/runtimes/${encodeURIComponent(arn)}/invocations`,
    )
    rewritten.searchParams.set('qualifier', 'DEFAULT')
    return rewritten
  }
  return url
}

/**
 * The SigV4 path, for IAM-auth Function URLs and AgentCore runtimes. Its four
 * dependencies are imported here and nowhere else, so an unsigned run (every
 * suite today) never loads them: three resolve transitively in this monorepo
 * and `@aws-crypto/sha256-js` does not resolve at all, so signing needs that
 * devDependency added before this branch can be used from the suite.
 */
const createSigV4Signer = async ({ url, service, region }) => {
  let SignatureV4
  let HttpRequest
  let Sha256
  let defaultProvider
  try {
    ;[{ SignatureV4 }, { HttpRequest }, { Sha256 }, { defaultProvider }] =
      await Promise.all([
        import('@smithy/signature-v4'),
        import('@smithy/protocol-http'),
        import('@aws-crypto/sha256-js'),
        import('@aws-sdk/credential-provider-node'),
      ])
  } catch (error) {
    throw new Error(
      'SigV4 signing needs @smithy/signature-v4, @smithy/protocol-http, ' +
        '@aws-crypto/sha256-js and @aws-sdk/credential-provider-node. Add the ' +
        `missing ones as devDependencies of this package: ${error.message}`,
    )
  }
  const sigv4 = new SignatureV4({
    service,
    region,
    credentials: defaultProvider(),
    sha256: Sha256,
  })
  return async (method, headers, body) => {
    const request = new HttpRequest({
      method,
      protocol: url.protocol,
      hostname: url.hostname,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: { host: url.hostname, ...headers },
      ...(body != null && { body }),
    })
    return (await sigv4.sign(request)).headers
  }
}

/**
 * A low-level MCP client over one endpoint.
 *
 * @param {object} config
 * @param {string} config.endpoint          full URL of the `/mcp` endpoint
 * @param {string} [config.bearerToken]     rides on every request as `Authorization: Bearer`
 * @param {'sigv4'} [config.auth]           sign requests instead (IAM-auth hostings)
 * @param {string} [config.service]         SigV4 service name, default `lambda`
 * @param {string} [config.region]          SigV4 region, default `AWS_REGION` or us-east-1
 * @returns {{ url: URL, request: Function, rawGet: Function }}
 */
export function createMcpClient({
  endpoint,
  bearerToken,
  auth,
  service = 'lambda',
  region = process.env.AWS_REGION || 'us-east-1',
} = {}) {
  assert(endpoint, 'createMcpClient needs an endpoint')
  assert(
    !(auth === 'sigv4' && bearerToken),
    'createMcpClient cannot combine auth: sigv4 with a bearerToken — the ' +
      'SigV4 signer overwrites the Authorization header, so the token would be ' +
      'dropped without a trace. Pick one.',
  )
  const url = resolveEndpointUrl({ endpoint, auth, service })

  // Lazy and memoized: the signer is built on first signed request, so the
  // SigV4 dependencies stay unloaded for unsigned runs.
  let signerPromise
  const sign = async (method, headers, body) => {
    if (auth !== 'sigv4') return headers
    signerPromise ??= createSigV4Signer({ url, service, region })
    return (await signerPromise)(method, headers, body)
  }

  const authorization = (token) =>
    token ? { authorization: `Bearer ${token}` } : {}

  let id = 0

  /**
   * One JSON-RPC call. `token: null` opts out of the configured bearer token
   * (that is how the unauthenticated negatives run against an auth-enabled
   * deployment). Returns the parsed result plus the raw response headers and
   * per-event timestamps, so callers can assert on delivery timing. `signal`
   * and `onEvent` exist for {@link abortMidStream}.
   */
  const request = async ({
    method,
    params = {},
    name,
    capabilities,
    headerMethod,
    envelope = true,
    token = bearerToken,
    signal,
    onEvent,
  }) => {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: ++id,
      method,
      params: envelope
        ? {
            ...params,
            _meta: { ...meta(capabilities), ...(params._meta ?? {}) },
          }
        : params,
    })
    let headers = {
      'content-type': 'application/json',
      accept: ACCEPT,
      ...authorization(token),
      ...(envelope && {
        'mcp-protocol-version': PROTOCOL_VERSION,
        'mcp-method': headerMethod ?? method,
        ...(name && { 'mcp-name': name }),
      }),
    }
    headers = await sign('POST', headers, body)
    const t0 = Date.now()
    const res = await fetch(url, { method: 'POST', headers, body, signal })
    const contentType = res.headers.get('content-type') ?? ''
    if (contentType.includes('text/event-stream')) {
      const events = []
      const decoder = new TextDecoder()
      let buffer = ''
      for await (const chunk of res.body) {
        buffer += decoder.decode(chunk, { stream: true })
        let sep
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          const data = frame
            .split('\n')
            .find((l) => l.startsWith('data:'))
            ?.slice(5)
            .trim()
          if (data) {
            const event = { t: Date.now() - t0, data: JSON.parse(data) }
            events.push(event)
            onEvent?.(event)
          }
        }
      }
      const final = events.at(-1)?.data
      return {
        status: res.status,
        contentType,
        headers: res.headers,
        events,
        json: final,
        ms: Date.now() - t0,
      }
    }
    const text = await res.text()
    let json
    try {
      json = JSON.parse(text)
    } catch {
      json = { raw: text }
    }
    return {
      status: res.status,
      contentType,
      headers: res.headers,
      events: [],
      json,
      ms: Date.now() - t0,
    }
  }

  /**
   * A raw `GET`, for the 405 check and the discovery probes. `path` (absolute,
   * from the origin) targets something other than the MCP endpoint; such a
   * request is never signed, because the signature is bound to the endpoint's
   * own path.
   */
  const rawGet = async ({
    path,
    token = bearerToken,
    accept = ACCEPT,
  } = {}) => {
    const target = path === undefined ? url : new URL(path, url.origin)
    let headers = { accept, ...authorization(token) }
    if (target.href === url.href) headers = await sign('GET', headers, null)
    return fetch(target, { method: 'GET', headers })
  }

  /**
   * Starts a streaming call and hangs up mid-stream, returning what arrived
   * before the disconnect.
   *
   * There is no `abort` CHECK in the list on purpose: the client cannot see
   * whether its disconnect reached the handler. Measured live through the REST
   * front door it does not — a killed client still bills the full invocation
   * and the Lambda stream never closes — so the observable assertion is the
   * ABSENCE of the fixture's `SLOW_REPORT_ABORTED` log line, which only the
   * suite can read (CloudWatch). This helper is the hang-up half of that case;
   * it will also be how a future non-REST hosting proves the opposite.
   */
  const abortMidStream = async ({ afterMs = 5000, ...call }) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), afterMs)
    const events = []
    const t0 = Date.now()
    try {
      const r = await request({
        ...call,
        signal: controller.signal,
        onEvent: (event) => events.push(event),
      })
      throw new Error(
        `the call completed in ${r.ms}ms instead of being aborted at ${afterMs}ms`,
      )
    } catch (error) {
      if (error.name !== 'AbortError') throw error
      return { events, abortedAfterMs: Date.now() - t0 }
    } finally {
      clearTimeout(timer)
    }
  }

  return { url, request, rawGet, abortMidStream }
}

/**
 * One-shot form of {@link createMcpClient}'s `request` for suite-level calls
 * that need nothing else from the client.
 *
 * Every call builds a fresh client, so nothing carries over between calls: the
 * JSON-RPC id restarts at 1 and (under `auth: 'sigv4'`) the signer — and its
 * credential lookup — is rebuilt. Take {@link createMcpClient} instead for a
 * sequence of calls that should share either.
 */
export const request = (config, call) => createMcpClient(config).request(call)

// AgentCore Runtime replaces 4xx response bodies with its own error envelope
// (-32010, "Received error (400) ..."); the 400 status still proves the SDK
// rejected the request, so the negative cases accept that form there.
const rejectedWith = (json, code, service) =>
  json.error?.code === code ||
  (service === 'bedrock-agentcore' &&
    json.error?.code === -32010 &&
    /\(4\d\d\)/.test(json.error?.message ?? ''))

/**
 * The ordered conformance checks for one deployment.
 *
 * Checks 1–12 always run. `longRunning` adds the two ~36s cases and the
 * anti-buffering assertion. `bearerToken` only rides a token on every request,
 * so an enforced deployment can run the same list an open one does — the list
 * asserts what the MCP server answers, never how a front door rejects.
 *
 * @param {object} config
 * @param {string} config.endpoint
 * @param {string} [config.bearerToken]      a token the deployment accepts
 * @param {boolean} [config.longRunning]
 * @param {'sigv4'} [config.auth]
 * @param {string} [config.service]
 * @param {string} [config.region]
 * @returns {Array<{ name: string, title: string, run: () => Promise<string> }>}
 *          titles are numbered in list order, so the numbering is gapless
 *          whichever checks a config includes
 */
export function createMcpChecks(config = {}) {
  const { longRunning, service } = config
  const client = createMcpClient(config)
  const { request, rawGet } = client

  // What a check measured, for a later check to assert on without repeating the
  // call. Scoped to one createMcpChecks() call, so parallel deployments never
  // share it — see the long-stream pair below.
  const observed = {}

  /**
   * The 45-step (~36s) progress stream, reduced to the timing facts the long
   * checks assert on. Only the anti-buffering check's standalone path calls
   * this: in a full run it reads what check 13 recorded.
   */
  const measureLongStream = async () => {
    const r = await request({
      method: 'tools/call',
      params: {
        name: 'slow_report',
        arguments: { steps: 45 },
        // The spec's channel — a token in `arguments` would also work against
        // a server that happens to read it there, which is exactly the false
        // green this harness must not produce: real clients send only _meta.
        _meta: { progressToken: 'long' },
      },
      name: 'slow_report',
    })
    const progress = r.events.filter(
      (e) => e.data.method === 'notifications/progress',
    )
    return { firstProgressT: progress[0]?.t, ms: r.ms, count: progress.length }
  }

  const checks = [
    {
      name: 'toolsList',
      title: 'tools/list returns the canonical tools with cache hints',
      run: async () => {
        const r = await request({ method: 'tools/list' })
        assert(r.status === 200, `HTTP ${r.status}`)
        assert(
          r.contentType.includes('application/json'),
          `content-type ${r.contentType}`,
        )
        const names = (r.json.result?.tools ?? []).map((t) => t.name).sort()
        assert(
          JSON.stringify(names) ===
            JSON.stringify(['add', 'approve_refund', 'slow_report']),
          `tools: ${names}`,
        )
        assert(r.json.result.ttlMs === 300000, `ttlMs ${r.json.result.ttlMs}`)
        assert(
          r.json.result.cacheScope === 'public',
          `cacheScope ${r.json.result.cacheScope}`,
        )
        return `ttlMs=${r.json.result.ttlMs} cacheScope=${r.json.result.cacheScope}`
      },
    },
    {
      name: 'addPlainJson',
      title: 'add returns plain JSON with structured content',
      run: async () => {
        const r = await request({
          method: 'tools/call',
          params: { name: 'add', arguments: { a: 2, b: 40 } },
          name: 'add',
        })
        assert(r.status === 200, `HTTP ${r.status}`)
        assert(
          r.contentType.includes('application/json'),
          `content-type ${r.contentType}`,
        )
        assert(
          r.json.result?.structuredContent?.sum === 42,
          JSON.stringify(r.json),
        )
        return 'sum=42'
      },
    },
    {
      name: 'slowReportStream',
      title: 'slow_report streams incremental progress over SSE',
      run: async () => {
        const r = await request({
          method: 'tools/call',
          params: {
            name: 'slow_report',
            arguments: { steps: 3 },
            _meta: { progressToken: 'pt' },
          },
          name: 'slow_report',
        })
        assert(r.status === 200, `HTTP ${r.status}`)
        assert(
          r.contentType.includes('text/event-stream'),
          `content-type ${r.contentType}`,
        )
        const progress = r.events.filter(
          (e) => e.data.method === 'notifications/progress',
        )
        assert(progress.length === 3, `${progress.length} progress events`)
        assert(
          progress[0].t < r.ms - 500,
          'first progress event did not arrive before the final result',
        )
        assert(
          r.json.result?.content?.[0]?.text === 'completed 3 steps',
          JSON.stringify(r.json),
        )
        return `3 progress events, first at +${progress[0].t}ms, done in ${r.ms}ms`
      },
    },
    {
      name: 'elicitationRoundTrip',
      title: 'approve_refund elicitation round-trip (accept and cancel)',
      run: async () => {
        const ask = await request({
          method: 'tools/call',
          params: { name: 'approve_refund', arguments: { orderId: 'o-1' } },
          name: 'approve_refund',
          capabilities: CAPS_ELICIT,
        })
        assert(
          ask.json.result?.resultType === 'input_required',
          JSON.stringify(ask.json),
        )
        assert(
          ask.json.result?.inputRequests?.confirm,
          'missing inputRequests.confirm',
        )
        const accepted = await request({
          method: 'tools/call',
          params: {
            name: 'approve_refund',
            arguments: { orderId: 'o-1' },
            inputResponses: {
              confirm: { action: 'accept', content: { confirmed: true } },
            },
          },
          name: 'approve_refund',
          capabilities: CAPS_ELICIT,
        })
        assert(
          accepted.json.result?.content?.[0]?.text === 'refunded o-1',
          JSON.stringify(accepted.json),
        )
        const cancelled = await request({
          method: 'tools/call',
          params: {
            name: 'approve_refund',
            arguments: { orderId: 'o-1' },
            inputResponses: {
              confirm: { action: 'accept', content: { confirmed: false } },
            },
          },
          name: 'approve_refund',
          capabilities: CAPS_ELICIT,
        })
        assert(
          cancelled.json.result?.content?.[0]?.text === 'refund cancelled',
          JSON.stringify(cancelled.json),
        )
        // A real decline ACTION, not accept-with-false: `acceptedContent`
        // returns undefined for a decline exactly as it does before the first
        // ask, so a server missing the `inputResponse` action check re-issues
        // the elicitation and a real client loops forever. This leg pins the
        // terminal answer.
        const declined = await request({
          method: 'tools/call',
          params: {
            name: 'approve_refund',
            arguments: { orderId: 'o-1' },
            inputResponses: {
              confirm: { action: 'decline' },
            },
          },
          name: 'approve_refund',
          capabilities: CAPS_ELICIT,
        })
        assert(
          declined.json.result?.content?.[0]?.text === 'refund cancelled',
          `decline must terminate, not re-ask: ${JSON.stringify(declined.json)}`,
        )
        return 'input_required -> refunded o-1 / refund cancelled / decline terminates'
      },
    },
    {
      name: 'resourcesListAndRead',
      title: 'resources list + read (Mcp-Name carries the uri)',
      run: async () => {
        const list = await request({ method: 'resources/list' })
        const uris = (list.json.result?.resources ?? []).map((r) => r.uri)
        assert(uris.includes('guide://usage'), `resources: ${uris}`)
        const read = await request({
          method: 'resources/read',
          params: { uri: 'guide://usage' },
          name: 'guide://usage',
        })
        assert(
          read.json.result?.contents?.[0]?.text?.startsWith('# Usage'),
          JSON.stringify(read.json),
        )
        return 'guide://usage readable'
      },
    },
    {
      name: 'resourceTemplate',
      title: 'resource template read with per-resource cache hint',
      run: async () => {
        const templates = await request({ method: 'resources/templates/list' })
        const uriTemplates = (
          templates.json.result?.resourceTemplates ?? []
        ).map((t) => t.uriTemplate)
        assert(
          uriTemplates.includes('orders://{orderId}'),
          `templates: ${uriTemplates}`,
        )
        const read = await request({
          method: 'resources/read',
          params: { uri: 'orders://o-42' },
          name: 'orders://o-42',
        })
        const record = JSON.parse(read.json.result?.contents?.[0]?.text ?? '{}')
        assert(
          record.orderId === 'o-42' && record.status === 'shipped',
          JSON.stringify(read.json),
        )
        assert(
          read.json.result.ttlMs === 60000,
          `ttlMs ${read.json.result.ttlMs}`,
        )
        return `orders://o-42 -> ${record.status}, ttlMs=${read.json.result.ttlMs}`
      },
    },
    {
      name: 'prompts',
      title: 'prompts list + get',
      run: async () => {
        const list = await request({ method: 'prompts/list' })
        const names = (list.json.result?.prompts ?? []).map((p) => p.name)
        assert(names.includes('summarize_order'), `prompts: ${names}`)
        const got = await request({
          method: 'prompts/get',
          params: { name: 'summarize_order', arguments: { orderId: 'o-7' } },
          name: 'summarize_order',
        })
        const text = got.json.result?.messages?.[0]?.content?.text ?? ''
        assert(text.includes('o-7'), JSON.stringify(got.json))
        return 'summarize_order fills its argument'
      },
    },
    {
      name: 'serverDiscover',
      title: 'server/discover surfaces the instructions',
      run: async () => {
        const r = await request({ method: 'server/discover' })
        assert(
          (r.json.result?.instructions ?? '').includes('Demo MCP server'),
          JSON.stringify(r.json.result ?? r.json),
        )
        return 'instructions present'
      },
    },
    {
      name: 'legacyInitialize',
      title: 'legacy initialize is answered on the same endpoint',
      run: async () => {
        const r = await request({
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'legacy', version: '1.0.0' },
          },
          envelope: false,
        })
        assert(r.status === 200, `HTTP ${r.status}`)
        const version = r.json.result?.protocolVersion ?? ''
        assert(version.startsWith('2025-'), JSON.stringify(r.json))
        return `served as ${version}`
      },
    },
    {
      name: 'getReturns405',
      title: 'GET is answered with the spec-mandated 405',
      run: async () => {
        const res = await rawGet()
        assert(res.status === 405, `HTTP ${res.status}`)
        return 'HTTP 405'
      },
    },
    {
      name: 'headerMethodMismatch',
      title: 'Mcp-Method header mismatching the body is rejected (-32020)',
      run: async () => {
        const r = await request({
          method: 'tools/call',
          params: { name: 'add', arguments: { a: 1, b: 1 } },
          name: 'add',
          headerMethod: 'tools/list',
        })
        assert(rejectedWith(r.json, -32020, service), JSON.stringify(r.json))
        return r.json.error.code === -32020
          ? '-32020'
          : 'rejected (platform-wrapped 400)'
      },
    },
    {
      name: 'missingElicitationCapability',
      title: 'elicitation without the client capability is rejected (-32021)',
      run: async () => {
        const r = await request({
          method: 'tools/call',
          params: { name: 'approve_refund', arguments: { orderId: 'o-9' } },
          name: 'approve_refund',
          capabilities: {},
        })
        assert(rejectedWith(r.json, -32021, service), JSON.stringify(r.json))
        return r.json.error.code === -32021
          ? '-32021'
          : 'rejected (platform-wrapped 400)'
      },
    },
  ]

  if (longRunning) {
    checks.push(
      {
        name: 'longStream',
        title: 'LONG: 45-step stream (~36s) survives past the 29s mark',
        run: async () => {
          const r = await request({
            method: 'tools/call',
            params: {
              name: 'slow_report',
              arguments: { steps: 45 },
              _meta: { progressToken: 'long' },
            },
            name: 'slow_report',
          })
          const progress = r.events.filter(
            (e) => e.data.method === 'notifications/progress',
          )
          assert(progress.length === 45, `${progress.length} progress events`)
          assert(
            r.json.result?.content?.[0]?.text === 'completed 45 steps',
            'final result missing (stream cut?)',
          )
          assert(r.ms > 34000, `finished suspiciously fast (${r.ms}ms)`)
          // Hand the timing to the anti-buffering check so the pair costs one
          // ~36s call instead of two.
          observed.longStream = {
            firstProgressT: progress[0].t,
            ms: r.ms,
            count: progress.length,
          }
          return `45 events over ${(r.ms / 1000).toFixed(1)}s, final result received`
        },
      },
      {
        name: 'longSilent',
        title: 'LONG: a silent 36s call is not cut short',
        run: async () => {
          // slow_report emits progress only when given a progressToken, so this
          // call writes nothing at all for ~36s and then returns plain JSON.
          // That is the case an edge-optimized API Gateway endpoint kills at
          // 30s (its idle timeout starts at invoke, not at the first byte, and
          // a raised timeoutInMillis does not help) - which is why the
          // REST-fronted deployments use a regional endpoint.
          const r = await request({
            method: 'tools/call',
            params: { name: 'slow_report', arguments: { steps: 45 } },
            name: 'slow_report',
          })
          assert(
            r.status === 200,
            `HTTP ${r.status} after ${(r.ms / 1000).toFixed(1)}s`,
          )
          assert(
            r.json.result?.content?.[0]?.text === 'completed 45 steps',
            JSON.stringify(r.json).slice(0, 200),
          )
          return `plain JSON after ${(r.ms / 1000).toFixed(1)}s of silence`
        },
      },
      {
        name: 'antiBuffering',
        title:
          'progress events are delivered incrementally, not flushed at the end',
        run: async () => {
          // Check 3 only proves the first event precedes the result by 500ms,
          // which a buffering front door can satisfy on a 2.4s call. Over ~36s
          // the difference is unambiguous: delivered incrementally the first
          // event lands at ~800ms; buffered anywhere in the chain it lands with
          // the rest, near the end.
          //
          // That is the same stream check 13 already paid ~36s for, so its
          // observation is reused when it ran; measuring again is the fallback
          // for running this check on its own (`-t antiBuffering`).
          const timing = observed.longStream ?? (await measureLongStream())
          assert(timing.count === 45, `${timing.count} progress events`)
          assert(
            timing.ms > 34000,
            `the call was not the expected ~36s one (${timing.ms}ms)`,
          )
          assert(
            timing.firstProgressT < 10000,
            `first progress event arrived at +${timing.firstProgressT}ms of a ${timing.ms}ms call — the stream is being buffered`,
          )
          return `first event at +${timing.firstProgressT}ms of ${timing.ms}ms`
        },
      },
    )
  }

  // Numbered here, not in the literals: a config that omits the long checks
  // would otherwise report a list with holes in it.
  return checks.map((check, index) => ({
    ...check,
    title: `${index + 1}. ${check.title}`,
  }))
}
