/**
 * The MCP server under test — a standard server built with the official MCP
 * TypeScript SDK v2, serving the stateless 2026-07-28 protocol revision (and
 * answering older clients through the SDK's built-in fallback on the same
 * endpoint). Nothing here is Lambda-specific: the `mcp` property's entry gives
 * this module's default export a web-standard request to answer.
 *
 * The surface is the canonical one from the `serverless/examples` repo
 * (`aws-mcp-servers/server.mjs`), because the shared 14-check client asserts
 * exactly these tools, resources, prompts, instructions and cache hints — see
 * the mapping in the suite. Three additions on top of it, all of them things a
 * live suite needs and a documentation example does not:
 *
 *   - `slow_report` takes `delayMs`, so one tool covers both long cases: a
 *     45-step stream at 800ms (~36s of SSE) and a single silent 35s step
 *     (~35s with nothing written), which is what an edge-optimized REST
 *     endpoint kills at 30s.
 *   - `slow_report`'s sleep observes `ctx.mcpReq.signal` and logs
 *     `SLOW_REPORT_ABORTED`, so a client hang-up is observable in the function
 *     logs rather than only as a stream that stopped.
 *   - `approve_refund` seals its elicitation round-trip state with the SDK's
 *     HMAC codec, keyed by SERVERLESS_MCP_STATE_KEY — the key the Framework's
 *     entry reads out of Secrets Manager (or SSM) and places in the
 *     environment before this module is imported. The `STATE_KEY_LEN` line
 *     below is the observability hook for that ordering guarantee, and it
 *     prints `0` for a server configured without `state`.
 */
import {
  acceptedContent,
  createMcpHandler,
  createRequestStateCodec,
  inputRequired,
  inputResponse,
  McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/server'
import { z } from 'zod'

console.log(
  'STATE_KEY_LEN',
  (process.env.SERVERLESS_MCP_STATE_KEY ?? '').length,
)

// Abortable: a tool that ignores `ctx.mcpReq.signal` keeps running after the
// client hangs up no matter what the host does, so the sleep has to observe the
// signal for the hang-up path to be testable at all.
const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'))
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new Error('aborted'))
      },
      { once: true },
    )
  })

// Only a server configured with `state:` gets a key. The codec throws a
// RangeError on anything shorter than 32 bytes, so a stateless server simply
// runs without one — the same module then serves both deployments.
const stateKey = process.env.SERVERLESS_MCP_STATE_KEY
const codec =
  typeof stateKey === 'string' && stateKey.length >= 32
    ? createRequestStateCodec({ key: stateKey, ttlSeconds: 600 })
    : undefined

export default createMcpHandler(() => {
  const server = new McpServer(
    { name: 'sfc-mcp-server', version: '1.0.0' },
    {
      // Shown to clients that probe the `server/discover` method.
      instructions:
        'Demo MCP server. Call add for arithmetic, slow_report to watch ' +
        'streamed progress, approve_refund to see a tool ask the user for ' +
        'confirmation mid-call. Read guide://usage for a walkthrough.',
      // Cache hints: let clients and shared caches reuse the tool list for five
      // minutes. Without hints the SDK emits its conservative defaults
      // (ttlMs: 0, cacheScope: private) on every cacheable result.
      cacheHints: { 'tools/list': { ttlMs: 300000, cacheScope: 'public' } },
      ...(codec && { requestState: { verify: codec.verify } }),
    },
  )

  // A plain tool: zod schemas next to the implementation; returning
  // structuredContent lets clients consume typed results.
  server.registerTool(
    'add',
    {
      description: 'Add two numbers',
      inputSchema: z.object({ a: z.number(), b: z.number() }),
      outputSchema: z.object({ sum: z.number() }),
    },
    async ({ a, b }) => {
      const output = { sum: a + b }
      return {
        content: [{ type: 'text', text: String(output.sum) }],
        structuredContent: output,
      }
    },
  )

  // A long-running tool emitting progress notifications. When the client
  // requests progress (a progressToken in _meta) and accepts text/event-stream,
  // the response is served as SSE with notifications ahead of the final result.
  server.registerTool(
    'slow_report',
    {
      description: 'Generate a report, reporting progress along the way',
      inputSchema: z.object({
        steps: z.number().default(3),
        delayMs: z.number().default(800),
      }),
    },
    async ({ steps, delayMs }, ctx) => {
      // The spec's channel for requesting progress: `_meta.progressToken` on
      // the request, never a tool argument — a token passed as an argument is
      // invisible to real clients, which all send it here.
      const progressToken = ctx.mcpReq._meta?.progressToken
      for (let i = 1; i <= steps; i++) {
        try {
          await sleep(delayMs, ctx.mcpReq.signal)
        } catch {
          // The client hung up: the entry aborts the fetch Request's signal on
          // stream close and the SDK forwards it here.
          console.log('SLOW_REPORT_ABORTED', `after ${i - 1} of ${steps} steps`)
          throw new Error('client hung up')
        }
        if (progressToken) {
          await ctx.mcpReq.notify({
            method: 'notifications/progress',
            params: {
              progressToken,
              progress: i,
              total: steps,
              message: `step ${i}`,
            },
          })
        }
      }
      return { content: [{ type: 'text', text: `completed ${steps} steps` }] }
    },
  )

  // Elicitation — a tool that pauses to ask the user for input. The handler
  // returns an input_required result; the client asks the user and retries the
  // call with the answers attached, re-entering the handler, which reads them
  // with acceptedContent. Works statelessly: no session required.
  server.registerTool(
    'approve_refund',
    {
      description: 'Refund an order after user confirmation',
      inputSchema: z.object({ orderId: z.string() }),
    },
    async ({ orderId }, ctx) => {
      const answer = acceptedContent(
        ctx.mcpReq.inputResponses,
        'confirm',
        z.object({ confirmed: z.boolean() }),
      )
      // A declined (or dismissed) request must terminate the tool:
      // `acceptedContent` returns undefined for BOTH "not asked yet" and
      // "user said no", so falling through to inputRequired on a decline
      // re-asks forever.
      const confirmView = inputResponse(ctx.mcpReq.inputResponses, 'confirm')
      if (confirmView.kind === 'elicit' && confirmView.action !== 'accept') {
        return { content: [{ type: 'text', text: 'refund cancelled' }] }
      }
      if (answer === undefined) {
        return inputRequired({
          inputRequests: {
            confirm: inputRequired.elicit({
              message: `Refund order ${orderId}?`,
              requestedSchema: z.object({ confirmed: z.boolean() }),
            }),
          },
          // Sealed with the state key, so the retry cannot tamper with it. A
          // client is free to drop it — the retry then falls back to its own
          // arguments, which is what keeps this tool working on a stateless
          // deployment.
          ...(codec && {
            requestState: await codec.mint({ orderId, sealed: true }),
          }),
        })
      }
      if (!answer.confirmed) {
        return { content: [{ type: 'text', text: 'refund cancelled' }] }
      }
      // Present only when the client echoed the sealed state AND the codec
      // verified it — the observable proof that the key survived the round trip.
      const verified = ctx.mcpReq.requestState()
      const suffix = verified?.sealed ? ' (state verified)' : ''
      return {
        content: [
          {
            type: 'text',
            text: `refunded ${verified?.orderId ?? orderId}${suffix}`,
          },
        ],
      }
    },
  )

  // A readable document next to the tools. Clients fetch it with
  // resources/read (the Mcp-Name header carries the uri).
  server.registerResource(
    'usage-guide',
    'guide://usage',
    { description: 'How to use this server', mimeType: 'text/markdown' },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: '# Usage\n\nCall `add` for sums, `slow_report` for streamed progress, `approve_refund` for an elicitation round-trip.',
        },
      ],
    }),
  )

  // A resource template — parameterized URIs resolved per request. The
  // per-resource cacheHint overrides the server-level hints for its reads.
  server.registerResource(
    'order',
    new ResourceTemplate('orders://{orderId}', { list: undefined }),
    {
      description: 'Order record by id',
      cacheHint: { ttlMs: 60000, cacheScope: 'private' },
    },
    async (uri, { orderId }) => ({
      contents: [
        { uri: uri.href, text: JSON.stringify({ orderId, status: 'shipped' }) },
      ],
    }),
  )

  // A prompt template clients can list and fill in.
  server.registerPrompt(
    'summarize_order',
    {
      description: 'Ask the model to summarize an order',
      argsSchema: z.object({ orderId: z.string() }),
    },
    ({ orderId }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Summarize the status of order ${orderId} in one sentence.`,
          },
        },
      ],
    }),
  )

  return server
})
