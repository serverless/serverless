---
name: serverless-mcp
description: >-
  Host Model Context Protocol (MCP) servers on AWS with the Serverless
  Framework's built-in MCP support — an official-SDK server module deployed
  to AWS Lambda behind a streaming API Gateway REST endpoint, with OAuth bearer
  auth, protected-resource discovery, packaging and elicitation state handled
  for you. Use whenever the user wants to deploy, host, secure or debug an MCP
  server on AWS or Lambda, writes or edits an `mcp:` block in serverless.yml,
  exposes tools, resources or prompts to Claude or another AI client over HTTP,
  or hits an `MCP_*` configuration error (MCP_UNSUPPORTED_NODE_RUNTIME,
  MCP_FUNCTION_NAME_COLLISION, MCP_INVALID_STATE_ARN, and the rest). Trigger
  even when neither "Serverless Framework" nor "MCP" is named but the user
  describes putting their own tools in front of an AI client over an HTTPS
  endpoint.
metadata:
  managed-by: serverless-framework
  version: 1
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
- with `auth`: bearer-token verification, the spec's `401` + `WWW-Authenticate`
  flow, and the unauthenticated RFC 9728 protected-resource metadata route
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
a `tools/call` that returns the right answer, a `401` carrying the metadata URL.
"The YAML looks right" and "the deploy printed an endpoint" are not success
signals: the endpoint exists before the protocol works.

```
success signal → write the module → declare it → deploy → verify a real
round trip → clean up scratch stacks
```

Deploy prints one line per server (`mcp: crm → https://…/dev/crm/mcp`), and
`serverless info` prints the same lines later. Verify against that URL with a
real MCP round trip — `references/testing.md` has a copy-paste `curl` and the
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

**Write the current (2026-07-28) SDK idioms.** Elicitation is
`inputRequired({ inputRequests })` plus `acceptedContent(...)` on the retry, not
the push-style `elicitInput()`. Details and the rest of the post-training-cutoff
surface are in `references/server-code.md`.

**Evidence, not vibes.** Never call a server working from reading the config.
Trust an observed JSON-RPC result, a status code, or a log line.

**Dev Mode does not serve MCP servers in this release.** Under `serverless dev`
the packaging integration stands down and warns; deploy normally to exercise a
server.

**Don't hand-wire what the Framework wires.** Your own `http` event, streaming
handler or bearer-auth layer around an `mcp` server duplicates work already
done — and an `http` event on an MCP route's path is rejected outright.
Per-server `vpc`, `layers`, `provisionedConcurrency` and `role` are not
configurable in this release.

Use plain `functions` with `http` events for ordinary request/response APIs —
reach for `mcp` when AI clients speak MCP to your tools.

## References

- `references/config.md` — read when writing or changing the `mcp` block, or
  when choosing between `state: true` and a key of your own.
- `references/server-code.md` — read when writing or reviewing the server
  module itself.
- `references/troubleshooting.md` — read on any failure, symptom first.
- `references/testing.md` — read when verifying a deployment.

Deployable examples, minimal through OAuth behind a custom domain, live at
`https://github.com/serverless/examples/tree/v4/mcp`.
