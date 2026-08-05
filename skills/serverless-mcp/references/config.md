# The `mcp` config surface

## Contents

- The property table (all keys, defaults)
- Names, paths and discovery
- Endpoint type
- Authentication (audiences, Cognito, rejecting before invoke)
- `state` (what `true` provisions, BYO ARN, permissions)
- Packaging
- CLI
- Deliberately absent

Servers live under `mcp.servers.<name>`. The schema is strict —
`additionalProperties: false` at the block, the per-server and the `auth` level —
so an unrecognized key is a validation error, not a warning. There is no
passthrough block: options are named, and grow on demand.

```yml
mcp:
  servers:
    crm: # name: function key, Lambda name suffix, URL path segment
      server: src/server.mjs # required
      auth:
        issuer: https://example.us.auth0.com
        audiences:
          - https://mcp.example.com
        authorizer: myAuthorizer # optional
      timeout: 120 # seconds, 1–900
      memorySize: 1024 # MB, 128–10240
      environment:
        DB_TABLE: !Ref OrdersTable
      state: true # true | literal SSM or Secrets Manager ARN
```

| Property          | Type              | Default          | Notes                                                                                                                                                      |
| ----------------- | ----------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server`          | string            | — **(required)** | Path to a module, relative to `serverless.yml`, whose default export is the result of `createMcpHandler()`.                                                |
| `auth`            | object            | —                | Bearer-token enforcement plus the discovery route. `issuer` and `audiences` are both required whenever `auth` is present.                                  |
| `auth.issuer`     | string            | — **(required)** | `https://` URL of an OpenID Connect provider. Its `/.well-known/openid-configuration` is read on first use and the JWKS cached for the container.          |
| `auth.audiences`  | string[]          | — **(required)** | At least one accepted audience. For Amazon Cognito, these are app client IDs — see Audiences below.                                                        |
| `auth.authorizer` | string            | —                | Name of one of your own authorizer functions, attached to the MCP route only. The discovery route never gets it.                                           |
| `timeout`         | integer (seconds) | `120`            | Maximum tool duration, 1–900. Sets the function timeout **and** the streaming integration timeout together, so the two cannot drift.                       |
| `memorySize`      | integer (MB)      | `1024`           | Falls back to `provider.memorySize` when that is set.                                                                                                      |
| `environment`     | object            | `{}`             | Same shape as on a function, CloudFormation intrinsics included.                                                                                           |
| `state`           | boolean \| string | —                | Elicitation signing key. `true` provisions one in the stack; a **literal** SSM parameter or Secrets Manager secret ARN brings your own. See `state` below. |

Service-wide settings reach the synthesized function normally, so
`provider.architecture`, `provider.memorySize`, tags and the like apply as they
do to your own functions.

## Names, paths and discovery

- A server name follows the function-key charset `^[a-zA-Z0-9-_]+$` and is used
  three ways: the function key (`logs -f crm`), the Lambda name suffix
  (`<service>-<stage>-<name>`), and the URL path segment.
- Every server is served at **`/<name>/mcp`**, including the only server in a
  service — so URLs never move when a second one is added. The route compiles
  as a single `ANY` method; the SDK itself answers non-POST verbs with
  spec-correct bodies (a bare `GET` gets `405`).
- With `auth`, an unauthenticated `GET` route is added at
  **`/.well-known/oauth-protected-resource/<name>/mcp`**, on the same function,
  serving the RFC 9728 document (`resource`, `authorization_servers`,
  `bearer_methods_supported`) built from the incoming request. Without `auth` no
  such route exists at all.
- `well-known` is a reserved server name. Two names that normalize to the same
  CloudFormation logical ID collide (path normalization folds case and strips
  `_`, so `foo_bar` and `foobar` are the same name to the compiler), and so does
  a name matching one of your own functions.

| Setup                              | URL                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------ |
| Default endpoint                   | `https://<api-id>.execute-api.<region>.amazonaws.com/<stage>/<name>/mcp` |
| `provider.domain: mcp.example.com` | `https://mcp.example.com/<name>/mcp`                                     |
| …with a `basePath: v1` mapping     | `https://mcp.example.com/v1/<name>/mcp`                                  |

All MCP servers in a service share one `AWS::ApiGateway::RestApi` with each
other and with your `http` functions — one API, one stage, one custom domain
from `provider.domain`
(`https://www.serverless.com/framework/docs/providers/aws/guide/domains`). There
is no per-server `domain` key, because the domain belongs to the API.

When a single REST custom domain fronts the service, the Framework tells the
deployed server its public origin (`SERVERLESS_MCP_PUBLIC_BASE_URL`) so the URLs
it advertises match the one clients use. Behind something the Framework cannot
see — CloudFront, two REST domains — set that variable yourself in the server's
`environment`; a value you set always wins.

## Endpoint type

`provider.endpointType` is API-wide, shared with the rest of the service, so
`mcp` neither changes nor validates it. The Framework default is `EDGE`, and an
edge-optimized endpoint ends a response stream that has been quiet for roughly
30 seconds, counted from the invoke — the gap between writes is what matters, so
a 45-second tool writing every 5 seconds completes while a 35-second silent
stretch does not. `REGIONAL` raises the bound to roughly 5 minutes — reach for
it when tools work in silence longer than the default allows:

```yml
provider:
  name: aws
  endpointType: REGIONAL
```

Beyond roughly 300 seconds, progress notifications are the only thing keeping a
call inside the idle bound, whatever `timeout` says.

## Runtime

MCP servers run on Node.js 20 or newer — the SDK's own floor.

- `provider.runtime` unset, or a non-Node runtime (a Python service, say) → the
  server runs on `nodejs24.x`
- `provider.runtime` set to Node.js 20 or newer → honored as-is, including
  majors released after this version of the Framework
- `provider.runtime` set to a Node.js runtime below 20 → `MCP_UNSUPPORTED_NODE_RUNTIME`

That error, and the name collisions above, are raised as soon as configuration
resolves — `print` and `package` report them, not only `deploy`.

## Authentication

With `auth` set, verification happens inside the function before your handler
runs: the token is checked against the issuer's JWKS and the verified identity
reaches tools as `ctx.http.authInfo`. A request without a valid token gets the
spec's `401` plus a `WWW-Authenticate` challenge naming this server's metadata
URL. `audiences` is required alongside `issuer` because issuer-only verification
accepts any token that issuer ever minted, for any application.

Setting `auth` and doing your own token checks inside the module are
alternatives — pick one. With no `auth`, the endpoint is public, exactly like an
`http` event with no authorizer, and nothing warns about it.

### Audiences

The rule is the one AWS's managed JWT authorizers use:

- a token carrying `aud` must match one of `audiences` — `aud` is authoritative
  and never bypassed
- only a token with no `aud` at all is matched on its `client_id` claim instead

That fallback exists because **Amazon Cognito access tokens carry `client_id`
and no `aud`**. For a Cognito issuer, list your **app client IDs**:

```yml
auth:
  issuer: https://cognito-idp.us-east-1.amazonaws.com/us-east-1_ab12cd34e
  audiences:
    - 1example23client45id67890
```

Two Cognito consequences:

- **Send the access token, not the ID token.** Both are signed with the same
  keys by the same issuer, and an ID token's `aud` _is_ the app client ID, so
  the audience rule alone cannot separate them. A token whose `token_use` claim
  says it is not an access token is rejected. No other issuer emits that claim,
  so nothing else is judged on it.
- **Cognito has no dynamic client registration.** It fits pre-registered and
  machine-to-machine clients; the discover-then-register client flow needs a
  provider that supports registration (Auth0, Okta, Entra ID and similar).

Scopes are read from `scope` or Entra ID's `scp`; the OAuth client id comes from
`client_id` or Auth0's `azp`; the whole verified claim set rides along on
`authInfo.extra.claims`.

### Rejecting before invoke

In-function verification still pays for the invocation. `auth.authorizer` names
one of your own authorizer functions and attaches it to the MCP route, so API
Gateway rejects unauthorized requests first. The discovery route deliberately
does not get it — a client has to read that document before it has a token.

Two traps. The function is wired as a **`TOKEN` authorizer** (the `http` event's
default), so it reads `event.authorizationToken` and has **no `event.headers`** —
a handler written against the request-authorizer shape rejects every caller,
including valid ones. And what the authorizer rejects never reaches the server,
so those callers get API Gateway's bare `{"message":"Unauthorized"}` instead of
the spec's challenge: the more it verifies, the fewer clients can discover the
authorization server from a rejection. Checking only that a well-formed bearer
token is present keeps the flood protection and leaves the challenge intact.

## `state`

MCP's elicitation flow needs the server to hand out a sealed blob and trust it
when it comes back. The SDK owns the codec; `state` owns the key it is built
from. The key is read at cold start and placed in
`process.env.SERVERLESS_MCP_STATE_KEY` **before your module is imported**, so
module-level code sees it; it never sits in plaintext function configuration.

**`state: true`** provisions an `AWS::SecretsManager::Secret` with a generated
44-character value in the stack — created, rolled back and deleted with it — and
exports its ARN as the `<NormalizedName>McpStateSecretArn` stack output. Cost is
about $0.40 per month per state-enabled server **per stage** (each stage is its
own stack, and so its own secret), plus $0.05 per 10,000 reads; the server reads
it once per cold start. Secrets Manager is used because it is the only way to
have CloudFormation generate a random secret without a custom resource, and that
generation is what buys the full stack lifecycle.

Switching `state: true` to an ARN of your own **deletes the provisioned secret
immediately, with no recovery window** — any sealed elicitation state still in
flight can no longer be verified. Roll that change out when no round trips are
pending.

**`state: <arn>`** brings your own — the free path, and the one for a key shared
across services or rotated on your own schedule:

```yml
state: arn:aws:ssm:us-east-1:123456789012:parameter/crm/mcp-state-key
```

An SSM `SecureString` is decrypted on read. The ARN must be a literal string
naming SSM Parameter Store or Secrets Manager: the service inside it decides
whether the role is granted `ssm:GetParameter` or
`secretsmanager:GetSecretValue`, and a CloudFormation intrinsic hides that —
hence `MCP_INVALID_STATE_ARN` for an intrinsic or for any other service.

### Permissions

With the execution role the Framework generates, the read grant is attached for
you, scoped to that one key. Under `provider.iam.role.mode: perFunction` each
grant goes onto its own server's role, so no other function gets a key it has no
business reading.

With a role you bring (`provider.iam.role`, `provider.role`, or a role on the
function) the Framework cannot modify it, so attach the statement yourself:

```yml
- Effect: Allow
  Action: 'secretsmanager:GetSecretValue'
  Resource: '<the state key ARN — the stack output, or your own ARN>'
```

Two things then cover a missing grant: after a deploy the Framework simulates
the role against the key and warns on a definite deny (staying silent when it
cannot get a verdict — for instance when the deploying credentials may not call
`iam:SimulatePrincipalPolicy`), and at cold start the server fails with a message
naming the exact action and resource. A key encrypted with a customer-managed
KMS key additionally needs `kms:Decrypt` on that key, and the key policy has to
allow the role to use it.

## Packaging

The module is packaged the way the service builds anything, alongside the
prebuilt entry. The same relative path is used in both modes.

- **Classic zip** — the default for a `.mjs` server: zero-config esbuild builds
  TypeScript entries only, so a JavaScript server ships the source tree plus
  `node_modules` and Node resolves the SDK and zod at runtime. No walls for
  native dependencies.
- **Single-file bundle** — opt in with a `build.esbuild` block, or write the
  server in TypeScript, which is bundled by default.

Two things to keep in mind:

- **Keep the SDK and zod in `dependencies`.** Classic packaging strips
  `devDependencies`, and the deployed server then fails with
  `ERR_MODULE_NOT_FOUND`. The Framework warns when it sees the combination; the
  alternative is `package.excludeDevDependencies: false`.
- **Treat every server in a service the same way.** A service that bundles
  anything is packaged from the bundler's file list, so a TypeScript server
  (bundled by default) alongside a JavaScript one (not bundled unless asked)
  leaves the second out of the artifact. Give them all a TypeScript entry, or
  set `build.esbuild` so it covers all of them.

Packaging stages the entry into a `serverless-mcp/` directory inside the service
directory and removes it when the run ends, so that path is reserved. A prebuilt
`package.artifact` is not supported: such an artifact is uploaded exactly as it
is, so the entry never reaches it.

Configuration travels to the function as `SERVERLESS_MCP_*` environment
variables (`SERVER_MODULE`, `AUTH_ISSUER`, `AUTH_AUDIENCES`, `STATE_KEY_REF`,
`PUBLIC_BASE_URL`), which makes a configuration change a CloudFormation
environment update rather than a new artifact. The `MCP_` prefix is left to the
SDK.

## CLI

| Command              | Behavior                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `deploy`             | One endpoint line per server, plus the domain summary when `provider.domain` is set              |
| `info`               | The same endpoint lines — where to look a URL up later                                           |
| `logs -f <name>`     | The server's CloudWatch logs, by bare server name                                                |
| `invoke -f <name>`   | Reaches the function directly; use an MCP client against the endpoint to exercise the protocol   |
| `print`              | Your configuration as written — the synthesized function never appears                           |
| `package`            | Fully supported: entry staging and the build both happen at package time                         |
| `deploy function -f` | Updates code. Environment variables are not updated when any value is a CloudFormation reference |
| `remove`             | Deletes everything, including a provisioned state secret. Re-deploying afterwards is safe        |
| `rollback`           | Rolls the stack back normally — every MCP resource is in-stack                                   |

## Deliberately absent

The URL path (always `/<name>/mcp`), a per-server domain (use
`provider.domain`), CORS on the tool routes (the metadata route sends
`Access-Control-Allow-Origin: *` on its own), per-server `vpc`, `layers`,
`role`, `provisionedConcurrency` (the server is an ordinary function, so the
provider-level equivalents apply — `provider.vpc`, `provider.layers`, and the
whole `provider.iam` surface, `role.statements` and `role.mode: perFunction`
included), tool schemas in YAML, and any Framework runtime API inside the
module. Three more behaviors worth knowing: a client
disconnect does not stop a running tool on this front door (`timeout` is the
cost ceiling — set it to the longest tool you actually have, not to 900),
resource subscriptions never deliver updates here (the listen stream sits on
one function instance with an in-process event bus, and ends at `timeout`),
and Dev Mode does not serve MCP servers in this release.
