<!--
title: MCP Servers
description: Deploy Model Context Protocol (MCP) servers to AWS Lambda behind an API Gateway REST API, with streaming, authorizers and OAuth discovery.
short_title: MCP Servers
keywords:
  [
    'Serverless Framework',
    'MCP',
    'Model Context Protocol',
    'MCP server on AWS Lambda',
    'API Gateway',
    'Streamable HTTP',
    'OAuth',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/mcp)

<!-- DOCS-SITE-LINK:END -->

# MCP Servers

MCP Servers deploys a Model Context Protocol (MCP) server written with the [official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) to AWS Lambda, behind an Amazon API Gateway REST API in response streaming mode. AI clients such as Claude, IDE assistants and agent frameworks then call its tools, read its resources and run its prompts over Streamable HTTP. Use it to host your own MCP server on AWS; the Framework's MCP server for your IDE is a different feature (see the [Serverless MCP Server](../../../guides/mcp/README.md)).

You write one module, a standard SDK server with no Lambda code in it, and declare it under the top-level `mcp` key of `serverless.yml`. The Framework creates the Lambda function, the HTTPS route with response streaming, and, when you set them, the gateway authorizer, the OAuth discovery document and the elicitation state key.

## Quick start

You need Node.js 20 or later and AWS credentials for `serverless deploy`.

1. In a new directory, install the SDK:

   ```bash
   npm init -y
   npm install @modelcontextprotocol/server zod
   ```

2. Write the server in `src/server.mjs`. Its default export is what `createMcpHandler()` returns:

   ```javascript
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

3. Declare it in `serverless.yml`:

   ```yaml
   # serverless.yml
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

4. Deploy:

   ```bash
   serverless deploy
   ```

   The deploy summary prints each server's URL, and `serverless info` prints it again later:

   ```text
   mcp: crm → https://abc123def.execute-api.us-east-1.amazonaws.com/dev/crm/mcp
   ```

5. Point any Streamable HTTP MCP client at the URL. With the MCP Inspector in CLI mode, a config file selects the server and opts into the current protocol revision (the Inspector's default is an older one):

   ```json
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

   Save it as `mcp.json` and list the tools:

   ```bash
   npx @modelcontextprotocol/inspector --cli --config mcp.json --server crm --method tools/list
   ```

   Without `--cli`, the Inspector opens its browser UI, where the same opt-in is the connection's **Protocol Era** setting.

This server is public: anyone with the URL can call its tools. To restrict it, see [Authenticate callers](#authenticate-callers). To delete everything the deploy created, run `serverless remove`.

## Server URLs and the shared REST API

Every server is served at `/<name>/mcp`, including the only server of a service, so URLs don't move when you add a second one:

| Setup                                        | URL                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| Default endpoint                             | `https://<api-id>.execute-api.<region>.amazonaws.com/<stage>/<name>/mcp` |
| With `provider.domain: mcp.example.com`      | `https://mcp.example.com/<name>/mcp`                                     |
| With a `basePath: v1` mapping on that domain | `https://mcp.example.com/v1/<name>/mcp`                                  |

All MCP servers of a service share one REST API (`AWS::ApiGateway::RestApi`), with each other and with the service's `http` events: one API, one stage, one custom domain. Custom domains come from [`provider.domain`](./domains.md); there is no per-server domain. A service whose other routes are `httpApi` events keeps its HTTP API, and MCP servers add the REST API beside it, with its own host name. `serverless deploy` and `serverless info` list the MCP servers under `mcp:` and the HTTP API routes under `endpoints:`. For custom domains on both, list one domain per API in `provider.domain`, with `apiType: rest` for the MCP servers and `apiType: http` for the rest (see [Multiple Domains](./domains.md#multiple-domains)).

Each route is a single `ANY` method, so the SDK answers other HTTP methods with the error bodies the MCP specification defines. Two servers in one service:

```yaml
mcp:
  servers:
    crm:
      server: src/crm.mjs
    docs:
      server: src/docs.mjs
```

```text
mcp:
  crm → https://abc123def.execute-api.us-east-1.amazonaws.com/dev/crm/mcp
  docs → https://abc123def.execute-api.us-east-1.amazonaws.com/dev/docs/mcp
```

### Server names

A server's name is its function key, the suffix of its Lambda function name (`<service>-<stage>-<name>`) and its URL path segment, so it follows the function key pattern `^[a-zA-Z0-9-_]+$`. These names are rejected when the configuration is read, so `serverless print` and `serverless package` report them too:

- A name whose CloudFormation logical ID equals one of your functions' or another server's: `MCP_FUNCTION_NAME_COLLISION`.
- `well-known`, in any case, because the discovery route lives under `/.well-known/`: `MCP_RESERVED_SERVER_NAME`.

An `http` event of your own on the same API Gateway resource as an MCP route is rejected with `API_GATEWAY_EXTERNAL_EVENT_ROUTE_COLLISION`, because a concrete method on that path would take the route's JSON-RPC traffic. Child paths such as `/crm/mcp/extra` are allowed.

## Configuration reference

Servers are defined under `mcp.servers`, keyed by server name:

```yaml
mcp:
  servers:
    crm:
      server: src/server.mjs # required
      authorizer: verifyToken # function name, http-event-style object, or aws_iam
      oauthDiscovery:
        issuer: https://example.us.auth0.com # https URL or CloudFormation intrinsic
        publicUrl: https://mcp.example.com # literal https URL only
      timeout: 120 # seconds, 1-900
      memorySize: 1024 # MB, 128-10240
      environment:
        ORDERS_TABLE: !Ref OrdersTable
      state: true # true, or a literal SSM parameter or Secrets Manager secret ARN

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

| Property                   | Type                     | Default                                 | Description                                                                                                                                                                                                                                |
| -------------------------- | ------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `server`                   | string                   | Required (`MCP_SERVER_MODULE_REQUIRED`) | Path of the module, relative to the service directory, whose default export is the result of `createMcpHandler()`.                                                                                                                         |
| `authorizer`               | string or object         | None (public)                           | Access control that API Gateway enforces before the server runs: an authorizer function's name, an object shaped like an `http` event's `authorizer`, or `aws_iam`. See [Reject requests at the gateway](#reject-requests-at-the-gateway). |
| `oauthDiscovery`           | object                   | None                                    | Publishes the server's OAuth protected-resource metadata (RFC 9728) so clients can find where to log in. It enforces nothing. See [OAuth discovery](#oauth-discovery).                                                                     |
| `oauthDiscovery.issuer`    | string or intrinsic      | Required in `oauthDiscovery`            | The `https://` URL of the authorization server that issues the server's tokens, or a CloudFormation intrinsic that resolves to it. See [Issuer created by the same stack](#issuer-created-by-the-same-stack).                              |
| `oauthDiscovery.publicUrl` | string                   | `provider.domain`, else the stage URL   | The public `https://` URL clients reach the service on, everything before `/<name>/mcp`. Literal only, with no query string. See [Where the discovery document points](#where-the-discovery-document-points).                              |
| `timeout`                  | integer (seconds), 1–900 | `60`                                    | The function timeout and the streaming integration timeout together. The official MCP SDK client waits 60 seconds per request by default, so a longer tool also needs the client's timeout raised.                                         |
| `memorySize`               | integer (MB), 128–10240  | `provider.memorySize`, else `1024`      | The function's memory.                                                                                                                                                                                                                     |
| `environment`              | object                   | None                                    | Environment variables, as on a function, CloudFormation intrinsics included.                                                                                                                                                               |
| `state`                    | boolean or ARN string    | None                                    | The signing key for elicitation round trips: `true` creates one in your stack; a literal SSM parameter or Secrets Manager secret ARN uses yours. See [Elicitation state](#elicitation-state).                                              |

Each server is a function of the service, so provider-level settings apply to it as to your own functions: `provider.architecture`, `provider.vpc`, `provider.layers`, `provider.iam`. Extend the generated execution role with `provider.iam.role.statements`, give every function its own role with `provider.iam.role.mode: perFunction`, or bring your own role (see [Permissions with your own role](#permissions-with-your-own-role)). The URL path, a per-server domain, CORS on the MCP route, and per-server `vpc`, `layers`, `role` or `provisionedConcurrency` aren't configurable per server.

### Runtime

MCP servers need Node.js 20 or later, the SDK's own minimum:

- `provider.runtime` unset, or a runtime other than Node.js (a Python service, for example): the server runs on `nodejs24.x`.
- `provider.runtime` a Node.js 20 or later runtime: the server runs on it.
- `provider.runtime` a Node.js runtime before 20: rejected with `MCP_UNSUPPORTED_NODE_RUNTIME` when the configuration is read.

The server module also needs zod 4.2 or later. With zod 3, `tools/list` returns tools with empty input schemas while `tools/call` works, so clients list the tools but can't fill in their arguments.

## Long-running tools and the endpoint type

`provider.endpointType` applies to the whole REST API, shared with the rest of the service; MCP servers don't change it, so the Framework's default, edge-optimized, applies unless you set it. The endpoint type decides how long a response stream may stay quiet:

- **Edge-optimized** (default): the stream ends after about 30 seconds without a write, counted from the invoke, and the client gets a `504`. What counts is the gap between writes: a 45-second tool that reports progress every 5 seconds completes, while 35 seconds with nothing written doesn't. Raising `timeout` doesn't change this bound.
- **Regional**: the bound is about 5 minutes.

To let tools work in silence longer than the edge bound allows, use a regional endpoint:

```yaml
provider:
  name: aws
  endpointType: regional
```

Either way, a tool that runs longer than about 300 seconds has to report progress to stay within the bound. Each SDK progress notification is a write on the stream and resets the idle clock:

```javascript
server.registerTool(
  'reindex',
  {
    description: 'Rebuild the search index',
    // Required even for a tool with no inputs: without `inputSchema`, the SDK
    // passes the context as the callback's only argument.
    inputSchema: z.object({}),
  },
  async (_args, ctx) => {
    // The token is a string or a number the client chose; 0 is a real value,
    // so check presence, not truthiness.
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

A client that disconnects doesn't stop a running tool: API Gateway REST APIs don't pass the disconnect to Lambda, so the tool runs, and is billed, until it ends or reaches `timeout`. Set `timeout` to your longest tool, not to the 900-second maximum.

## Authenticate callers

The Framework doesn't verify tokens. Two independent settings per server cover authentication:

- `authorizer`: access control, enforced by API Gateway before the server runs, with the same shapes as an `http` event's `authorizer`.
- `oauthDiscovery`: a document that tells clients where to log in. It enforces nothing (see [OAuth discovery](#oauth-discovery)).

Any combination is valid: an authorizer without discovery (machine-to-machine callers that already hold tokens), discovery without an authorizer (your module verifies tokens), both, or neither. With neither, the endpoint is public, like an `http` event without an authorizer, and nothing warns about it; use a public server only for tools that are safe for anonymous callers.

You can enforce at the gateway, in your module, or both.

### Reject requests at the gateway

With `authorizer`, API Gateway rejects unauthorized requests before the server function runs. A string names one of your functions as a Lambda authorizer:

```yaml
functions:
  verifyToken:
    handler: src/authorizer.handler

mcp:
  servers:
    crm:
      server: src/server.mjs
      authorizer: verifyToken
```

What a rejection costs depends on the authorizer:

- A Cognito user pool or `aws_iam` is checked by API Gateway, with no Lambda invocation.
- A Lambda authorizer is its own invocation. API Gateway caches the policies it returns per token for `resultTtlInSeconds` (default `300`). An authorizer that rejects by throwing, which API Gateway answers with `401`, returns nothing to cache, so it runs again for every rejected request. An explicit Deny policy is cached, but API Gateway answers it with `403` instead of the `401` that starts a client's OAuth flow.
- A request without the identity source (by default the `Authorization` header) is rejected without running the authorizer.

API Gateway answers a rejection with its own bare `401` or `403`, not the MCP specification's challenge. That is enough for the official SDK client, which starts its OAuth flow on any bare `401` (see [What clients do with the document](#what-clients-do-with-the-document)).

### Token and request authorizers

A string authorizer is a `TOKEN` authorizer, as for an `http` event's `authorizer: <name>`. A `TOKEN` authorizer receives only the `Authorization` header's value, as `event.authorizationToken`, and no `event.headers`. For an authorizer function that reads the request's headers, ask for the request event with `type: request`:

```yaml
mcp:
  servers:
    crm:
      server: src/server.mjs
      authorizer:
        name: verifyToken
        type: request
        identitySource: method.request.header.Authorization
```

The object form takes the keys of an `http` event's `authorizer` object: `name`, `arn`, `authorizerId`, `type`, `identitySource`, `identityValidationExpression`, `resultTtlInSeconds` (0–3600), `scopes` and `managedExternally`. See [Custom authorizers](../events/apigateway.md#http-endpoints-with-custom-authorizers) for each. `type` is one of `token`, `request`, `cognito_user_pools`, `aws_iam` or `custom`, in any case; the Framework writes the spelling API Gateway expects. Leave out `claims`: it applies only to API Gateway's `lambda` integration, and MCP routes always use the streaming proxy integration. With a literal Cognito ARN, `claims` is rejected when packaging; with a same-stack `Fn::GetAtt` ARN, it has no effect.

These shapes are rejected with `MCP_AUTHORIZER_INVALID`, each message naming the fix:

- An `authorizerId` without `type` (API Gateway needs both to attach an existing authorizer).
- An object with none of `name`, `arn` or `authorizerId`, unless its `type` is `aws_iam`.
- `type: aws_iam` beside an `authorizerId`.
- A string that contains a colon: a string always names a function, so an ARN goes in the object form's `arn`.
- A Cognito user pool ARN, or an `arn` written as an intrinsic, without a `name` beside it. The authorizer's CloudFormation name comes from `name`, and can't be derived from those ARNs.

Authorizer names share one CloudFormation namespace across the REST API. Two servers can share an authorizer by writing the same definition, but two different authorizers, on two servers or on a server and an `http` event, whose names map to the same logical ID are rejected with `MCP_AUTHORIZER_NAME_COLLISION`.

### Cognito user pool authorizers

A Cognito user pool needs no authorizer function: point `arn` at the pool, and API Gateway validates the token itself. `name` is required beside the pool ARN:

```yaml
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

With `scopes`, callers send a Cognito access token whose `scope` claim covers them; without `scopes`, API Gateway validates the ID token instead. Acceptance depends on the pool and the scopes, not the app client: a token from any app client of the pool with a listed scope is accepted, so per-client access needs distinct scopes or pools. For a pool declared under `resources`, write `name`, `type: COGNITO_USER_POOLS` and the `arn` as `Fn::GetAtt` (example under [Issuer created by the same stack](#issuer-created-by-the-same-stack)). Cognito has no dynamic client registration, so with `oauthDiscovery` it suits pre-registered clients and machine-to-machine callers; the discover-then-register client flow needs a provider that supports registration, such as Auth0, Okta or Microsoft Entra ID.

### IAM authorization

`authorizer: aws_iam` requires callers to sign every request with AWS credentials (Signature Version 4). It suits AWS workloads calling the server. Interactive clients can't log in against it, so don't pair it with `oauthDiscovery`.

### Verify tokens in your module

To answer with the MCP specification's semantics, such as per-scope `403`s, `WWW-Authenticate` challenges and the verified identity in your tools, gate the handler inside your module with the SDK's `requireBearerAuth`, and default-export the gated `fetch`:

```javascript
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
  // Check the token against your issuer (JWKS, introspection, your library of
  // choice) and return the SDK's AuthInfo shape. The gate rejects tokens
  // without `expiresAt`.
  verifier: {
    async verifyAccessToken(token) {
      try {
        const { clientId, scopes, expiresAt } = await yourVerification(token)
        return { token, clientId, scopes, expiresAt }
      } catch {
        // Throw the SDK's OAuthError: the gate turns it into the `401`
        // challenge; any other error becomes a `500 server_error`.
        throw new OAuthError(
          OAuthErrorCode.InvalidToken,
          'Token verification failed',
        )
      }
    },
  },
  requiredScopes: ['crm/read'],
  // The URL of the discovery document, sent with the challenge.
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

`yourVerification` stands for your own token check. The default export is still an object with a web-standard `fetch`, so deployment doesn't change. The gate answers a rejected request with `401` and `WWW-Authenticate` (or `403 insufficient_scope` when `requiredScopes` are missing), and a verified identity reaches your tools as `ctx.http.authInfo`. Pass the second `fetch` argument on as shown: it carries the parsed request body. The example's `catch` treats an issuer outage as an invalid token; to report infrastructure failures as server errors, rethrow them instead.

API Gateway REST APIs rename the challenge header in transit, so clients receive it as `x-amzn-remapped-www-authenticate`. A client that reads only `WWW-Authenticate` finds no pointer in it; the `401` itself starts the official SDK client's login, which then probes the well-known discovery paths.

Every rejection in the module runs the server function, where a gateway rejection stops at the authorizer, or, with Cognito or `aws_iam`, costs no invocation.

### Combine a gateway authorizer and a module gate

The strongest setup uses both: a gateway authorizer that rejects missing and invalid tokens before the server runs, and the module gate for scopes, challenges and `ctx.http.authInfo`. API Gateway passes a `request` authorizer's context into the function's event, but the Framework's entry hands your module only the HTTP request, so identity your tools use comes from the module gate.

## OAuth discovery

`oauthDiscovery` publishes the server's RFC 9728 protected-resource metadata, which tells clients where to log in:

```yaml
mcp:
  servers:
    crm:
      server: src/server.mjs
      authorizer: verifyToken
      oauthDiscovery:
        issuer: https://example.us.auth0.com
```

The document is served at `GET /.well-known/oauth-protected-resource/<name>/mcp`:

```json
{
  "resource": "https://mcp.example.com/crm/mcp",
  "authorization_servers": ["https://example.us.auth0.com"],
  "bearer_methods_supported": ["header"]
}
```

- API Gateway serves the document itself, as a static response fixed at deploy time, with no Lambda function behind it, so discovery requests invoke nothing and cost no Lambda time.
- The route answers `GET` and the `OPTIONS` preflight a browser-based client sends (the SDK client sends `mcp-protocol-version` on metadata requests, which triggers one), with `Access-Control-Allow-Origin: *` on both. Other methods get API Gateway's `403` without CORS headers.
- The route never gets the server's `authorizer`: a client reads it before it has a token.
- The document doesn't protect the server. Advertise only what your enforcement accepts. `oauthDiscovery` without `authorizer` deploys as it is (your module may verify tokens), and `serverless deploy --verbose` prints a reminder.
- Without `oauthDiscovery`, there is no discovery route.

### Issuer created by the same stack

When the authorization server is a resource of the same service, such as a Cognito user pool under `resources`, its issuer URL exists only after the stack is created. Set `issuer` to a CloudFormation intrinsic, and the deploy publishes the document with the real value:

```yaml
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

resources:
  Resources:
    UserPool:
      Type: AWS::Cognito::UserPool
```

`issuer` accepts `Ref`, `Fn::GetAtt`, `Fn::ImportValue`, `Fn::Join`, `Fn::Sub`, `Fn::Base64` and `Fn::ToJsonString`. The checks before deployment:

- An `Fn::Sub` template string must start with `https://`, and its literal text may contain no `$` or `#` outside `${...}` placeholders, including CloudFormation's `${!Literal}` escape. An `Fn::Sub` that is one placeholder only (`!Sub ${IssuerUrl}`) has no literal `https://`; name the value with `Ref` or `Fn::GetAtt` instead.
- A list-form `Fn::Sub` may not declare a variable named `RestApiId`, which the document uses for the REST API's ID (`MCP_OAUTH_DISCOVERY_ISSUER_VARIABLE_COLLISION`).
- Other intrinsics are passed to CloudFormation as written.

`publicUrl` is always a literal URL: it names a front door configured outside this stack, and the deploy prints it in the endpoint summary. It carries no query string, because the server's route is appended to it.

### Where the discovery document points

The document's `resource` is the server's public URL. The Framework picks one base URL per server, and the deploy summary prints the same URL:

1. `oauthDiscovery.publicUrl`, when set: for a service behind something the Framework can't see in your configuration, such as a CloudFront distribution, a domain managed in another service, or two REST API domains.
2. [`provider.domain`](./domains.md), or a single REST entry under `provider.domains`, when exactly one custom domain fronts the REST API, including its `basePath`.
3. The stage URL, `https://<api-id>.execute-api.<region>.amazonaws.com/<stage>`, with the partition's host suffix in GovCloud and China Regions. Packaging and deploying then print a warning, because interactive clients can't discover a document there (see [What clients do with the document](#what-clients-do-with-the-document)).

The document is fixed at deploy time, not built from each request. Once a domain fronts the service, point every client at the domain: a client that calls the `execute-api` URL sees a `resource` on another origin and refuses the server.

### What clients do with the document

With an `authorizer` on the route and `oauthDiscovery` published, interactive clients get from a rejected first request to a login:

- Clients that probe by convention, such as Claude Code, request `/.well-known/oauth-protected-resource/...` and its siblings relative to the origin root, and don't read response headers for a pointer.
- Clients built on the official SDK start their OAuth flow on any bare `401`, then probe the well-known paths, path-aware with a fallback to the root.

Both look under the origin root, so the endpoint's shape decides whether discovery works:

- **A custom domain mapped at the root** (`provider.domain` without `basePath`): the document is where every probe looks, and interactive login works for both kinds of client. A `basePath` moves it off the root again.

  ```yaml
  provider:
    name: aws
    domain: mcp.example.com
  ```

- **The `execute-api` URL**: the stage name is the first path segment, so the document is at `/<stage>/.well-known/...`, where no conventional probe looks. A client whose probes all miss can fall back to treating the server's own origin as the authorization server and open `<origin>/authorize`, which nothing serves: the symptom is a sign-in page that never loads.

Machine-to-machine callers that receive tokens out of band need no discovery, and clients that accept a metadata URL in their configuration can use the full URL with the stage: `https://<api-id>.execute-api.<region>.amazonaws.com/<stage>/.well-known/oauth-protected-resource/<name>/mcp`. Claude Code has no such setting, so it needs the root-mapped custom domain.

## Elicitation state

MCP elicitation lets a tool ask the caller for more input in the middle of a call. The server hands out sealed state and checks it when the client returns it; the SDK provides the codec, and `state` gives it a key:

```yaml
mcp:
  servers:
    crm:
      server: src/server.mjs
      state: true
```

With `state` set, the entry reads the key at cold start and puts it in `process.env.SERVERLESS_MCP_STATE_KEY` before your module is imported, so module-level code can use it. The key is never in the function's configuration in plain text.

### Clients that support elicitation

Elicitation needs a client on the 2026-07-28 protocol revision, whose in-band flow works without a session: the tool returns an `input_required` result, and the client retries the call with the answers. A client on an older revision is served per request: tools, streaming and progress work, but a tool that asks the client for something fails with an error naming the missing capability. The same applies to sampling (`sampling/createMessage`) and roots (`roots/list`).

Official SDK clients use the 2026-07-28 revision only when they opt in:

```javascript
const client = new Client(
  { name: 'my-client', version: '1.0.0' },
  {
    capabilities: { elicitation: { form: {} } },
    versionNegotiation: { mode: 'auto' }, // probe for 2026-07-28, fall back to earlier revisions
  },
)
```

With that option, the client's `elicitation/create` handler answers the tool's request locally, and the call is retried automatically.

### Ask for input from a tool

This tool asks the user to confirm a refund and seals the order ID so the retry can't change it:

```javascript
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
      // A declined or dismissed request ends the tool. `acceptedContent`
      // returns undefined both before asking and after a decline, so without
      // this check the client would be asked again and again.
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
        // First call: ask for confirmation, and seal what the retry brings back.
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
      // Present only when the client returned the sealed state and the codec
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

### Key created by `state: true`

`state: true` adds an AWS Secrets Manager secret with a generated 44-character value to your stack, so it is created, rolled back and deleted with the stack. Its ARN is a stack output named `<NormalizedName>McpStateSecretArn`, where `<NormalizedName>` is the server name normalized as for function logical IDs. Each stage is its own stack with its own secret, at about $0.40 per secret per month plus $0.05 per 10,000 API calls ([AWS Secrets Manager pricing](https://aws.amazon.com/secrets-manager/pricing/)); the server reads it once per cold start.

**Warning:** Changing `state: true` to your own ARN deletes the created secret at the next deploy, with no recovery window, and sealed state that clients still hold can no longer be verified. Make the change when no elicitation round trips are pending.

### Use your own key

Set `state` to the literal ARN of an SSM parameter or a Secrets Manager secret, for example to share a key across services or rotate it on your own schedule:

```yaml
mcp:
  servers:
    crm:
      server: src/server.mjs
      state: arn:aws:ssm:us-east-1:123456789012:parameter/crm/mcp-state-key
```

An SSM `SecureString` parameter is decrypted when read. Write the ARN out in full: its service decides whether the execution role gets `ssm:GetParameter` or `secretsmanager:GetSecretValue`, so a CloudFormation intrinsic, or an ARN of another service, is rejected with `MCP_INVALID_STATE_ARN`.

### Permissions with your own role

With the execution role the Framework generates, the read permission is added for you: `secretsmanager:GetSecretValue` or `ssm:GetParameter`, on that one key. With a role you bring (`provider.iam.role`, `provider.role`, or a role on the function), add the statement to its policy yourself:

```yaml
# Add to the policy of the role you provide.
# For state: true or a Secrets Manager ARN:
- Effect: Allow
  Action: 'secretsmanager:GetSecretValue'
  Resource: 'STATE_SECRET_ARN'
# For an SSM parameter ARN instead:
- Effect: Allow
  Action: 'ssm:GetParameter'
  Resource: 'STATE_PARAMETER_ARN'
```

`STATE_SECRET_ARN` is the secret's ARN from the stack output; `STATE_PARAMETER_ARN` is your parameter's ARN. Without the permission, the server fails at cold start with an error that names the action and the resource. After each deploy, the Framework also checks the role with `iam:SimulatePrincipalPolicy` and warns when the result is a definite deny; when it gets no answer, for example because the deploying credentials can't run the simulation, it prints nothing. A key encrypted with a customer managed AWS KMS key also needs `kms:Decrypt` on that key for the role, and the key policy must allow the role to use it.

## Packaging

Your server module is packaged by the service's [build configuration](./building.md), beside a prebuilt Lambda entry the Framework adds to the artifact. The entry connects Lambda's response streaming to the SDK's web-standard `fetch` handler. The `server` path is the same in every mode:

- **A JavaScript server (`.mjs`, `.js`)** isn't bundled by default: the artifact holds your source files and `node_modules`, and Node.js resolves the SDK and zod at run time. This also works for packages with native code, such as `sharp` or `prisma`.
- **A TypeScript server** is bundled by esbuild by default, like any TypeScript handler.
- **To bundle a JavaScript server** into one file, set `build.esbuild`:

  ```yaml
  build:
    esbuild:
      bundle: true
  ```

Keep these in mind:

- **Keep the SDK in `dependencies`.** Without bundling, packaging removes `devDependencies` from the artifact, so a server that imports `@modelcontextprotocol/server`, `@modelcontextprotocol/sdk` or `zod` from `devDependencies` fails at run time with `ERR_MODULE_NOT_FOUND`. The Framework warns about it; move the package to `dependencies`, or set `package.excludeDevDependencies: false`.
- **Give every server the same packaging.** A service that bundles any function is packaged from the bundler's file list, so a JavaScript server beside a bundled TypeScript one would be left out of the artifact. The Framework warns about it; give every server a TypeScript entry, or set `build.esbuild` so it covers all of them.
- **`serverless-mcp/` is reserved.** Packaging writes the entry to `serverless-mcp/` in the service directory and removes it when the command ends. A service that keeps its own files there is rejected with `MCP_ENTRY_STAGING_PATH_TAKEN`.
- **No prebuilt artifact.** A `package.artifact` that applies to an MCP server is rejected with `MCP_PREBUILT_ARTIFACT_UNSUPPORTED`, because the artifact is uploaded as it is, without the entry. Remove the setting, or move the MCP server to its own service.

The Framework passes the server's settings to the function in `SERVERLESS_MCP_*` environment variables (`SERVERLESS_MCP_SERVER_MODULE`, `SERVERLESS_MCP_STATE_KEY_REF`); the `MCP_` prefix is left to the SDK.

## CLI commands with MCP servers

| Command              | Behavior                                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `deploy`             | Prints one URL per server, and the domain summary when `provider.domain` is set.                                                                |
| `info`               | Prints the same URLs.                                                                                                                           |
| `logs -f <name>`     | The server's CloudWatch logs, by server name.                                                                                                   |
| `invoke -f <name>`   | Invokes the function directly; use an MCP client against the URL to exercise the server.                                                        |
| `print`              | Prints your configuration as written, without the generated function.                                                                           |
| `package`            | Builds the artifact, entry included.                                                                                                            |
| `dev`                | Runs the server module on your machine for requests to the deployed URL. See [Dev Mode](#dev-mode).                                             |
| `deploy function -f` | Updates the server's code. Environment changes need a full deploy when the environment holds a CloudFormation reference (see the next section). |
| `remove`             | Deletes everything, the `state: true` secret included. Deploying again afterwards works.                                                        |
| `rollback`           | Rolls back the stack; every MCP resource is in it.                                                                                              |

`serverless deploy function` doesn't update environment variables of a function whose environment holds a CloudFormation reference, which includes every server with `state` and any `!Ref` or `!GetAtt` in `environment`. The command says so with a warning; run `serverless deploy` to apply environment changes.

## Dev Mode

[`serverless dev`](./dev-mode.md) runs MCP servers on your machine: requests to the deployed URL reach the deployed function, which relays each invocation to your machine, where your server module runs behind the same entry as in Lambda. Saved changes to your code, TypeScript or JavaScript, apply on the next request, without a deploy. The session logs each request with its JSON-RPC method and target (`→ λ crm ── mcp tools/call get_weather`) and the local run time on the reply line, lists each server's URL under `mcp:` after the ready line, and restores the deployed server when it stops. [`serverless dev status`](../cli-reference/dev.md#dev-status) lists the URLs too, and the [`serverless dev` reference](../cli-reference/dev.md#mcp-servers) shows the session output. MCP servers run on your machine only when the Node.js that runs the CLI is 20.6 or later; on an older one, they keep running the deployed code, and the session says why.

What stays as deployed:

- **Access control.** An `authorizer` still rejects requests at the gateway (an `aws_iam` server answers unsigned requests with `403` before anything runs), and a Lambda authorizer runs through the same session as any other function. API Gateway still serves the discovery documents.
- **State keys.** The entry on your machine reads the key from Secrets Manager or SSM with the function's execution-role credentials, so elicitation round trips work.
- **Streaming.** Responses and progress notifications stream as in Lambda, so the idle bound under [Long-running tools and the endpoint type](#long-running-tools-and-the-endpoint-type) applies.

What differs:

- **Latency.** Each relayed request adds about half a second, more when its payload goes through Amazon S3. Each warm execution environment keeps one process on your machine, so module state persists between requests.
- **Payload size.** Requests and results larger than one AWS IoT Core message, about 126 KB, travel through the stage's deployment bucket, up to Lambda's own limits. See [Limits and known differences](./dev-mode.md#limits-and-known-differences) in the Dev Mode guide for when a session can't use the bucket.

## Limits and behavior

- **Resource subscriptions** don't deliver updates: a `subscriptions/listen` stream is held by one function instance and fed by an in-process event bus, so a change published while another instance serves a call never reaches it, and the stream ends at `timeout`. Streaming responses and progress notifications, which travel inside the request being answered, work.
- **Quiet tools** are bounded by the endpoint type, and tools longer than about 300 seconds need progress notifications (see [Long-running tools and the endpoint type](#long-running-tools-and-the-endpoint-type)).
- **Interactive OAuth login** needs a custom domain mapped at the root (see [What clients do with the document](#what-clients-do-with-the-document)).
- **Elicitation, sampling and roots** need clients on the 2026-07-28 protocol revision (see [Clients that support elicitation](#clients-that-support-elicitation)).

## Complete example

Two servers on a regional endpoint and a root-mapped custom domain, one with a request authorizer, OAuth discovery, a DynamoDB table and elicitation state:

```yaml
# serverless.yml
service: crm-tools
frameworkVersion: '4'

provider:
  name: aws
  region: us-east-1
  runtime: nodejs24.x
  endpointType: regional # quiet tools get about 5 minutes (edge: about 30 seconds)
  domain: mcp.example.com # mapped at the root, so clients can discover OAuth

build:
  esbuild:
    bundle: true # one bundled file per server

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

The `crm` server's role can't read `OrdersTable` until you grant it: add a statement for the DynamoDB actions the tools use under `provider.iam.role.statements`.

## Examples

The [MCP examples](https://github.com/serverless/examples/tree/v4/mcp) range from a minimal public server to OAuth walkthroughs, one per way of enforcing access, including driving the Claude Code CLI through discovery and browser login against a deployed server.

## Related

- [Dev Mode](./dev-mode.md): run the server module on your machine against the deployed URL.
- [Custom domains](./domains.md): the domain in front of the REST API.
- [API Gateway REST API events](../events/apigateway.md): the authorizer shapes MCP servers share with `http` events.
