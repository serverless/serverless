# MCP servers under Dev Mode

Under `serverless dev`, requests hit the deployed endpoint, the function relays
each invocation to your machine, and your local module runs behind the same
entry production uses — edits apply on the next request, no redeploy.

## What stays the same

- Access control stays in force: authorized requests are served locally, and
  unauthorized ones are still rejected at the gateway.
- Discovery stays served.
- `state`-backed elicitation works end to end.

## What differs from a deployed server

- Each warm Lambda execution environment keeps one module process on your
  machine; a save restarts it for the next request.
- Large requests and results relay through the deployment bucket; when that
  is off, see the `serverless-dev-mode` skill's troubleshooting (large
  payloads).
- The endpoint type's idle bound applies as deployed: on an edge-optimized
  endpoint a call that writes nothing for about 30 seconds gets a `504`;
  emit progress or use `REGIONAL`.
- A relayed call adds about half a second.

## Reading the session

Each server is a function under its name, like any other (`serverless dev
status` lists it with its mode), and the session logs every request by JSON-RPC
method and target —
`→ λ crm ── mcp tools/call get_weather`, then `← λ crm (200) 640ms`, with any
JSON-RPC error inside a `200` called out on that line.

Stopping the session (`serverless dev stop`, or Ctrl+C) restores normal serving.
