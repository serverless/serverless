# Writing the server module

## Contents

- The default export is `createMcpHandler()`'s return value
- Tools: zod schemas, structured content
- Elicitation: `inputRequired` + `acceptedContent`
- `requestState`: sealing what the retry brings back
- Progress on long tools
- The request context, in short
- Nothing Lambda-shaped belongs here

The module is plain MCP SDK code — but the SDK's current major (`v2`, serving
protocol revision 2026-07-28) moved several things that older examples and
recalled snippets still use. This file is the list of what to write instead.

Install the runtime dependencies in the service, as `dependencies`:

```bash
npm install @modelcontextprotocol/server zod
```

Requirements the module itself carries: **Node.js 20+** and **zod 4.2 or
newer**. On zod 3, `tools/list` returns tools whose input schemas are empty while
`tools/call` keeps working — a client sees the tools and cannot fill in their
arguments.

## The default export is `createMcpHandler()`'s return value

```js
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'

export default createMcpHandler(() => {
  const server = new McpServer({ name: 'crm', version: '1.0.0' })
  // register tools, resources, prompts here
  return server
})
```

The factory runs per request, so nothing is shared between requests except what
you put at module scope. The default export must expose a web-standard `fetch` —
exporting the `McpServer` instance, a transport, or a named export instead is
what produces the cold-start error naming the `server:` property.

`new McpServer(info, options)` takes the whole server-level surface in
`options` — `instructions` (what `server/discover` returns), `cacheHints`
(`{ 'tools/list': { ttlMs: 300000, cacheScope: 'public' } }`), and
`requestState.verify` for elicitation state.

## Tools: zod schemas, structured content

```js
import { z } from 'zod'

server.registerTool(
  'add',
  {
    description: 'Add two numbers',
    inputSchema: z.object({ a: z.number(), b: z.number() }),
    outputSchema: z.object({ sum: z.number() }),
  },
  async ({ a, b }) => ({
    content: [{ type: 'text', text: String(a + b) }],
    structuredContent: { sum: a + b },
  }),
)
```

Resources and prompts follow the same shape: `server.registerResource(name, uri
| new ResourceTemplate('orders://{orderId}', …), metadata, handler)` and
`server.registerPrompt(name, { description, argsSchema }, handler)`. A resource's
own `cacheHint` overrides the server-level hints for its reads.

## Elicitation: `inputRequired` + `acceptedContent`

Asking the caller for input mid-tool is a **multi-round-trip** exchange in this
revision: the handler returns an `input_required` result, the client asks the
user, and the client **retries the same call** with the answers attached — so the
handler runs again from the top and reads them off the context. Nothing is held
open server-side, which is what makes it work on stateless hosting.

```js
import {
  acceptedContent,
  createMcpHandler,
  inputRequired,
  inputResponse,
  McpServer,
} from '@modelcontextprotocol/server'

server.registerTool(
  'approve_refund',
  {
    description: 'Refund an order after the user confirms',
    inputSchema: z.object({ orderId: z.string() }),
  },
  async ({ orderId }, ctx) => {
    // Decline/cancel must terminate: `acceptedContent` returns undefined for
    // BOTH "not asked yet" and "user said no", so without this check a
    // decline falls through to inputRequired and the client re-prompts
    // forever. The SDK's own docs example omits it — do not copy that shape.
    const view = inputResponse(ctx.mcpReq.inputResponses, 'confirm')
    if (view.kind === 'elicit' && view.action !== 'accept') {
      return { content: [{ type: 'text', text: 'Refund cancelled' }] }
    }
    const answer = acceptedContent(
      ctx.mcpReq.inputResponses,
      'confirm',
      z.object({ confirmed: z.boolean() }),
    )
    if (answer === undefined) {
      // First pass: ask.
      return inputRequired({
        inputRequests: {
          confirm: inputRequired.elicit({
            message: `Refund order ${orderId}?`,
            requestedSchema: z.object({ confirmed: z.boolean() }),
          }),
        },
      })
    }
    if (!answer.confirmed) {
      return { content: [{ type: 'text', text: 'Refund cancelled' }] }
    }
    return { content: [{ type: 'text', text: `Refunded ${orderId}` }] }
  },
)
```

**Do not reach for the push-style `ctx.mcpReq.elicitInput()`.** It belongs to the
2025 server-to-client request model, which revision 2026-07-28 does not have: on
a request served at that revision the call throws before any wire traffic, with a
message steering to `inputRequired(...)`. On a legacy-era request there is no
per-request capability record to satisfy either, so the capability gate rejects
it. `inputRequired` is the only form that works on both.

Elicitation also depends on the **client** declaring the capability in its
per-request `_meta` envelope; a client that asks for a tool which elicits without
declaring it gets `-32021` (see `references/testing.md`).

## `requestState`: sealing what the retry brings back

Because the client retries the call, anything the handler wants to carry across
the round trip travels through the client — so seal it. `state` in
`serverless.yml` provisions the key and the Framework places it in the
environment before the module is imported, which means module scope can read it:

```js
import { createRequestStateCodec } from '@modelcontextprotocol/server'

const key = process.env.SERVERLESS_MCP_STATE_KEY
const codec =
  typeof key === 'string' && key.length >= 32
    ? createRequestStateCodec({ key, ttlSeconds: 600 })
    : undefined
```

Guarding on the key rather than assuming it lets the same module serve a
deployment with `state` and one without — the codec throws on a key shorter than
32 bytes. Wire the two halves:

```js
const server = new McpServer(
  { name: 'crm', version: '1.0.0' },
  { ...(codec && { requestState: { verify: codec.verify } }) },
)

// in the handler's first pass, alongside inputRequests:
return inputRequired({
  inputRequests: {/* … */},
  ...(codec && { requestState: await codec.mint({ orderId }) }),
})

// on the retry, after acceptedContent returned answers:
const verified = ctx.mcpReq.requestState() // present only if the seal verified
```

`verify` is a server option and `mint` is called in handlers by design: the
sealed payload is business state only the handler knows. A client is free to drop
the blob, so treat `ctx.mcpReq.requestState()` as possibly absent and fall back
to the call's own arguments.

## Progress on long tools

Each notification is a write on the response stream, which is what keeps a long
call inside the endpoint's idle bound. The client asks for progress by putting a
`progressToken` in the request's `_meta`; read it off the context and skip
notifying when it is absent:

```js
server.registerTool(
  'reindex',
  { description: 'Rebuild the search index' },
  async (_args, ctx) => {
    const progressToken = ctx.mcpReq._meta?.progressToken
    for (const [step, total] of batches()) {
      await processBatch(step)
      if (progressToken) {
        await ctx.mcpReq.notify({
          method: 'notifications/progress',
          params: { progressToken, progress: step, total },
        })
      }
    }
    return { content: [{ type: 'text', text: 'Reindexed' }] }
  },
)
```

## The request context, in short

| Field                       | What it carries                                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `ctx.mcpReq._meta`          | The request's `_meta`, including `progressToken`                                                                                    |
| `ctx.mcpReq.notify`         | Send a notification tied to this request (progress, and anything else)                                                              |
| `ctx.mcpReq.signal`         | `AbortSignal` for the request — observe it in any sleep or long loop so cancellation lands                                          |
| `ctx.mcpReq.inputResponses` | Elicitation answers on a retried call; read them through `acceptedContent`                                                          |
| `ctx.mcpReq.requestState`   | Accessor returning the verified sealed payload, or nothing                                                                          |
| `ctx.mcpReq.envelope`       | The client's per-request envelope, including its declared capabilities                                                              |
| `ctx.http.authInfo`         | The verified token identity when `auth` is configured — `clientId`, `scopes`, `expiresAt`, and the full claim set on `extra.claims` |

`ctx.mcpReq.log()` and `ctx.mcpReq.elicitInput()` are deprecated in this
revision; use stderr/`console` logging and `inputRequired` respectively.

## Nothing Lambda-shaped belongs here

No handler signature, no `event`/`context`, no streaming helpers, no
`awslambda.*`, no framework imports. The module answers a `Request` and returns a
`Response`; the same file runs under `node --watch` behind any web server, which
is the fastest way to iterate on tool logic before deploying.
