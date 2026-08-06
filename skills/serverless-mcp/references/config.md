# The `mcp` config surface

## Contents

- The property table (all keys, defaults)
- Names, paths and discovery
- Endpoint type
- Authentication (`authorizer` shapes, Cognito, `aws_iam`)
- OAuth discovery (`oauthDiscovery`, a same-stack issuer, the URL chain, the stage-URL warning)
- `state` (what `true` provisions, BYO ARN, permissions)
- Packaging
- CLI
- Deliberately absent

Servers live under `mcp.servers.<name>`. The schema is strict —
`additionalProperties: false` at every level, the `authorizer` object and the
`oauthDiscovery` block included — so an unrecognized key is a validation error,
not a warning. There is no passthrough block: options are named, and grow on
demand.

```yml
mcp:
  servers:
    crm: # name: function key, Lambda name suffix, URL path segment
      server: src/server.mjs # required
      authorizer: verifyToken # string | http-event-style object | aws_iam
      oauthDiscovery:
        issuer: https://example.us.auth0.com
        publicUrl: https://mcp.example.com # optional
      timeout: 120 # seconds, 1–900
      memorySize: 1024 # MB, 128–10240
      environment:
        DB_TABLE: !Ref OrdersTable
      state: true # true | literal SSM or Secrets Manager ARN
```

| Property                   | Type                | Default          | Notes                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------- | ------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server`                   | string              | — **(required)** | Path to a module, relative to `serverless.yml`, whose default export is the result of `createMcpHandler()`.                                                                                                                                                                                                                                                   |
| `authorizer`               | string \| object    | —                | Access control on the MCP route, enforced by API Gateway before the server is invoked. A string names one of your own authorizer functions (compiled as `TOKEN`); an object takes the same shape as an `http` event's `authorizer` (Cognito user pools and existing authorizers included); `aws_iam` requires SigV4-signed callers. See Authentication below. |
| `oauthDiscovery`           | object              | —                | Publishes this server's OAuth protected-resource metadata document (RFC 9728) so clients can discover where to log in. Advertisement only — it enforces nothing. See OAuth discovery below.                                                                                                                                                                   |
| `oauthDiscovery.issuer`    | string \| intrinsic | — **(required)** | `https://` URL of the authorization server that issues this server's tokens, published as the document's `authorization_servers` entry — the literal URL, or a CloudFormation intrinsic when the authorization server is created by this same stack. See "A same-stack issuer" below.                                                                         |
| `oauthDiscovery.publicUrl` | string              | —                | The public `https://` URL clients reach this service on — scheme, host, and any base path, everything before `/<name>/mcp`. Always a literal URL, with no query string. Set it when the domain is configured outside this service; otherwise it is derived from `provider.domain`, falling back to the stage URL.                                             |
| `timeout`                  | integer (seconds)   | `60`             | Maximum tool duration, 1–900. Sets the function timeout **and** the streaming integration timeout together, so the two cannot drift. The official SDK client also waits 60 s per request by default (configurable per call) — a longer tool needs the client's timeout raised too.                                                                            |
| `memorySize`               | integer (MB)        | `1024`           | Falls back to `provider.memorySize` when that is set.                                                                                                                                                                                                                                                                                                         |
| `environment`              | object              | `{}`             | Same shape as on a function, CloudFormation intrinsics included.                                                                                                                                                                                                                                                                                              |
| `state`                    | boolean \| string   | —                | Elicitation signing key. `true` provisions one in the stack; a **literal** SSM parameter or Secrets Manager secret ARN brings your own. See `state` below.                                                                                                                                                                                                    |

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
- With `oauthDiscovery`, an unauthenticated route is added at
  **`/.well-known/oauth-protected-resource/<name>/mcp`** — `GET` plus the
  `OPTIONS` preflight, both served by API Gateway itself as a static response
  fixed at deploy time, with no Lambda behind it. Without `oauthDiscovery` no
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

Which of those URLs the discovery document advertises — and the deploy/info
endpoint summary prints — is resolved per server; see "Where the document
points" under OAuth discovery below.

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

**The Framework never verifies tokens.** Enforcement is yours, and two
independent per-server keys carry it: `authorizer` (access control, enforced by
API Gateway in front of the function) and `oauthDiscovery` (advertisement, so
clients can find your authorization server — next section). Any combination is
valid: an authorizer alone (machine-to-machine callers that already hold
tokens), discovery alone (your module verifies tokens itself), both, or neither
— with neither, the endpoint is public, exactly like an `http` event with no
authorizer, and nothing warns about it.

Three enforcement recipes, and they compose:

1. **Reject at the gateway** — `authorizer`, below. Rejected requests never
   invoke the server. What the authorizer rejects gets API Gateway's own bare
   `401` or `403`, not the spec's challenge — enough for the official SDK
   client, which starts its OAuth flow on any bare `401`.
2. **Verify in your module** — gate the handler with the SDK's own
   `requireBearerAuth` and default-export the gated `fetch` (the wrapper still
   satisfies the module contract). This is where the spec's semantics live:
   per-scope `403`s, `WWW-Authenticate` challenges carrying the metadata URL,
   and the verified identity on `ctx.http.authInfo`. One delivery caveat: REST
   API Gateway renames the challenge header to
   `x-amzn-remapped-www-authenticate` in transit, so clients reading
   `WWW-Authenticate` learn nothing from it — SDK clients enter the flow from
   the bare `401` and probe the well-known paths. A rejection costs a full
   server invoke.
3. **Both** — a gateway authorizer for cheap flood rejection, the in-module
   gate for scopes, challenges and `authInfo`. One boundary: API Gateway does
   forward a `request`-type authorizer's context into the function's event, but
   the entry never hands it to your module — identity your tools consume comes
   from the in-module gate.

### `authorizer` shapes

A string names one of your own authorizer functions and compiles as a
**`TOKEN` authorizer** — the same default an `http` event's string form gets. A
`TOKEN` authorizer receives only the `Authorization` header's value, as
`event.authorizationToken`, and has **no `event.headers`** — a function written
against the full request event finds nothing where it looks and rejects every
caller, valid ones included. If your function reads headers, ask for the
request shape:

```yml
authorizer:
  name: verifyToken
  type: request
  identitySource: method.request.header.Authorization
```

The object form accepts everything an `http` event's `authorizer` object does —
`name`, `arn`, `authorizerId`, `type`, `identitySource`,
`identityValidationExpression`, `resultTtlInSeconds` (default 300), `scopes`,
`managedExternally` — and compiles through the same machinery. `type` is
matched case-insensitively against `token`, `request`, `cognito_user_pools`,
`aws_iam`, `custom`, and the canonical spelling API Gateway expects is written
into the template for you. Five rules the validator enforces as
`MCP_AUTHORIZER_INVALID`: an object must name at least one of `name`, `arn` or
`authorizerId` — unless its `type` is `aws_iam`, which needs no identifier;
a bare `authorizerId` needs a `type` beside it, because API Gateway
requires both to attach an existing authorizer; a **string** authorizer
carrying a colon is refused — a string always names a function, so an ARN goes
in the object form's `arn`, with a `name` of your own beside a Cognito pool
ARN; an `arn` written as a CloudFormation intrinsic (a same-stack pool or
function) needs a `name` beside it, because the authorizer's CloudFormation
name is otherwise derived from an ARN that does not exist until the stack is
created; and `type: aws_iam` beside an `authorizerId` is a contradiction — IAM
has API Gateway check the caller itself, with no authorizer resource for the
id to attach. The one key that does nothing
here is `claims`: it only works under API Gateway's `lambda` integration, which
MCP routes never compile — with a literal Cognito ARN the combination is
rejected at package time; with a same-stack `Fn::GetAtt` ARN it is accepted and
silently inert. Leave it out.

**A Cognito user pool needs no authorizer function at all** — point `arn` at
the pool and API Gateway validates the JWT itself:

```yml
authorizer:
  name: crmPool
  arn: arn:aws:cognito-idp:us-east-1:123456789012:userpool/us-east-1_ab12cd34e
  scopes:
    - crm/read
```

`name` is required beside a literal pool ARN (the derived CloudFormation name
would be invalid — rejected at validation time with `MCP_AUTHORIZER_INVALID`).
With `scopes`, callers send a Cognito **access token** whose `scope` claim
covers them; without `scopes`, API Gateway validates the ID token instead.
Acceptance is pool-and-scope-scoped, never client-scoped: any app client of
the pool with a listed scope is accepted. A
pool created in the same service's `resources` is referenced the way an `http`
event references it — `name` plus `type: COGNITO_USER_POOLS`, with the `arn` as
a `Fn::GetAtt`. Cognito has no dynamic client registration, so it fits
pre-registered and machine-to-machine clients; the discover-then-register
client flow needs a provider that supports registration (Auth0, Okta, Entra ID
and similar).

**`authorizer: aws_iam`** requires callers to SigV4-sign every request with AWS
credentials — coherent for infrastructure calling infrastructure, but not
OAuth: no interactive client can log in against it, so do not pair it with
`oauthDiscovery`. Advertise only what your enforcement honors.

One namespace rule: authorizer names share the REST API's CloudFormation
namespace. Two servers may share one authorizer by writing the same
definition; two _different_ authorizers — on two servers, or on a server and
an `http` event — whose names compile to one logical id are refused with
`MCP_AUTHORIZER_NAME_COLLISION`, because only one authorizer resource would be
created and one route would silently be guarded by the other's.

What rejection costs depends on the shape: Cognito user pools and `aws_iam` are
validated by API Gateway itself, with no invocation anywhere; a Lambda
authorizer is its own invocation — far cheaper than running the server, but
not zero, and cached with a caveat: the per-token cache under
`resultTtlInSeconds` (default 300) holds returned policy documents, so
accepted callers ride it, while an authorizer that rejects by throwing — the
style that answers `401` — returns nothing to cache and is re-invoked for
every rejected request (a Deny policy caches too, but answers `403` instead of
the `401` that starts a client's OAuth flow). Requests that omit the identity
source are rejected without invoking even the authorizer.

## OAuth discovery

`oauthDiscovery` publishes this server's RFC 9728 protected-resource metadata
document (`resource`, `authorization_servers`, `bearer_methods_supported`) —
the standard answer to "where do I log in?". The route is served by **API
Gateway itself** as a static response fixed at deploy time, with no Lambda
behind it, so unauthenticated discovery probes never invoke anything, never
cold-start anything, and cost nothing per request. It answers `GET`, plus the
`OPTIONS` preflight a browser-based client sends (the SDK client puts
`mcp-protocol-version` on metadata fetches, which triggers one), with
`Access-Control-Allow-Origin: *` on both; other methods get API Gateway's
default `403` — without CORS headers, so a browser client that mistakenly
`POST`s here sees an opaque CORS error rather than the status.

The route deliberately never gets the server's `authorizer` — a client has to
be able to read where to get a token before it has one. And discovery is
advertisement, not enforcement: publishing the document does not protect the
server. The coherence contract is yours — **advertise only what your
enforcement honors**. `oauthDiscovery` without any `authorizer` is a legitimate
setup (an in-module gate is invisible to the Framework), so it deploys without
complaint; `serverless deploy --verbose` notes it as a reminder.

One character-level rule: the document is an API Gateway response template,
evaluated as Velocity on every request — `$` opens a variable reference and `#`
a directive — so neither character may reach it. `issuer` (for an `Fn::Sub`,
its literal text — CloudFormation's own `${...}` substitutions resolve long
before Velocity) and `publicUrl` containing one are rejected at validation
time; a `$` or `#` arriving through the custom domain, stage name or server
name fails the package with `MCP_OAUTH_DISCOVERY_VTL_UNSAFE_VALUE`.

### A same-stack issuer

`issuer` accepts a CloudFormation intrinsic for an authorization server this
same stack creates — a Cognito user pool declared under `resources` is the
common case, and one deploy publishes the finished document (no placeholder,
no second deploy):

```yml
oauthDiscovery:
  issuer: !Sub 'https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPool}'
```

Accepted intrinsics: `Ref`, `Fn::GetAtt`, `Fn::ImportValue`, `Fn::Join`,
`Fn::Sub`, `Fn::Base64`, `Fn::ToJsonString`; any other object shape is refused
(`MCP_OAUTH_DISCOVERY_ISSUER_REQUIRED`, quoting what was written). Validation
covers what is visible before CloudFormation resolves anything:

- An `Fn::Sub` **template string** keeps the literal-issuer checks on its
  literal text: `https://` prefix (`MCP_OAUTH_DISCOVERY_ISSUER_NOT_HTTPS`) and
  no `$`/`#` outside a `${...}` placeholder
  (`MCP_OAUTH_DISCOVERY_VTL_UNSAFE_VALUE`) — including the `${!Literal}`
  escape, which renders as literal `${Literal}` text and is rejected for the
  `$` it would publish.
- Every other accepted shape — `Ref`, `Fn::GetAtt`, the `Fn::Sub` list form's
  variables, and the rest — resolves to a value only the user's stack can
  know, so it passes through as written: the trust boundary is their own
  stack.
- An `Fn::Sub` that is entirely one placeholder (`!Sub ${IssuerUrl}`) has no
  literal text to pass the prefix check — when the whole URL comes from a
  single parameter, output or attribute, name it directly with `Ref` /
  `Fn::GetAtt`.
- A list-form `Fn::Sub` variable named `RestApiId` collides with the
  document's own substitution and is refused at package time
  (`MCP_OAUTH_DISCOVERY_ISSUER_VARIABLE_COLLISION`).

`publicUrl` stays literal either way — it names a front door that exists
outside this stack, and the deploy prints it — and additionally may not carry
a query string, because the server's route is appended to it
(`…/base?tenant=acme/crm/mcp` addresses nothing). Both refusals reuse
`MCP_OAUTH_DISCOVERY_PUBLIC_URL_NOT_HTTPS`.

### Where the document points

The document's `resource` is this server's own public URL, resolved once per
server — and the deploy/info endpoint summary prints from the same resolution,
so the URL you see is the URL the document advertises:

1. **`oauthDiscovery.publicUrl`**, when set — for a service fronted by
   something the Framework cannot see from configuration: a CloudFront
   distribution, a domain managed in another service, or two REST domains.
2. **`provider.domain`** (or a single REST-facing entry under
   `provider.domains`), including its `basePath`.
3. **The stage URL**, as the fallback — with a warning printed whenever the
   service is packaged or deployed, because a document living there cannot
   carry an interactive login: clients probe well-known paths relative to the
   origin root, and the stage name occupies the URL's first path segment. The
   warning names both ways out — set `publicUrl`, or declare the domain under
   `provider.domain` — and repeats until one is taken.

The document is rendered at deploy time from that answer, not from the incoming
request — so once a domain fronts the service, point every client at the
domain: a spec-conformant client reaching the server on the old `execute-api`
URL sees a `resource` naming a different origin than the one it called, and
refuses the server.

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
# For `state: true` or a Secrets Manager ARN:
- Effect: Allow
  Action: 'secretsmanager:GetSecretValue'
  Resource: '<the state secret ARN, from the stack output>'
# For an SSM parameter ARN instead:
- Effect: Allow
  Action: 'ssm:GetParameter'
  Resource: '<your parameter ARN>'
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
variables (`SERVER_MODULE`, `STATE_KEY_REF`), which makes a configuration
change a CloudFormation environment update rather than a new artifact. The
`MCP_` prefix is left to the SDK.

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
