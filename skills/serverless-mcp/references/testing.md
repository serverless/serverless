# Verifying a deployment

## Contents

- Drive the CLI headlessly (plain pipes, never a pty)
- The minimal round trip (headers + envelope, tools/list, tools/call)
- Two negatives worth checking (`-32020`, `-32021`)
- The endpoint-type litmus test
- The MCP Inspector
- Reading the function's own logs
- Auth, end to end
- Testing with Claude Code as the client
- Clean up

A deploy that prints an endpoint proves the stack exists, nothing more. The
protocol is verified by a round trip.

## Drive the CLI headlessly

Run every command through **plain pipes** — never a pty (`script`, `pty.spawn`,
an "interactive" wrapper). A pty is indistinguishable from a real terminal, so
spinners animate into thousands of lines of escape codes and prompts open and
wait forever. Piped, the CLI stays non-interactive and quiet:

```bash
serverless deploy --stage dev 2>&1 | tail -40
serverless info --stage dev 2>&1 | grep -A5 '^mcp:'
```

That `mcp:` section is where the endpoints are. One server renders inline
(`mcp: crm → https://…/dev/crm/mcp`); two or more render as an indented block, so
match both shapes if you parse it. If the CLI fails on authentication, propose
that the user run `serverless login` (or `serverless login aws sso`) themselves
rather than retrying in a loop.

## The minimal round trip

Revision 2026-07-28 is header-and-envelope shaped. Every request needs:

- `content-type: application/json`
- `accept: application/json, text/event-stream` — the same call answers with
  plain JSON or SSE depending on whether the server emits a notification while
  handling it (requesting progress invites that, but the server decides), so
  accept both
- `mcp-method: <the method in the body>` — **required**, and it must agree with
  the body
- `mcp-name: <the name or uri the method acts on>` — required for methods that
  have one: `tools/call` (`params.name`), `resources/read` (`params.uri`),
  `prompts/get` (`params.name`)
- `mcp-protocol-version: 2026-07-28` — optional when the body carries the
  envelope, but must agree with it
- a `params._meta` **envelope** carrying
  `io.modelcontextprotocol/protocolVersion` and
  `io.modelcontextprotocol/clientCapabilities` (both required), plus
  `io.modelcontextprotocol/clientInfo` (optional, and worth sending)

```bash
ENDPOINT=https://abc123def.execute-api.us-east-1.amazonaws.com/dev/crm/mcp

curl -sS -D- "$ENDPOINT" \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'mcp-protocol-version: 2026-07-28' \
  -H 'mcp-method: tools/list' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {
      "_meta": {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientInfo": { "name": "curl", "version": "1.0.0" },
        "io.modelcontextprotocol/clientCapabilities": {}
      }
    }
  }'
```

A `tools/call`, with the extra header and a progress token. The token invites
progress but does not by itself change the framing: a tool that emits no
notification still answers plain JSON, and the answer only arrives as SSE once
the tool actually notifies (`add` below does not; `slow_report` in the
examples does).

```bash
curl -sS -N "$ENDPOINT" \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'mcp-protocol-version: 2026-07-28' \
  -H 'mcp-method: tools/call' \
  -H 'mcp-name: add' \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "add",
      "arguments": { "a": 2, "b": 40 },
      "_meta": {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientCapabilities": {},
        "progressToken": "p1"
      }
    }
  }'
```

`-N` disables curl's buffering, which matters whenever you are judging _when_
bytes arrive. On a server with an `authorizer` add
`-H "authorization: Bearer $TOKEN"`; without a token, expect the bare `401`
before the function is ever invoked (see below).

For elicitation, the client has to declare the capability:
`"io.modelcontextprotocol/clientCapabilities": { "elicitation": { "form": {} } }`.
The first response is an `input_required` result; answer it by repeating the call
with `params.inputResponses` — `{ "confirm": { "action": "accept", "content": { … } } }` —
and, if the server minted one, `params.requestState` echoed back verbatim.

## Two negatives worth checking

| Code     | Meaning                                                                                                                                                        | Provoke it by                                             |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `-32020` | Headers and body disagree — a mismatched or absent `mcp-method`, a mismatched `mcp-name`, or a header protocol version that contradicts the envelope. HTTP 400 | Sending `mcp-method: tools/list` with a `tools/call` body |
| `-32021` | A tool asked for input the client never said it could provide                                                                                                  | Calling an eliciting tool with `clientCapabilities: {}`   |

Both come from the SDK inside your function, so seeing them is also proof that
requests are reaching it intact.

Missing the `_meta` envelope entirely while sending
`mcp-protocol-version: 2026-07-28` is a third case: HTTP 400 with `-32602`,
listing the envelope keys that were absent. A request with neither the header nor
an envelope is treated as legacy-era instead and still answered — which is why an
old client's `initialize` works against the same endpoint.

## The endpoint-type litmus test

Any client can hide a buffering front door on a short call. The distinguishing
case is a call that **writes nothing for longer than 30 seconds**: request a tool
that works silently for ~35 s (no `progressToken`).

- HTTP 200 with the result after ~35 s → the endpoint is regional, streaming is
  intact
- HTTP 504 at ~30 s → the endpoint is edge-optimized; set
  `provider.endpointType: REGIONAL`

The mirror image is worth timing too: on a ~36 s call that emits progress every
second, the **first** event should land in the first seconds. If it arrives with
the rest at the end, something buffered the whole response.

## The MCP Inspector

Headless, the Inspector runs in CLI mode off a config file. Two things the
config decides: which server, and the protocol revision — absent a
`protocolEra`, the Inspector negotiates an older revision (`2025-11-25`), so
opting into `modern` is what exercises the current (2026-07-28) surface:

```json
{
  "mcpServers": {
    "crm": {
      "type": "streamable-http",
      "url": "https://…/dev/crm/mcp",
      "protocolEra": "modern"
    }
  }
}
```

```bash
npx @modelcontextprotocol/inspector --cli \
  --config mcp.json --server crm --method tools/list
npx @modelcontextprotocol/inspector --cli \
  --config mcp.json --server crm \
  --method tools/call --tool-name add --tool-arg a=2 --tool-arg b=40
```

CLI mode never declares the elicitation capability, so a tool that asks the
user for input fails there with "client capabilities do not declare the
required capability" — that is the Inspector's mode, not the deployment.
Exercise elicitation from the browser UI (run without `--cli`, set the
connection's **Protocol Era** to Modern) or with the SDK client's modern
opt-in (`references/server-code.md`). The Inspector is the quickest way to
sanity-check schemas a client will render; it is not a substitute for the
timing checks above.

## Reading the function's own logs

The server is an ordinary function, so it logs like one. Its cold start is where
the entry's own failures surface (a default export without `fetch`, a state key
it could not read):

```bash
serverless logs -f crm --stage dev --startTime 10m 2>&1 | tail -40
```

A `console.log` at module scope is a useful ordering probe: the Framework places
the state key in the environment **before** importing the module, so a line like

```js
console.log(
  'STATE_KEY_LEN',
  (process.env.SERVERLESS_MCP_STATE_KEY ?? '').length,
)
```

prints 44 for an auto-provisioned key, the length of your own key when you
brought one, and `0` for a server configured without `state`. Log delivery lags
the invoke by seconds, so poll rather than reading once:

```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/<service>-<stage>-crm \
  --filter-pattern STATE_KEY_LEN \
  --query 'events[-1].message' --output text
```

## Auth, end to end

Enforcement is yours — an `authorizer`, an in-module gate, or both — so the
test follows whatever is configured. With a gateway `authorizer`, four
observations cover the chain, and the first two come paired with the proof
that matters: **the server's log group gains nothing**, because rejection
happens before the invoke.

1. no token → bare `401` `{"message":"Unauthorized"}` from API Gateway, and no
   new entry in `serverless logs -f <name> --startTime 5m`. With
   `authorizer: aws_iam` the shapes differ — an IAM-authorized method never
   answers `401`: an unsigned request gets `403`
   `{"message":"Missing Authentication Token"}`, and a signed-but-denied one
   `403` "User: … is not authorized to perform: execute-api:Invoke …"
2. a garbage token → `401` (or `403` "not authorized…" when a Lambda
   authorizer answers a Deny); the Lambda authorizer's own log group gains
   the entry instead of the server's
3. a valid token → the tool call succeeds. For a Cognito-ARN authorizer that
   means a real token from the pool: the **access token** when the authorizer
   sets `scopes`, the **ID token** when it does not
4. with `oauthDiscovery` set: the discovery URL, fetched with no token →
   `200` and a JSON body whose `authorization_servers` names your issuer and
   whose `resource` names the URL clients actually use

Probe the rejection with the same well-formed `tools/list` request as above,
minus the `authorization` header — send a real body, so what you observe is
the authorizer answering rather than a malformed request:

```bash
curl -sS -o /dev/null -D- "$ENDPOINT" \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'mcp-method: tools/list' \
  -d "$TOOLS_LIST_BODY" | head -1

curl -sS "https://…/dev/.well-known/oauth-protected-resource/crm/mcp"
```

The discovery URL keeps its stage prefix on a raw `execute-api` origin and
answers unauthenticated `GET` (plus `OPTIONS`) only — a `403` "Missing
Authentication Token" there means the path or stage is wrong, or the server
has no `oauthDiscovery`.

With an **in-module gate** (`requireBearerAuth` in your module), the
observations invert: a rejection does invoke the function — the log group
gains an entry — and the `401` carries the spec's challenge, which API Gateway
REST delivers renamed as `x-amzn-remapped-www-authenticate`. A valid token's
identity reaches tools as `ctx.http.authInfo`; a scratch tool that echoes
`ctx.http.authInfo?.clientId` proves the whole path in one call.

## Testing with Claude Code as the client

Real-client verification catches what curl cannot, but Claude has its own
mechanics worth knowing before reading its results. (Complete worked
walkthroughs — discovery, browser login, elicitation — live with the OAuth
examples in the hub: `https://github.com/serverless/examples/tree/v4/mcp`.)

- **Unauthenticated server**: `claude mcp add --transport http <name> <url>`,
  then `claude mcp list` — `✔ Connected` means the MCP handshake completed.
  A headless call proves the round trip:
  `claude -p "call the add tool with a=2 b=40" --allowedTools "mcp__<name>__add"`.
- **Token-gated server, no domain needed**: pass the token at registration —

  ```bash
  claude mcp add --transport http \
    --header "Authorization: Bearer $TOKEN" -- <name> <url>
  ```

  The `--` is required after `--header` specifically: the flag is variadic and
  otherwise swallows the name and URL positionals (`error: missing required
argument 'name'`, nothing registered). Commands without `--header` need no
  separator. The pasted header never refreshes, so calls start answering `401`
  when the token expires — re-add with a fresh one.

- **URL-only (Dynamic Client Registration)**: against an issuer that supports
  DCR, `claude mcp add --transport http <name> <url>` with nothing else is the
  whole registration — on the first authenticate the client reads the
  published discovery document, registers itself at the issuer's
  `registration_endpoint`, and runs authorization-code + PKCE on a callback
  port it picks itself. Three things it needs: the root-mapped custom domain
  (the discovery leg, as above); the issuer allowing registration and honoring
  the RFC 8707 `resource` parameter; and the protected resource registered at
  the issuer under the MCP endpoint's URL as its identifier, because a
  URL-only client identifies the server by URL alone. When this path fails,
  the client says almost nothing — a bare `SDK auth failed:` — so diagnose
  issuer-side: POST a minimal registration to the issuer's
  `registration_endpoint` with curl and read the real error
  (`references/troubleshooting.md` has the probe; issuers advertise the
  endpoint whether or not registration is enabled).
- **Interactive login works through probing.** With an `authorizer` on the
  route and `oauthDiscovery` published, Claude Code finds the document by
  requesting the conventional well-known paths relative to the **origin
  root** — it never reads a rejection's challenge headers — so a custom
  domain mapped at the root is a prerequisite, and on the raw `execute-api`
  URL the login dead-ends (see the troubleshooting row for the symptom).
- **Against an issuer without Dynamic Client Registration**
  (Cognito, most enterprise IdPs): Claude demands DCR only when it has no
  client. Pre-register an authorization-code + PKCE client whose callback is
  `http://localhost:<port>/callback`, then
  `claude mcp add --transport http --client-id <id> --callback-port <port> …`
  and authenticate via `/mcp`. This completes the full browser OAuth flow —
  no DCR needed. A root-mapped custom domain remains a prerequisite for the
  discovery leg.
- **Elicitation through Claude** requires its client to speak the 2026-07-28
  revision. Claude Code ships that support behind a staged, feature-flag-gated
  rollout that currently defaults to its v1 client and legacy negotiation; the
  env vars `MCP_SDK_GENERATION=v2 MCP_PROTOCOL_NEGOTIATION=auto` are the
  overrides for those gates. They are real shipping switches, live-verified
  end to end (full elicitation + sealed state with a human confirming in the
  CLI) — but absent from the public env-var reference, so expect them to stop
  being necessary once the rollout completes rather than to be documented.
- **The model cannot see host-brokered UI.** Elicitation confirmation prompts
  and progress notifications render in the CLI directly; they never enter the
  model's context. An agent-run test that concludes "nobody was asked" or "no
  progress arrived" from the model's viewpoint is misreading this — a
  human watching the terminal sees both. Judge those surfaces by what the
  terminal shows, not by what the model reports.
- **MCP prompts surface as slash commands** (`/mcp__<name>__<prompt>`) for the
  human; the model cannot enumerate or invoke them as tools.
- **Claude's permission classifier can block a tool before the server is
  reached** — a tool that reads as a financial mutation (a refund, a payment)
  fails on the client side with no request ever sent. Approve it interactively
  or add a permission rule; a server-side log group with zero new entries is
  the tell that the call never left the client.

## Clean up

Scratch deployments are a whole REST API, a function, a log group and possibly a
secret. `serverless remove --stage <stage>` deletes all of it, and re-deploying
afterwards is safe.
