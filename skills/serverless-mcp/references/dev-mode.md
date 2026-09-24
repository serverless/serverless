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

- Results are buffered: progress arrives together at the end of the call.
- Dev Mode carries requests and results up to about 125 KB, as for every
  function; test larger payloads against the deployed stage.
- On the default edge-optimized endpoint, a call that produces nothing for
  roughly 30 seconds is dropped with a `504`, and the session warns there. On
  `REGIONAL` a dev call runs past that instead, up to the server's own
  `timeout`, and no warning is printed.
- Each request runs the module fresh (a few hundred ms).

Deploy normally to test incremental streaming and long tools.

## Reading the session

The session lists each server under `mcp:` and logs every request by JSON-RPC
method and target — `→ λ crm ── mcp tools/call get_weather`, then
`← λ crm (200) 640ms`, with any JSON-RPC error inside a `200` called out on
that line.

`serverless deploy` after the session restores normal serving.
