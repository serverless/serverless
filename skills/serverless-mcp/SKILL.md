---
name: serverless-mcp
description: >-
  Hosts Model Context Protocol (MCP) servers on AWS Lambda with the Serverless
  Framework's built-in MCP support: an official-SDK server module, with the
  streaming endpoint, access control, OAuth discovery and packaging handled for
  you. Use whenever the user wants to deploy, host, secure or debug an MCP
  server on AWS or Lambda, writes or edits an `mcp:` block in serverless.yml,
  exposes tools, resources or prompts to Claude or another AI client over HTTP,
  or hits an `MCP_*` configuration error (MCP_UNSUPPORTED_NODE_RUNTIME,
  MCP_FUNCTION_NAME_COLLISION, MCP_INVALID_STATE_ARN, and the rest). Trigger
  even when neither "Serverless Framework" nor "MCP" is named but the user
  describes putting their own tools in front of an AI client over an HTTPS
  endpoint.
metadata:
  managed-by: serverless-framework
  version: '3'
  author: Serverless Inc.
---

# Serverless Framework MCP Servers

The Framework splits the work in two, and the split is the whole mental model.

**You own one module.** A standard server built with the official MCP
TypeScript SDK, whose default export is the result of `createMcpHandler()` — an
object exposing a web-standard `fetch`. There are no Lambda concepts in it, no
Serverless Framework APIs, and no HTTP plumbing: the same module runs anywhere
that hands it a `Request`.

```js
// src/server.mjs
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'

export default createMcpHandler(() => {
  const server = new McpServer({ name: 'crm', version: '1.0.0' })
  server.registerTool(/* ... */)
  return server
})
```

**The Framework owns everything around it**, from a few lines of YAML:

```yml
provider:
  name: aws

mcp:
  servers:
    crm:
      server: src/server.mjs
```

- the HTTPS route — `/<name>/mcp` on the service's API Gateway REST API, shared
  with your `http` functions and their custom domain
- response streaming end to end, including the integration timeout that has to
  move together with the function timeout
- with `authorizer`: your access control — a Lambda authorizer, a Cognito user
  pool, or IAM — wired to the MCP route, so rejected requests never invoke the
  server
- with `oauthDiscovery`: the RFC 9728 protected-resource metadata document,
  served by API Gateway itself with no Lambda behind it — advertisement, never
  enforcement
- packaging: your module, built the way the service builds anything, plus a
  prebuilt entry staged into the artifact that bridges Lambda's streaming
  runtime to the SDK handler's `fetch`
- with `state`: the elicitation signing key, provisioned in the stack and placed
  in `process.env.SERVERLESS_MCP_STATE_KEY` before your module is imported

Each server enters the service model as an ordinary function keyed by its bare
name, so `logs -f <name>`, `invoke -f <name>`, metrics, versions and rollback
work with no special casing.

## The loop

Define the success signal first — a `tools/list` that returns your tool names,
a `tools/call` that returns the right answer, a `401` that never invoked the
function.
"The YAML looks right" and "the deploy printed an endpoint" are not success
signals: the endpoint exists before the protocol works.

```
success signal → write the module → declare it → deploy → verify a real
round trip → clean up scratch stacks
```

Deploy prints one line per server (`mcp: crm → https://…/dev/crm/mcp`), and
`serverless info` prints the same lines later. Verify against that URL with a
real MCP round trip — [references/testing.md](references/testing.md) has a copy-paste `curl` and the
headless rules. Then `serverless remove` anything you stood up to try something.

## Rules

**Know the endpoint's idle bound.** The Framework default is edge-optimized,
which ends a response stream that has gone quiet for roughly 30 seconds,
counted from the invoke; `provider.endpointType: REGIONAL` raises that to
roughly 5 minutes. What matters is the gap between writes, not total duration,
and raising `timeout` moves neither bound. A tool that works in silence past
the bound needs `REGIONAL`, progress notifications, or both — the setting is
API-wide, so an MCP server neither changes nor validates it.

**Emit progress from anything slow.** Each progress notification is a write
that resets the idle clock; past roughly 300 seconds a tool has to emit them
even on a regional endpoint.

**The module's requirements are Node.js 20+ and zod 4.2 or newer.** On
zod 3 the tools appear in `tools/list` with empty input schemas while
`tools/call` keeps working, so a client can see the tools and not call them.
Keep `@modelcontextprotocol/server` and `zod` in `dependencies` — packaging
strips `devDependencies` from the artifact.

**Write the 2026-07-28 revision's SDK idioms.** Elicitation is
`inputRequired({ inputRequests })` plus `acceptedContent(...)` on the retry, not
the push-style `elicitInput()`. Details, and the rest of the SDK v2 surface that
older examples predate, are in [references/server-code.md](references/server-code.md).

**Enforcement is yours; discovery is advertisement.** The Framework never
verifies tokens. `authorizer` rejects at the gateway before the invoke, your
module's own gate (the SDK's `requireBearerAuth`) carries the spec's semantics
— scopes, challenges, `ctx.http.authInfo` — and `oauthDiscovery` only tells
clients where to log in: advertise only what your enforcement honors. The two
keys are independent; with neither, the endpoint is public and nothing warns.

**Evidence, not vibes.** Never call a server working from reading the config.
Trust an observed JSON-RPC result, a status code, or a log line.

**Dev Mode serves MCP servers.** Under `serverless dev` your local module
answers the deployed endpoint, with access control and discovery still in
force. Results are buffered and each request runs the module fresh, so test
streaming and long tools on a normal deploy, and run `serverless deploy` after
the session: [references/dev-mode.md](references/dev-mode.md).

**Don't hand-wire what the Framework wires.** Your own `http` event, streaming
handler or discovery route around an `mcp` server duplicates work already
done — and an `http` event on an MCP route's path is rejected outright.
Per-server `vpc`, `layers`, `provisionedConcurrency` and `role` are not
configurable; the provider-level settings apply to MCP servers.

Use plain `functions` with `http` events for ordinary request/response APIs —
reach for `mcp` when AI clients speak MCP to your tools.

## Gotchas

- A tool registered without `inputSchema` receives the context as its only
  argument, so an `(args, ctx)` callback reads `ctx` as undefined: give every
  tool one, `z.object({})` for no inputs ([references/server-code.md](references/server-code.md)).
- An elicitation handler must check for a declined answer before asking
  again, or the client re-prompts forever ([references/server-code.md](references/server-code.md)).
- A string `authorizer` compiles as a `TOKEN` authorizer, which gets only
  `event.authorizationToken` and no headers; use the object form with
  `type: request` when the function reads headers ([references/config.md](references/config.md)).
- Adding the first server to a service whose endpoints are `httpApi` events
  creates a second API and hostname: tell the user ([references/config.md](references/config.md)).
- Requests need the `mcp-protocol-version` and `mcp-method` headers, plus
  `mcp-name` on `tools/call`, `resources/read` and `prompts/get`, alongside
  the `_meta` envelope ([references/testing.md](references/testing.md)).
- `claude mcp add … --header "…"` needs `--` before the name and URL
  ([references/testing.md](references/testing.md)).

## References

- [references/config.md](references/config.md) — read when writing or changing the `mcp` block, or
  when choosing between `state: true` and a key of your own.
- [references/server-code.md](references/server-code.md) — read when writing or reviewing the server
  module itself.
- [references/troubleshooting.md](references/troubleshooting.md) — read on any failure, symptom first.
- [references/testing.md](references/testing.md) — read when verifying a deployment.
- [references/dev-mode.md](references/dev-mode.md) — read when developing a server under `serverless dev`.
- `serverless agent docs providers/aws/guide/mcp` — the full reference for the
  `mcp` block, for anything these files do not cover.

Deployable examples, minimal through OAuth behind a custom domain, live at
`https://github.com/serverless/examples/tree/v4/mcp`.
