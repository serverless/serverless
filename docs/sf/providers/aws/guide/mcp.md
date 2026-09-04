<!--
title: Serverless Framework - MCP Servers
description: How to host Model Context Protocol (MCP) servers on AWS Lambda with the Serverless Framework — streaming endpoints, authorizers, OAuth discovery, and packaging handled for you
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
- when `authorizer` is set: your access control — a Lambda authorizer, a Cognito user pool, or IAM — wired to the MCP route, so rejected requests never invoke the server
- when `oauthDiscovery` is set: the OAuth protected-resource discovery document (RFC 9728), served by API Gateway itself with no Lambda behind it
- packaging: your module is built and zipped alongside a prebuilt Lambda entry that bridges Lambda's streaming runtime to the SDK's web-standard `fetch` handler
- when `state` is enabled: the signing key for elicitation round trips, provisioned in your stack

Each server becomes a normal function in your service model, so `serverless logs -f <name>`, `serverless invoke -f <name>`, metrics, versions, and rollback work with no special casing.

---

## Quick Start

**1. Install the SDK** — in a fresh directory, initialize the package first:

```bash
npm init -y
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
      authorizer: verifyToken       # string | http-event-style object | aws_iam
      oauthDiscovery:
        issuer: https://example.us.auth0.com # or a CloudFormation intrinsic
        publicUrl: https://mcp.example.com # literal only
      timeout: 120                  # seconds, 1–900
      memorySize: 1024              # MB, 128–10240
      environment:
        DB_TABLE: !Ref OrdersTable
      state: true                   # true | literal SSM or Secrets Manager ARN
```

| Property                   | Type                | Default          | Description                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | ------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server`                   | string              | — **(required)** | Path to a module, relative to `serverless.yml`, whose default export is the result of `createMcpHandler()`.                                                                                                                                                                                                                                                                                    |
| `authorizer`               | string \| object    | —                | Access control on the MCP route, enforced by API Gateway before the server is invoked. A string names one of your own authorizer functions; an object takes the same shape as an `http` event's `authorizer` (Cognito user pools and existing authorizers included); `aws_iam` requires SigV4-signed callers. See [Authentication](#authentication).                                           |
| `oauthDiscovery`           | object              | —                | Publishes this server's OAuth protected-resource metadata document (RFC 9728) so clients can discover where to log in. Advertisement only — it enforces nothing. See [OAuth discovery](#oauth-discovery).                                                                                                                                                                                      |
| `oauthDiscovery.issuer`    | string \| intrinsic | — **(required)** | `https://` URL of the authorization server that issues this server's tokens, published as the document's `authorization_servers` entry — either the literal URL, or a CloudFormation intrinsic resolving to it when the authorization server is created by this same stack. See [An issuer created by the same stack](#an-issuer-created-by-the-same-stack).                                   |
| `oauthDiscovery.publicUrl` | string              | —                | The public `https://` URL clients reach this service on — scheme, host, and any base path, everything before `/<name>/mcp`. Always a literal URL, with no query string. Set it when the domain is configured outside this service; otherwise it is derived from [`provider.domain`](./domains.md), falling back to the stage URL. See [Where the document points](#where-the-document-points). |
| `timeout`                  | integer (seconds)   | `60`             | Maximum tool duration, 1–900. Sets the function timeout **and** the streaming integration timeout together, so the two cannot drift apart. The official MCP SDK client also waits 60 seconds per request by default (configurable per call) — a tool that legitimately runs longer needs the client's timeout raised alongside this one.                                                       |
| `memorySize`               | integer (MB)        | `1024`           | Function memory, 128–10240. Falls back to `provider.memorySize` when set.                                                                                                                                                                                                                                                                                                                      |
| `environment`              | object              | `{}`             | Environment variables for the function, same shape as on a function — CloudFormation intrinsics included.                                                                                                                                                                                                                                                                                      |
| `state`                    | boolean \| string   | —                | Signing key for elicitation round trips. `true` provisions one in your stack; a literal SSM parameter or Secrets Manager secret ARN brings your own. See [Elicitation state](#elicitation-state).                                                                                                                                                                                              |

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
  {
    description: 'Rebuild the search index',
    // Required even for a tool with no inputs: without `inputSchema` the SDK
    // passes the context as the callback's ONLY argument, so an
    // `(args, ctx)` callback reads `ctx` as undefined.
    inputSchema: z.object({}),
  },
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

**The Framework never verifies tokens.** Enforcement is yours, and two independent per-server keys carry it:

- **`authorizer`** — access control, enforced by API Gateway in front of the function. Same shapes as an `http` event's `authorizer`.
- **`oauthDiscovery`** — advertisement, so clients can find your authorization server and log in. It enforces nothing. See [OAuth discovery](#oauth-discovery).

Any combination is valid: an authorizer with no discovery (machine-to-machine callers that already hold tokens), discovery with no authorizer (your module verifies tokens itself), both, or neither. When neither is set, the endpoint is public, exactly like an `http` event with no authorizer. Nothing warns about it, so treat an unauthenticated MCP server the way you would treat an unauthenticated HTTP API: only for tools whose whole surface is safe for anonymous callers.

There are three ways to enforce, and they compose.

### Rejecting at the gateway

`authorizer` wires your access control to the MCP route, so API Gateway rejects unauthorized requests before the server is invoked — the server function never runs for a rejected request. What rejection itself costs depends on the shape: Cognito user pools and `aws_iam` are validated by API Gateway itself, with no invocation anywhere, while a Lambda authorizer (the string form and most object forms) is its own invocation — far cheaper than running the server, but not zero, and cached with a caveat: the per-token cache under `resultTtlInSeconds` (300 seconds by default) holds returned policy documents, so accepted callers ride it, while an authorizer that rejects by throwing — the style that answers `401` — returns nothing to cache and is re-invoked for every rejected request. (Returning an explicit Deny policy caches too, but API Gateway answers it with `403` instead of the `401` that starts a client's OAuth flow.) Requests that omit the identity source are rejected without invoking even the authorizer. A string names one of your own authorizer functions:

```yml
functions:
  verifyToken:
    handler: src/authorizer.handler

mcp:
  servers:
    crm:
      server: src/server.mjs
      authorizer: verifyToken
```

A string compiles as a **`TOKEN` authorizer**, the same default an `http` event's `authorizer: <name>` gets. A `TOKEN` authorizer receives only the `Authorization` header's value, as `event.authorizationToken` — there is no `event.headers`, so an authorizer function written against the full request event finds nothing where it looks and rejects every call. If your function reads headers, ask for the request event with `type: request`:

```yml
mcp:
  servers:
    crm:
      server: src/server.mjs
      authorizer:
        name: verifyToken
        type: request
        identitySource: method.request.header.Authorization
```

The object form accepts everything an `http` event's `authorizer` object does — `name`, `arn`, `authorizerId`, `type`, `identitySource`, `identityValidationExpression`, `resultTtlInSeconds`, `scopes`, `managedExternally` — and compiles through the same machinery, so the [API Gateway event documentation](../events/apigateway.md#http-endpoints-with-custom-authorizers) applies verbatim. The one exception is `claims`, which only does anything under API Gateway's `lambda` integration — an integration MCP routes never compile, since they are always the streaming proxy. With a literal Cognito ARN the combination is rejected at package time; with a same-stack `Fn::GetAtt` ARN it is accepted and silently does nothing. Leave it out. Three more shapes are rejected at validation time with `MCP_AUTHORIZER_INVALID`, each with the fix in the message: an `authorizerId` without a `type` beside it (API Gateway requires both to attach an existing authorizer); an object naming none of `name`, `arn`, or `authorizerId` — unless its `type` is `aws_iam`, which needs no identifier; and a **string** authorizer that carries a colon — a string always names a function, so an ARN goes in the object form's `arn`, with a `name` of your own beside a Cognito pool ARN. `type` is matched case-insensitively (`request`, `REQUEST`, and `Request` are all the `REQUEST` type), and the canonical spelling API Gateway expects is written into the template for you — with one contradiction refused: `type: aws_iam` beside an `authorizerId`, because IAM authorization has API Gateway check the caller itself, with no authorizer resource for the id to attach.

An `arn` written as a CloudFormation intrinsic — a pool or function created by this same stack — needs a `name` beside it: the authorizer's CloudFormation name is otherwise derived from the ARN, and there is no ARN to read until the stack is created. And authorizer names share one CloudFormation namespace across the whole REST API: two servers may share one authorizer by writing the same definition, but two _different_ authorizers — on two servers, or on a server and one of your `http` events — whose names compile to the same logical id are rejected with `MCP_AUTHORIZER_NAME_COLLISION`, because only one authorizer resource would be created and one of the two routes would silently be guarded by the other's.

**A Cognito user pool needs no authorizer function at all** — point `arn` at the pool and API Gateway validates the JWT itself:

```yml
mcp:
  servers:
    crm:
      server: src/server.mjs
      authorizer:
        name: crmPool
        arn: arn:aws:cognito-idp:us-east-1:123456789012:userpool/us-east-1_ab12cd34e
        scopes:
          - crm/read
```

The `name` is required beside a literal pool ARN — it becomes the authorizer's CloudFormation name, and the one derived from a pool ARN otherwise is not a valid identifier, so leaving it off is rejected at validation time with `MCP_AUTHORIZER_INVALID`. With `scopes`, callers send a Cognito **access token** whose `scope` claim covers them; without `scopes`, API Gateway validates the ID token instead. Acceptance is scoped to the pool and the scopes, never to a client: a token from any app client of the same pool carrying a listed scope is accepted, so per-client access control needs distinct scopes (or distinct pools). A pool created in the same service's `resources` is referenced the way an `http` event references it — `name` plus `type: COGNITO_USER_POOLS`, with the `arn` as a `Fn::GetAtt` — and its issuer URL, equally nonexistent before the deploy, is written as an intrinsic too when pairing with `oauthDiscovery`: see [An issuer created by the same stack](#an-issuer-created-by-the-same-stack). One thing to know when pairing Cognito with `oauthDiscovery`: Cognito has no dynamic client registration, so it fits pre-registered clients and machine-to-machine callers well — the full discover-then-register client flow needs a provider that supports registration (Auth0, Okta, Entra ID, and similar).

`authorizer: aws_iam` requires callers to SigV4-sign every request with AWS credentials. That is a coherent choice for infrastructure calling infrastructure — but it is not OAuth, and no interactive client can log in against it, so do not pair it with `oauthDiscovery`: advertise only what your enforcement honors.

Whatever the authorizer rejects gets API Gateway's own bare `401` or `403`, not the MCP specification's challenge. That is enough for the official SDK client, which starts its OAuth flow on any bare `401` — see [what clients do with it](#what-clients-do-with-it).

### Verifying in your module

To verify tokens where the spec's semantics live — per-scope `403`s, `WWW-Authenticate` challenges, the verified identity available to your tools — gate the handler inside your module with the SDK's own `requireBearerAuth`, and default-export the gated `fetch`:

```js
// src/server.mjs
import {
  createMcpHandler,
  McpServer,
  OAuthError,
  OAuthErrorCode,
  requireBearerAuth,
} from '@modelcontextprotocol/server'

const handler = createMcpHandler(() => {
  const server = new McpServer({ name: 'crm', version: '1.0.0' })
  // ...register tools...
  return server
})

const gate = requireBearerAuth({
  // Your verification: check the token against your issuer (JWKS, introspection,
  // your library of choice) and return the SDK's AuthInfo shape. Populate
  // `expiresAt` — the gate rejects tokens without one.
  verifier: {
    async verifyAccessToken(token) {
      try {
        const { clientId, scopes, expiresAt } = await yourVerification(token)
        return { token, clientId, scopes, expiresAt }
      } catch {
        // A failed verification must be thrown as the SDK's OAuthError: that
        // is what the gate turns into the spec's `401` challenge — any other
        // throw is answered as a `500 server_error` instead. This catch is
        // total, so an issuer outage is also blamed on the token; a production
        // verifier may prefer to let infrastructure failures surface as
        // server errors.
        throw new OAuthError(
          OAuthErrorCode.InvalidToken,
          'Token verification failed',
        )
      }
    },
  },
  requiredScopes: ['crm/read'],
  // The URL of the Framework-served discovery document, carried on the
  // challenge. This front door renames the header in transit — see the
  // delivery note below the example.
  resourceMetadataUrl:
    'https://mcp.example.com/.well-known/oauth-protected-resource/crm/mcp',
})

export default {
  async fetch(request, options) {
    const auth = await gate(request)
    if (auth instanceof Response) return auth
    return handler.fetch(request, { ...options, authInfo: auth })
  },
}
```

The default export still satisfies the module contract — an object exposing a web-standard `fetch` — so nothing about deployment changes. The gate answers rejected requests with the spec's `401` + `WWW-Authenticate` (or `403 insufficient_scope` when `requiredScopes` are missing), and on success the verified identity reaches your tools as `ctx.http.authInfo`. Forward the second `fetch` argument as shown: it carries the pre-parsed request body.

One delivery note for this front door: REST API Gateway renames the challenge header in transit, so clients receive it as `x-amzn-remapped-www-authenticate` (AWS-documented, not configurable). A client that reads only `WWW-Authenticate` learns nothing from it — what carries clients into the login flow here is the `401` itself, which the official SDK client answers by probing the well-known discovery paths.

The trade-off against a gateway authorizer is cost: every rejection here runs the full server function, where a gateway rejection stops at the authorizer — or, with Cognito or `aws_iam`, costs no invocation at all.

### Combining both

The two layers answer different needs, so the strongest setup uses both: a gateway authorizer that checks the token is present and plausibly valid — cheap rejection of floods before the server ever runs — and the in-module gate for the judgement that needs the spec's semantics: scopes, challenges, and `ctx.http.authInfo` for per-caller behavior inside tools.

One boundary to know when combining them: API Gateway does forward a `request`-type authorizer's context into the function's event, but the Framework's entry never hands it to your module — your handler receives only the HTTP request itself. Identity your tools consume comes from the in-module gate's `ctx.http.authInfo`, not from the authorizer.

---

## OAuth discovery

Enforcement rejects the requests you don't want; discovery is how the clients you do want find their way in. `oauthDiscovery` publishes this server's RFC 9728 protected-resource metadata document — the standard answer to "where do I log in?":

```yml
mcp:
  servers:
    crm:
      server: src/server.mjs
      authorizer: verifyToken
      oauthDiscovery:
        issuer: https://example.us.auth0.com
```

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

The route is served by **API Gateway itself** — a static response fixed at deploy time, with no Lambda behind it, so unauthenticated discovery probes never invoke anything, never cold-start anything, and cost nothing per request. It answers `GET`, plus the `OPTIONS` preflight a browser-based client sends (the SDK client puts `mcp-protocol-version` on metadata fetches, which triggers one), with `Access-Control-Allow-Origin: *` on both. Other methods get API Gateway's default `403` — without CORS headers, so a browser client that mistakenly `POST`s here sees an opaque CORS error rather than the status.

The route deliberately never gets the server's `authorizer` — a client has to be able to read where to get a token before it has one. And discovery is advertisement, not enforcement: publishing this document does not protect the server. The coherence contract is yours — **advertise only what your enforcement honors**. `oauthDiscovery` without any `authorizer` is a legitimate setup ([your module enforcing tokens](#verifying-in-your-module) is invisible to the Framework), so it deploys without complaint; `serverless deploy --verbose` notes it as a reminder.

Without `oauthDiscovery`, no discovery route exists at all — metadata with no authorization server behind it would only mislead clients.

### An issuer created by the same stack

When the authorization server is a resource of this same service — a Cognito user pool declared under `resources` is the common case — its issuer URL does not exist until the stack is created, so there is no literal to write. Set `issuer` to a CloudFormation intrinsic instead, and the document is rendered with the real value at deploy time:

```yml
mcp:
  servers:
    crm:
      server: src/server.mjs
      authorizer:
        name: crmPool
        type: COGNITO_USER_POOLS
        arn: !GetAtt UserPool.Arn
      oauthDiscovery:
        issuer: !Sub 'https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPool}'
```

One deploy publishes the finished document — no placeholder, and no second deploy to fill it in. `Ref`, `Fn::GetAtt`, `Fn::ImportValue`, `Fn::Join`, `Fn::Sub`, `Fn::Base64`, and `Fn::ToJsonString` are the accepted intrinsics.

Validation covers what can be seen before CloudFormation resolves anything. An `Fn::Sub` written as a template string keeps the literal-issuer checks on its literal text: it must begin with `https://`, and no `$` or `#` may survive outside a `${...}` placeholder — including CloudFormation's `${!Literal}` escape, which renders as the literal text `${Literal}` and is rejected for the `$` it would put in the published document. Every other accepted shape — `Ref`, `Fn::GetAtt`, the `Fn::Sub` list form's variables, and the rest — resolves to a value only your stack can know, so it is passed through as written. Two consequences of those rules: an `Fn::Sub` whose entire template is one placeholder (`!Sub ${IssuerUrl}`) has no literal text to pass the `https://` check — when the whole URL comes from a single parameter, output, or resource attribute, name it directly with `Ref` or `Fn::GetAtt` instead; and a list-form `Fn::Sub` may not declare a variable named `RestApiId`, which the document's own rendering uses for this service's REST API id (`MCP_OAUTH_DISCOVERY_ISSUER_VARIABLE_COLLISION`).

`publicUrl` stays a literal URL either way: it names the public front door already in place in front of this service — configured somewhere else by definition, never a resource this stack creates — and the deploy prints it in the endpoint summary, where an unresolved intrinsic has nothing to render it. It also carries no query string, because the server's route is appended to it: `https://mcp.acme.com/base?tenant=acme` would publish `…/base?tenant=acme/crm/mcp`, an address that reaches nothing.

### Where the document points

The document's `resource` is this server's own public URL, so the Framework has to know what that is. It resolves one base URL per server — and the deploy summary prints the endpoint from the same resolution, so the URL you see is the URL the document advertises:

1. **`oauthDiscovery.publicUrl`**, when set — an `https://` URL, for a service fronted by something the Framework cannot see from your configuration: a CloudFront distribution, a domain managed in another service, or two REST domains (where it cannot pick one).
2. **[`provider.domain`](./domains.md)** (or a single REST-facing entry under `provider.domains`), when exactly one custom domain fronts the service's REST API — including its `basePath`, since that prefix is stripped before requests reach the API and nothing downstream could recover it.
3. **The stage URL** (`https://<api-id>.execute-api.<region>.amazonaws.com/<stage>` — the host suffix follows the AWS partition, so GovCloud and China regions get their own), as the fallback — with a warning, printed whenever the service is packaged or deployed, because a document living there cannot carry an interactive login (below). The warning names both ways out and repeats until one is taken.

The document is rendered at deploy time from that answer, not from the incoming request — so once a domain fronts the service, point every client at the domain: a spec-conformant client that reaches the server on the old `execute-api` URL sees a `resource` naming a different origin than the one it called, and refuses the server.

### What clients do with it

With an `authorizer` on the MCP route and `oauthDiscovery` published, both classes of interactive client get from a rejected first request to a login:

- **Clients that probe by convention** — Claude Code is one — request `/.well-known/oauth-protected-resource/…` and its siblings relative to the **origin root**, and never read response headers for a pointer.
- **Clients built on the official SDK** start their OAuth flow on any bare `401` — API Gateway's authorizer rejection is enough, no `WWW-Authenticate` needed — and then probe the well-known paths, path-aware with a root fallback.

Both sets of probes look under the origin root, which is what makes the endpoint's shape decisive:

- **On a custom domain mapped at the root** — [`provider.domain`](./domains.md) with no `basePath` — the metadata route sits exactly where every probe looks, and interactive login works for both classes. A non-root `basePath` moves the document off the root again, so the root probe no longer finds it.

  ```yml
  provider:
    name: aws
    domain: mcp.example.com
  ```

- **On the raw `execute-api` URL, no client can discover.** The stage name is the URL's first path segment, so the document sits at `/<stage>/.well-known/…` — a place no conventional probe looks, and structurally not the origin-root layout RFC 9728 describes. A client whose probes all miss can quietly fall back to treating the server's own origin as the authorization server and open `<origin>/authorize` — a URL nothing serves — so the symptom is a sign-in page that never loads, not a clear error.

Two setups need no discovery at all: machine-to-machine callers that are issued tokens out of band, and clients that accept a metadata URL directly in their configuration — for those, the document is reachable at the full URL, stage prefix included: `https://<api-id>.execute-api.<region>.amazonaws.com/<stage>/.well-known/oauth-protected-resource/<name>/mcp`. Claude Code takes no such setting; for it, the root-mapped custom domain is the way.

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

The `SERVERLESS_MCP_*` environment variables (`SERVERLESS_MCP_SERVER_MODULE`, `SERVERLESS_MCP_STATE_KEY_REF`) are how configuration reaches the deployed function — a configuration change is a CloudFormation environment update, not a new artifact. The `MCP_` prefix is left to the SDK.

---

## CLI behavior

| Command              | Behavior                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| `deploy`             | Prints one endpoint line per server, plus the domain summary when `provider.domain` is set                     |
| `info`               | Prints the same endpoint lines — where to look up URLs later                                                   |
| `logs -f <name>`     | The server's own CloudWatch logs, by bare server name                                                          |
| `invoke -f <name>`   | Reaches the function directly; use an MCP client against the endpoint to exercise the server                   |
| `print`              | Shows your configuration as written; the synthesized function never appears                                    |
| `package`            | Fully supported — entry staging and the build both happen at package time                                      |
| `dev`                | Serves servers through the module on your machine — edits apply on the next request. See [Dev Mode](#dev-mode) |
| `deploy function -f` | Updates the server's code. See the environment note under [Limitations](#limitations-in-this-release)          |
| `remove`             | Deletes everything, including the provisioned state secret. Re-deploying afterwards is safe                    |
| `rollback`           | Rolls the stack back normally; every MCP resource is in-stack                                                  |

---

## Dev Mode

[`serverless dev`](../cli-reference/dev.md) serves MCP servers. Requests hit the real deployed endpoint; the deployed function relays each invocation to your machine, where your local server module runs behind the same entry production uses. Edits to your code — TypeScript or JavaScript — apply on the next request, with no redeploy. The session banner lists each server's endpoint URL under `mcp:`, each request is logged by its JSON-RPC method and target (`→ λ crm ── mcp tools/call get_weather`) with the local run time on the reply line, and running `serverless deploy` after the session restores normal serving. The [`serverless dev` reference](../cli-reference/dev.md#mcp-servers) shows the session output.

Everything in front of the function keeps behaving the way it does deployed:

- **Access control stays in force.** An `authorizer` still rejects unauthorized requests at the gateway — an `aws_iam` server answers unsigned requests with `403` before anything runs — while authorized requests are served locally like any other; a Lambda authorizer runs through the same dev session as any other function. OAuth discovery documents remain served by API Gateway.
- **`state` keys work during a session.** The key is fetched from Secrets Manager or SSM by the locally running entry, using the function's own execution-role credentials, so elicitation round trips — sealed request state included — work end to end.

Two behaviors differ from a deployed server:

- **Results are delivered buffered.** The response body is assembled fully and delivered at once — valid Streamable HTTP — so progress notifications arrive together at the end of the call rather than as the work happens. Deploy normally to test incremental streaming.
- **Both Dev Mode limits apply per call.** Requests or results larger than roughly 125 KB fail with an error explaining the limit, as for all Dev Mode functions. And because nothing is written until the call finishes, progress cannot reset the idle clock described under [Endpoint type and long-running tools](#endpoint-type-and-long-running-tools): on the default edge-optimized endpoint, a call that has produced nothing for roughly 30 seconds is dropped downstream with a `504`, and the session prints a warning when a local run exceeds that budget. On `provider.endpointType: REGIONAL` there is no such budget and no warning — a dev-session tool call runs past 30 seconds up to the server's own `timeout`, 60 seconds by default. The ceiling itself is not dev-specific — a deployed streaming response that stays silent that long hits the same bound — but buffering means a dev session cannot write its way past it. Deploy normally to test long-running tools.

**Latency.** Each request runs your module fresh — a subprocess per invocation, plus a state-key fetch per request when `state` is configured — typically a few hundred milliseconds of overhead on top of the tool's own work.

---

## Limitations in this release

- **Long quiet tools need a regional endpoint.** Edge-optimized endpoints end a stream that has been quiet for roughly 30 seconds; set `provider.endpointType: REGIONAL`, which raises the bound to roughly 5 minutes. See [Endpoint type and long-running tools](#endpoint-type-and-long-running-tools).
- **Tools longer than ~300 seconds must emit progress** to stay inside that idle bound, regardless of `timeout`.
- **The Framework never verifies tokens.** Enforcement is your `authorizer` or your module's own gate; `oauthDiscovery` is advertisement only, and nothing validates that the two agree — advertise only what your enforcement honors. See [Authentication](#authentication).
- **Interactive OAuth login needs a custom domain mapped at the root.** On the default endpoint the discovery document sits under the stage prefix, where no client's conventional well-known probes look. Clients that accept a metadata URL directly work without a domain; Claude Code takes no such setting. See [OAuth discovery](#oauth-discovery).
- **A client disconnect does not stop a running tool.** Requests reaching Lambda through API Gateway REST do not carry the disconnect through, so a tool keeps running — and billing — after the caller has gone. `timeout` is the cost ceiling; set it to the longest tool you actually have rather than to the 900-second maximum.
- **Elicitation, sampling, and roots need a 2026-07-28 client, which is opt-in for official-SDK clients.** Clients on older protocol revisions are served per-request: tools, streaming, and progress all work, but a tool that asks the client for something mid-call — user input, a model completion, workspace roots — fails for them. See [Elicitation state](#elicitation-state) for the client-side `versionNegotiation` option.
- **Resource subscriptions do not deliver updates on this hosting.** A `subscriptions/listen` stream is held by one function instance and fed by an in-process event bus, so a change published while serving a call on any other instance never reaches it — and the stream ends at `timeout` regardless. Streaming responses and progress notifications, which travel inside the request being answered, are unaffected.
- **Dev Mode delivers results buffered.** Under `serverless dev`, progress notifications arrive together at the end of the call, on the default edge-optimized endpoint the whole call has to answer within roughly 30 seconds (on a regional endpoint, within the server's `timeout`), and requests or results larger than roughly 125 KB fail — deploy normally to test incremental streaming, long-running tools, or large payloads. See [Dev Mode](#dev-mode).
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
  verifyToken:
    handler: src/authorizer.handler

mcp:
  servers:
    crm:
      server: src/crm.mjs
      timeout: 300
      memorySize: 2048
      authorizer:
        name: verifyToken
        type: request
        identitySource: method.request.header.Authorization
      oauthDiscovery:
        issuer: https://example.us.auth0.com
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

---

## Examples

Runnable examples live in the [examples repository](https://github.com/serverless/examples/tree/v4/mcp), from a minimal public server to full OAuth walkthroughs — one per enforcement recipe, including driving the Claude Code CLI through discovery and browser login against a deployed server.
