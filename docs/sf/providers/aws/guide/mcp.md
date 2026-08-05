<!--
title: Serverless Framework - MCP Servers
description: How to host Model Context Protocol (MCP) servers on AWS Lambda with the Serverless Framework — streaming endpoints, OAuth, and packaging handled for you
short_title: MCP Servers
keywords:
  [
    'Serverless Framework',
    'MCP',
    'Model Context Protocol',
    'AWS Lambda',
    'API Gateway',
    'Streamable HTTP',
    'OAuth',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/mcp)

<!-- DOCS-SITE-LINK:END -->

# MCP Servers

The Model Context Protocol (MCP) is how AI clients — Claude, IDE assistants, agent frameworks — call tools, read resources, and run prompts that you host. The Serverless Framework deploys an MCP server written against the [official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) to AWS Lambda, behind an API Gateway REST API in streaming mode.

You write one module: a standard SDK server, with no Lambda concepts and no Serverless Framework APIs in it. The Framework owns everything around it:

- the HTTPS endpoint and its route, on the same REST API as the rest of your service
- response streaming, wired end to end — including the integration timeout that has to move with the function timeout
- when `auth` is configured: bearer-token verification and the spec's `401` + `WWW-Authenticate` flow, plus the OAuth protected-resource discovery document
- packaging: your module is built and zipped alongside a prebuilt Lambda entry that bridges Lambda's streaming runtime to the SDK's web-standard `fetch` handler
- when `state` is enabled: the signing key for elicitation round trips, provisioned in your stack

Each server becomes a normal function in your service model, so `serverless logs -f <name>`, `serverless invoke -f <name>`, metrics, versions, and rollback work with no special casing.

---

## Quick Start

**1. Install the SDK:**

```bash
npm install @modelcontextprotocol/server zod
```

**2. Write your server** — a plain SDK server, default-exporting the handler:

```js
// src/server.mjs
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'

export default createMcpHandler(() => {
  const server = new McpServer({ name: 'crm', version: '1.0.0' })

  server.registerTool(
    'lookupCustomer',
    {
      description: 'Look up a customer by email',
      inputSchema: z.object({ email: z.string() }),
    },
    async ({ email }) => ({
      content: [{ type: 'text', text: `Customer record for ${email}` }],
    }),
  )

  return server
})
```

The module's default export must be what `createMcpHandler()` returns — an object exposing a web-standard `fetch` method. Anything else fails at cold start with an error naming the `server:` property.

**3. Declare it in `serverless.yml`:**

```yml
service: crm-tools
frameworkVersion: '4'

provider:
  name: aws
  region: us-east-1

mcp:
  servers:
    crm:
      server: src/server.mjs
```

**4. Deploy:**

```bash
serverless deploy
```

The deploy summary prints the endpoint for every server, and `serverless info` prints the same lines later:

```
mcp: crm → https://abc123def.execute-api.us-east-1.amazonaws.com/dev/crm/mcp
```

**5. Point a client at it.** Any Streamable HTTP MCP client works. For example, with the MCP Inspector in CLI mode — a config file selects the server and opts into the current protocol revision (the Inspector's default is an older one):

```json
// mcp.json
{
  "mcpServers": {
    "crm": {
      "type": "streamable-http",
      "url": "https://abc123def.execute-api.us-east-1.amazonaws.com/dev/crm/mcp",
      "protocolEra": "modern"
    }
  }
}
```

```bash
npx @modelcontextprotocol/inspector --cli \
  --config mcp.json --server crm --method tools/list
```

Running the Inspector without `--cli` opens its browser UI instead; there, the same opt-in is the connection's **Protocol Era** setting.

---

## How requests reach your server

Every server is served at **`/<name>/mcp`**, including the only server in a service — so URLs never move when you add a second one.

| Setup                                        | URL                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| Default endpoint                             | `https://<api-id>.execute-api.<region>.amazonaws.com/<stage>/<name>/mcp` |
| With `provider.domain: mcp.example.com`      | `https://mcp.example.com/<name>/mcp`                                     |
| With a `basePath: v1` mapping on that domain | `https://mcp.example.com/v1/<name>/mcp`                                  |

All MCP servers in a service share one `AWS::ApiGateway::RestApi` with each other and with your `http` functions — one API, one stage, one custom domain. Custom domains come from [`provider.domain`](./domains.md); there is no per-server `domain` key, because the domain belongs to the shared API rather than to one server.

The route compiles as a single `ANY` method, so the SDK itself answers non-POST verbs with spec-correct error bodies.

Two servers in one service:

```yml
mcp:
  servers:
    crm:
      server: src/crm.mjs
    docs:
      server: src/docs.mjs
```

```
mcp:
  crm → https://abc123def.execute-api.us-east-1.amazonaws.com/dev/crm/mcp
  docs → https://abc123def.execute-api.us-east-1.amazonaws.com/dev/docs/mcp
```

A server name is used as the function key, the Lambda name suffix (`<service>-<stage>-<name>`), and the URL path segment, so it follows the same charset as a function key: `^[a-zA-Z0-9-_]+$`. A name that would collide with one of your own functions — or with another server — in CloudFormation logical IDs is rejected at validation time with `MCP_FUNCTION_NAME_COLLISION`. `well-known` is reserved, because the discovery route lives under `/.well-known/`.

An `http` event of your own on the same API Gateway resource as an MCP route is also rejected, with `API_GATEWAY_EXTERNAL_EVENT_ROUTE_COLLISION`: a concrete method on that path would win dispatch over the MCP route's `ANY` and quietly divert JSON-RPC traffic. Child paths (`/crm/mcp/extra`) are fine.

---

## Configuration Reference

Servers are defined under `mcp.servers`. Each key is the server name; its value is a configuration object.

<!-- prettier-ignore -->
```yml
mcp:
  servers:
    <name>:
      # required
      server: src/server.mjs

      # optional
      auth:
        issuer: https://example.us.auth0.com
        audiences:
          - https://mcp.example.com
        authorizer: myAuthorizer
      timeout: 120                  # seconds, 1–900
      memorySize: 1024              # MB, 128–10240
      environment:
        DB_TABLE: !Ref OrdersTable
      state: true                   # true | literal SSM or Secrets Manager ARN
```

| Property          | Type              | Default          | Description                                                                                                                                                                                                                                                                                                                              |
| ----------------- | ----------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server`          | string            | — **(required)** | Path to a module, relative to `serverless.yml`, whose default export is the result of `createMcpHandler()`.                                                                                                                                                                                                                              |
| `auth`            | object            | —                | OIDC bearer-token enforcement plus the OAuth protected-resource discovery route. `issuer` and `audiences` are both required when `auth` is set. See [Authentication](#authentication).                                                                                                                                                   |
| `auth.issuer`     | string            | — **(required)** | `https://` URL of any OpenID Connect provider. Its JWKS is discovered on first use and cached for the container.                                                                                                                                                                                                                         |
| `auth.audiences`  | string[]          | — **(required)** | Accepted audience values, at least one. For Amazon Cognito issuers, list your app client IDs. See [Audiences](#audiences).                                                                                                                                                                                                               |
| `auth.authorizer` | string            | —                | Name of one of your own authorizer functions, wired to the MCP route so unauthorized requests are rejected before the server is invoked. The discovery route stays unauthenticated. See [Rejecting before invoke](#rejecting-before-invoke).                                                                                             |
| `timeout`         | integer (seconds) | `60`             | Maximum tool duration, 1–900. Sets the function timeout **and** the streaming integration timeout together, so the two cannot drift apart. The official MCP SDK client also waits 60 seconds per request by default (configurable per call) — a tool that legitimately runs longer needs the client's timeout raised alongside this one. |
| `memorySize`      | integer (MB)      | `1024`           | Function memory, 128–10240. Falls back to `provider.memorySize` when set.                                                                                                                                                                                                                                                                |
| `environment`     | object            | `{}`             | Environment variables for the function, same shape as on a function — CloudFormation intrinsics included.                                                                                                                                                                                                                                |
| `state`           | boolean \| string | —                | Signing key for elicitation round trips. `true` provisions one in your stack; a literal SSM parameter or Secrets Manager secret ARN brings your own. See [Elicitation state](#elicitation-state).                                                                                                                                        |

The function behind each server is an ordinary function in the service model, so service-wide provider settings apply to it as they do to your own functions — `provider.architecture`, `provider.vpc`, `provider.layers` — and its permissions are shaped through `provider.iam`: extend the generated role with `provider.iam.role.statements`, give every function its own role with `provider.iam.role.mode: perFunction`, or bring your own role ([with one grant to add when `state` is set](#permissions-with-a-role-you-bring)).

**Runtime.** MCP servers run on Node.js 20 or newer, which is the SDK's own floor:

- `provider.runtime` unset, or set to a non-Node runtime (a Python service, for example) → the server runs on `nodejs24.x`
- `provider.runtime` set to a Node.js 20+ runtime → honored as-is
- `provider.runtime` set to a Node.js runtime below 20 → rejected at validation time with `MCP_UNSUPPORTED_NODE_RUNTIME`, naming the floor and the fix

Both that error and the name collisions above are raised as soon as your configuration is resolved, so any command that reads `serverless.yml` — `print` and `package` included — reports them, not only a deploy.

**Not configurable per server in this release:** the URL path (always `/<name>/mcp`), a per-server domain (use `provider.domain`), CORS on the tool routes, and per-server `vpc`, `layers`, `role`, or `provisionedConcurrency` keys — the provider-level settings above are the way to configure these.

---

## Endpoint type and long-running tools

`provider.endpointType` is an API-wide setting shared with the rest of your service; MCP servers neither change nor validate it, so the Framework's `EDGE` default applies unless you set it. The two types differ in how long a response stream may stay quiet.

Edge-optimized endpoints end a response stream that has gone quiet for roughly 30 seconds, counted from the invoke. What matters is the **gap between writes**, not the total duration: a 45-second tool that emits progress every 5 seconds completes on an edge endpoint, while a 35-second stretch with nothing written does not — the client sees a `504`. Raising `timeout` does not change that bound. Regional endpoints raise the idle bound to roughly 5 minutes — when your tools work in silence longer than the edge default allows, set it:

```yml
provider:
  name: aws
  endpointType: REGIONAL
```

Either way, **a tool that runs longer than ~300 seconds has to emit progress** to stay inside the idle bound. The SDK's progress notifications are the mechanism — each one is a write on the stream, which resets the idle clock:

```js
server.registerTool(
  'reindex',
  { description: 'Rebuild the search index' },
  async (_args, ctx) => {
    // The token is an opaque string OR number the client chose — the SDK
    // client uses its numeric message id, so 0 is a real value. Check
    // presence, not truthiness.
    const progressToken = ctx.mcpReq._meta?.progressToken
    for (const [step, total] of batches()) {
      await processBatch(step)
      if (progressToken !== undefined) {
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

Progress also makes the client's experience better long before the idle bound matters, so it is worth emitting from any tool that takes more than a moment.

---

## Authentication

Add `auth` and the server enforces OAuth 2.1 bearer tokens the way the MCP specification describes: a request without a valid token gets a `401` carrying a `WWW-Authenticate` challenge that points at this server's protected-resource metadata, and the metadata document names your authorization server.

```yml
mcp:
  servers:
    crm:
      server: src/server.mjs
      auth:
        issuer: https://example.us.auth0.com
        audiences:
          - https://mcp.example.com
```

Verification happens in the function, before your module's handler runs: the token is checked against the issuer's JWKS (discovered on first use and cached for the container), and the verified identity reaches your tools as `ctx.http.authInfo` with no code changes. `audiences` is required alongside `issuer` — verifying only the issuer would accept any token that issuer ever minted, for any application.

Setting `auth` and doing your own token checks inside `server.mjs` are alternatives. Pick one.

When `auth` is not set, the endpoint is public, exactly like an `http` event with no authorizer. Nothing warns about it, so treat an unauthenticated MCP server the way you would treat an unauthenticated HTTP API: only for tools whose whole surface is safe for anonymous callers.

### Audiences

The audience rule is the same one AWS's managed JWT authorizers use:

- if the token carries an `aud` claim, it must match one of `audiences` — `aud` is authoritative and never bypassed
- only when a token has no `aud` at all is its `client_id` claim matched against `audiences` instead

That fallback exists because **Amazon Cognito access tokens carry `client_id` and no `aud`**. For a Cognito issuer, list your **app client IDs** in `audiences`:

```yml
auth:
  issuer: https://cognito-idp.us-east-1.amazonaws.com/us-east-1_ab12cd34e
  audiences:
    - 1example23client45id67890
```

Two Cognito notes:

- **Send the access token, not the ID token.** Cognito signs both with the same keys and the same issuer, and an ID token's `aud` _is_ the app client id — so the audience rule alone cannot tell them apart. A token that declares itself something other than an access token (`token_use`) is rejected.
- **Cognito has no dynamic client registration.** It fits pre-registered clients and machine-to-machine callers well; the full discover-then-register client flow needs a provider that supports registration (Auth0, Okta, Entra ID, and similar).

### Discovery

With `auth` set, the Framework also provisions an unauthenticated route serving the RFC 9728 protected-resource metadata document:

```
GET /.well-known/oauth-protected-resource/<name>/mcp
```

```json
{
  "resource": "https://mcp.example.com/crm/mcp",
  "authorization_servers": ["https://example.us.auth0.com"],
  "bearer_methods_supported": ["header"]
}
```

The document is built from the incoming request, so it is correct on whichever hostname the client used. Without `auth`, no discovery route is created at all — metadata with no authorization server behind it would only mislead clients.

**Auto-discovery does not work on the default endpoint** — for two independent reasons, one per class of client:

- **Clients that probe by convention** — Claude Code is one — request `/.well-known/oauth-protected-resource/…` and its siblings relative to the **origin root**, and never read the `401` challenge at all. On a raw `execute-api` URL the metadata document sits under the stage prefix (`/<stage>/.well-known/…`), where no conventional probe looks. When every probe misses, such a client can quietly fall back to treating the server's own origin as the authorization server and open `<origin>/authorize` — a URL nothing serves — so the symptom is a sign-in page that never loads, not a clear error.
- **Clients that follow the challenge** — the official SDK client is one — read the metadata URL out of `WWW-Authenticate`, and API Gateway REST renames that header to `x-amzn-Remapped-WWW-Authenticate` on proxy responses. That behavior is AWS-documented and not configurable, so the pointer never reaches them.

Two ways to get a client connected:

- **Put a custom domain in front, mapped at the root.** With [`provider.domain`](./domains.md) and no `basePath`, the stage prefix disappears and the metadata route sits at the domain root — exactly where the conventional probes look, which also covers challenge-following clients, since they probe the same paths when the header yields nothing:

  ```yml
  provider:
    name: aws
    domain: mcp.example.com
  ```

  A non-root `basePath` moves the document off the root again, so the root probe no longer finds it.

- **Configure the client with the metadata URL**, for clients that accept one directly. The URL is the one shown above, including the stage: `https://<api-id>.execute-api.<region>.amazonaws.com/<stage>/.well-known/oauth-protected-resource/<name>/mcp`. Claude Code takes no such setting — for it, the custom domain is the way.

When a custom domain fronts the service, the Framework tells the deployed server its public origin, so the URLs it advertises match the one clients use. From then on the domain is the endpoint: every advertised URL — including the metadata document's `resource` value — names the domain, so a client pointed at the old `execute-api` URL sees a `resource` that does not match the URL it called and, if it validates that (spec-conformant clients do), refuses the server. Point all clients at the domain once one is configured. If your service sits behind something the Framework cannot see — a CloudFront distribution, or two REST domains — set that origin yourself:

```yml
mcp:
  servers:
    crm:
      server: src/server.mjs
      environment:
        SERVERLESS_MCP_PUBLIC_BASE_URL: https://mcp.example.com
      auth:
        issuer: https://example.us.auth0.com
        audiences:
          - https://mcp.example.com
```

### Rejecting before invoke

In-function verification means an unauthenticated flood still costs invocations. `auth.authorizer` names one of your own authorizer functions and wires it to the MCP route, so API Gateway rejects those requests before the server is invoked:

```yml
provider:
  name: aws

functions:
  myAuthorizer:
    handler: src/authorizer.handler

mcp:
  servers:
    crm:
      server: src/server.mjs
      auth:
        issuer: https://example.us.auth0.com
        audiences:
          - https://mcp.example.com
        authorizer: myAuthorizer
```

The discovery route deliberately does **not** get the authorizer — a client has to be able to read the metadata document before it has a token, which is easy to overlook when wiring this by hand.

Two things about the function you name. It is wired as a **`TOKEN` authorizer**, the same default an `http` event's `authorizer: <name>` gets, so it receives the header's value as `event.authorizationToken` and has no `event.headers`. And whatever it rejects never reaches the server, so those callers get API Gateway's own bare `401` instead of the spec's challenge: the more the authorizer verifies, the fewer clients can discover your authorization server from a rejected request. Verifying only that a bearer token is present and well-formed keeps the flood protection and leaves the judgement — and the challenge — to the server.

---

## Elicitation state

MCP's elicitation flow (asking the caller for more input mid-tool) needs the server to hand out a sealed blob and trust it when it comes back. The SDK provides the codec; the key it is built from is what the Framework provisions.

Elicitation here requires a client on the **2026-07-28 protocol revision**, whose in-band flow — the tool returns an `input_required` result and the client retries the call with the answers attached — is what works without a session. A client that negotiates an older revision is served per-request, where the server cannot send it requests: plain tools, streaming, and progress all work for such clients, but a tool that asks for input fails with an error naming the missing capability.

Clients built on the official SDK reach the modern revision by opting in — it is not their default:

```js
const client = new Client(
  { name: 'my-client', version: '1.0.0' },
  {
    capabilities: { elicitation: { form: {} } },
    versionNegotiation: { mode: 'auto' }, // probe for 2026-07-28, fall back to legacy
  },
)
```

With that option the client's registered `elicitation/create` handler fulfills the tool's input request locally and the call is retried automatically. The same opt-in governs every request a server makes _of the client_ mid-tool, not just elicitation: **sampling** (`sampling/createMessage` — asking the client's model for a completion, handled the same way through a registered handler) and **roots** (`roots/list`) ride the identical in-band mechanism, and are equally unavailable to clients on older revisions here. Clients you don't control decide this themselves — until one opts in, its users can call every tool except the ones that ask the client for something.

```yml
mcp:
  servers:
    crm:
      server: src/server.mjs
      state: true
```

With `state` set, the key is read at cold start and placed in `process.env.SERVERLESS_MCP_STATE_KEY` **before your module is imported**, so it is available even to module-level code. It never sits in plaintext function configuration. Your side of it:

```js
import {
  acceptedContent,
  createMcpHandler,
  createRequestStateCodec,
  inputRequired,
  inputResponse,
  McpServer,
} from '@modelcontextprotocol/server'
import { z } from 'zod'

const codec = createRequestStateCodec({
  key: process.env.SERVERLESS_MCP_STATE_KEY,
  ttlSeconds: 600,
})

export default createMcpHandler(() => {
  const server = new McpServer(
    { name: 'crm', version: '1.0.0' },
    { requestState: { verify: codec.verify } },
  )

  server.registerTool(
    'approveRefund',
    {
      description: 'Refund an order after the user confirms',
      inputSchema: z.object({ orderId: z.string() }),
    },
    async ({ orderId }, ctx) => {
      // A declined (or dismissed) request must end the tool. `acceptedContent`
      // below returns undefined for BOTH "not asked yet" and "user said no" —
      // without this check, a decline falls through to inputRequired and the
      // client re-prompts forever.
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
        // First call: ask the client for confirmation, and seal what the retry
        // has to bring back so it cannot be tampered with.
        return inputRequired({
          inputRequests: {
            confirm: inputRequired.elicit({
              message: `Refund order ${orderId}?`,
              requestedSchema: z.object({ confirmed: z.boolean() }),
            }),
          },
          requestState: await codec.mint({ orderId }),
        })
      }
      if (!answer.confirmed) {
        return { content: [{ type: 'text', text: 'Refund cancelled' }] }
      }
      // Present only when the client echoed the sealed state and the codec
      // verified it.
      const verified = ctx.mcpReq.requestState()
      return {
        content: [
          { type: 'text', text: `Refunded ${verified?.orderId ?? orderId}` },
        ],
      }
    },
  )

  return server
})
```

### What `state: true` provisions

An `AWS::SecretsManager::Secret` with a generated 44-character value, in your stack — created, rolled back, and deleted with it. Its ARN is exported as a stack output (`<NormalizedName>McpStateSecretArn`, the server name normalized the way function logical IDs are). Cost is about **$0.40 per month** per state-enabled server per stage — each stage is its own stack, and so its own secret — plus $0.05 per 10,000 reads; the server reads it once per cold start.

Secrets Manager is used because it is the only way to have CloudFormation generate a random secret without a custom resource — that generation is what buys the full stack lifecycle.

> **Switching `state: true` to your own ARN destroys the provisioned secret immediately.** There is no recovery window: the moment the stack no longer declares it, it is gone, and any sealed elicitation state still in flight can no longer be verified. Roll the change out when no elicitation round trips are pending.

### Bring your own key

Point `state` at a literal SSM parameter or Secrets Manager secret ARN — the free path, and the one to use when a key is shared across services or rotated on your own schedule:

```yml
mcp:
  servers:
    crm:
      server: src/server.mjs
      state: arn:aws:ssm:us-east-1:123456789012:parameter/crm/mcp-state-key
```

An SSM `SecureString` is decrypted on read. The ARN must be written out in full: the service inside it decides whether the execution role is granted `ssm:GetParameter` or `secretsmanager:GetSecretValue`, and a CloudFormation intrinsic hides that — hence the `MCP_INVALID_STATE_ARN` error for an intrinsic, or for an ARN of any other service.

### Permissions with a role you bring

With the execution role the Framework generates, the read grant is attached for you — `secretsmanager:GetSecretValue` or `ssm:GetParameter`, scoped to that one key. With a role you bring (`provider.iam.role`, `provider.role`, or a role on the function) the Framework cannot modify it, so attach the statement yourself:

```yml
# Add to the policy of the role you provide.
# For `state: true` or a Secrets Manager ARN:
- Effect: Allow
  Action: 'secretsmanager:GetSecretValue'
  Resource: '<the state secret ARN, from the stack output>'
# For an SSM parameter ARN instead:
- Effect: Allow
  Action: 'ssm:GetParameter'
  Resource: '<your parameter ARN>'
```

If the grant is missing, the server fails at cold start with a message naming the exact action and resource. After a deploy, the Framework also simulates the role against the key and warns when the answer is a definite deny — when it cannot get one, because the deploying credentials are not allowed to run `iam:SimulatePrincipalPolicy` for instance, it stays silent rather than guessing.

If the key is encrypted with a customer-managed KMS key, the role additionally needs `kms:Decrypt` on that key, and the key's own policy has to allow the role to use it.

---

## Packaging

Your server module is packaged by whatever the service's [build configuration](./building.md) already does, alongside a prebuilt entry the Framework stages into the artifact. Nothing about your module changes between modes — the same relative path is used either way.

- **Classic zip (the default for a `.mjs` server).** Zero-config esbuild builds TypeScript entries only, so a JavaScript server ships the source tree plus `node_modules`: Node resolves the SDK and zod natively at runtime. This works out of the box and is the path with no walls for native dependencies (`sharp`, `prisma`, and the like).
- **Single-file bundle.** Opt in with a `build.esbuild` block and your module is bundled to one file, as any other handler would be:

  ```yml
  build:
    esbuild:
      bundle: true
  ```

- **TypeScript servers** are bundled by default, like any other TypeScript handler.

Two things to keep in mind:

- **Keep the SDK in `dependencies`.** In classic mode, packaging removes `devDependencies` from the artifact, so an MCP server importing `@modelcontextprotocol/server` or `zod` from `devDependencies` fails at runtime with `ERR_MODULE_NOT_FOUND`. The Framework warns when it sees that combination; the fix is to move the package to `dependencies` (or set `package.excludeDevDependencies: false`).
- **Give every server in a service the same treatment.** A service that bundles anything is packaged from the bundler's file list, so mixing a TypeScript server (bundled by default) with a JavaScript one (not bundled unless asked) would leave the second out of the artifact. The Framework warns; give every server a TypeScript entry, or set `build.esbuild` so it covers all of them.

Packaging stages that entry into a `serverless-mcp/` directory inside your service directory and removes it again when the run ends, so that path is reserved: a service that already keeps something there fails with `MCP_ENTRY_STAGING_PATH_TAKEN` rather than having its own files packaged and then deleted.

A prebuilt `package.artifact` is not supported for MCP servers in this release (`MCP_PREBUILT_ARTIFACT_UNSUPPORTED`): such an artifact is uploaded exactly as it is, so the entry never reaches it. Remove the artifact setting, or move the MCP server into its own service.

The `SERVERLESS_MCP_*` environment variables (`SERVERLESS_MCP_SERVER_MODULE`, `SERVERLESS_MCP_AUTH_ISSUER`, `SERVERLESS_MCP_AUTH_AUDIENCES`, `SERVERLESS_MCP_STATE_KEY_REF`, `SERVERLESS_MCP_PUBLIC_BASE_URL`) are how configuration reaches the deployed function — a configuration change is a CloudFormation environment update, not a new artifact. The `MCP_` prefix is left to the SDK.

---

## CLI behavior

| Command              | Behavior                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `deploy`             | Prints one endpoint line per server, plus the domain summary when `provider.domain` is set            |
| `info`               | Prints the same endpoint lines — where to look up URLs later                                          |
| `logs -f <name>`     | The server's own CloudWatch logs, by bare server name                                                 |
| `invoke -f <name>`   | Reaches the function directly; use an MCP client against the endpoint to exercise the server          |
| `print`              | Shows your configuration as written; the synthesized function never appears                           |
| `package`            | Fully supported — entry staging and the build both happen at package time                             |
| `deploy function -f` | Updates the server's code. See the environment note under [Limitations](#limitations-in-this-release) |
| `remove`             | Deletes everything, including the provisioned state secret. Re-deploying afterwards is safe           |
| `rollback`           | Rolls the stack back normally; every MCP resource is in-stack                                         |

---

## Limitations in this release

- **Long quiet tools need a regional endpoint.** Edge-optimized endpoints end a stream that has been quiet for roughly 30 seconds; set `provider.endpointType: REGIONAL`, which raises the bound to roughly 5 minutes. See [Endpoint type and long-running tools](#endpoint-type-and-long-running-tools).
- **Tools longer than ~300 seconds must emit progress** to stay inside that idle bound, regardless of `timeout`.
- **Automatic OAuth discovery needs a custom domain mapped at the root.** On the default endpoint the metadata document sits under the stage prefix, where clients that probe conventional well-known paths (Claude Code among them) never look — and API Gateway REST renames `WWW-Authenticate` on proxy responses, so clients that would follow the challenge instead never see the pointer. Clients that accept a metadata URL directly work without a domain; Claude Code takes no such setting. See [Discovery](#discovery).
- **A client disconnect does not stop a running tool.** Requests reaching Lambda through API Gateway REST do not carry the disconnect through, so a tool keeps running — and billing — after the caller has gone. `timeout` is the cost ceiling; set it to the longest tool you actually have rather than to the 900-second maximum.
- **Elicitation, sampling, and roots need a 2026-07-28 client, which is opt-in for official-SDK clients.** Clients on older protocol revisions are served per-request: tools, streaming, and progress all work, but a tool that asks the client for something mid-call — user input, a model completion, workspace roots — fails for them. See [Elicitation state](#elicitation-state) for the client-side `versionNegotiation` option.
- **Resource subscriptions do not deliver updates on this hosting.** A `subscriptions/listen` stream is held by one function instance and fed by an in-process event bus, so a change published while serving a call on any other instance never reaches it — and the stream ends at `timeout` regardless. Streaming responses and progress notifications, which travel inside the request being answered, are unaffected.
- **Dev Mode does not serve MCP servers in this release.** Under `serverless dev` the packaging integration stands down and warns; deploy with `serverless deploy` to exercise a server.
- **`deploy function` does not update environment variables for a server whose environment holds a CloudFormation reference.** The Lambda configuration update skips the whole environment when it sees one — which covers both how `state` passes the key and any `!Ref` or `!GetAtt` value in your own `environment:` block — so changes to `environment:` need a full `serverless deploy`. The Framework warns when this applies.
- **A bring-your-own state key must be a literal ARN.** A CloudFormation intrinsic is rejected with `MCP_INVALID_STATE_ARN`, because the ARN's service is what decides which read action the execution role is granted.
- **Switching `state: true` to your own ARN deletes the provisioned key immediately**, with no recovery window — see [What `state: true` provisions](#what-state-true-provisions).
- **Prebuilt artifacts are not supported** — see [Packaging](#packaging).
- **Requirements on your module:** Node.js 20 or newer and **zod 4.2 or newer**. On zod 3, `tools/list` returns tools whose input schemas are empty while `tools/call` keeps working — so a client sees your tools but cannot fill in their arguments.

---

## Complete Example

```yml
service: crm-tools
frameworkVersion: '4'

provider:
  name: aws
  region: us-east-1
  endpointType: REGIONAL # tools may stay quiet ~5 min (EDGE default: ~30 s)
  domain: mcp.example.com # root mapping — enables client auto-discovery

build:
  esbuild:
    bundle: true # single-file artifact per server

functions:
  myAuthorizer:
    handler: src/authorizer.handler

mcp:
  servers:
    crm:
      server: src/crm.mjs
      timeout: 300
      memorySize: 2048
      auth:
        issuer: https://example.us.auth0.com
        audiences:
          - https://mcp.example.com
        authorizer: myAuthorizer
      environment:
        ORDERS_TABLE: !Ref OrdersTable
      state: true

    docs:
      server: src/docs.mjs

resources:
  Resources:
    OrdersTable:
      Type: AWS::DynamoDB::Table
      Properties:
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - AttributeName: id
            AttributeType: S
        KeySchema:
          - AttributeName: id
            KeyType: HASH
```
