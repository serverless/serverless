# Modern config syntax and targets

## Contents

- `service:` object form → string
- `frameworkVersion` pinning
- Legacy property aliases — rename or delete
- Runtimes — one consistent target
- Pin implicit `runtime:` and `region:`
- `provider.usagePlan` / `provider.apiKeys` → `provider.apiGateway.*`
- `params:` block → `stages:`
- `provider.iamRoleStatements` → `provider.iam.role.statements`
- `package.exclude` / `package.include` → `package.patterns`
- Plugin-era per-function IAM fields → native `iam.role.*`
- `${opt:stage, self:provider.stage}` → `${sls:stage}`
- Variable resolvers (opportunity material)

Schema, runtime, variable, and IAM updates. Each section except "Runtimes"
and "Variable resolvers" is a MUST-FIX you apply — it keeps the deployed result
identical, the service will not package without it, or it restores what the
config declares (confirm those with the user first; the section says so, and
names any case that is only an opportunity).

## `service:` object form → string

v4 uses the string form; with the v1/v2 object notation every command stops
at config load (`Object notation for "service" property is not supported`).

```yaml
# before
service:
  name: my-service
# after
service: my-service
```

## `frameworkVersion` pinning

`frameworkVersion` accepts a major (`'4'`), caret or tilde ranges (`'^4.x'`,
`'~4.x.y'`), an exact version, or `'*'` (always the latest). The CLI runs the
newest release that matches, so a major pin keeps the service on v4 while
4.x updates continue; pin an exact version for reproducible builds:

```yaml
frameworkVersion: '4'
```

Any existing pin that already locks the major (`'4'`, `'^4.x'`, `'~4.x.y'`) is
correct — do not rewrite it. Add a pin when the key is missing (use `'4'`),
and update a pre-4 pin as part of the upgrade. If the service uses `'*'`,
that is an explicit always-latest choice — suggest a major or exact pin in
the report rather than rewriting it.

## Legacy property aliases — rename or delete

These older property names are deprecated (in the schema, or by a CLI
deprecation notice). These renames are
template-equivalent (the packaged output is identical) — apply them as
MUST-FIX changes:

| Old                                | Current                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| `provider.role`                    | `provider.iam.role`                                                             |
| `provider.cfnRole`                 | `provider.iam.deploymentRole` (deploy-time role; no template effect either way) |
| `provider.iamManagedPolicies`      | `provider.iam.role.managedPolicies`                                             |
| `provider.rolePermissionsBoundary` | `provider.iam.role.permissionsBoundary`                                         |
| top-level `console:`               | delete — ignored since v3.24.0; superseded by the Dashboard                     |

`provider.iam.role.permissionBoundary` (no "s") is a legacy spelling of
`permissionsBoundary` — normalize it when seen.

Two more carry a caveat:

- **`provider.lambdaHashingVersion` — depends on the value.**
  - `'20201221'`: delete it. v4 uses that algorithm by default and logs that
    the setting is no longer effective, so the template does not change.
  - `'20200924'`: the value still feeds the `AWS::Lambda::Version` hash, and
    removing it alone does not force new versions. Confirm with the user and
    follow the documented migration for each stage: deploy with
    `--enforce-hash-update`, remove the property, deploy again. The deploys
    are the user's to run; read
    `serverless agent docs providers/aws/guide/functions` (Lambda Hashing
    Algorithm migration).
- **`functions.<name>.awsKmsKeyArn` → `kmsKeyArn` — a rename that activates.**
  v4 reads only `kmsKeyArn`; the old field has no template effect, so a
  service that declared a customer-managed key under `awsKmsKeyArn` has been
  deploying without it since v3 (v2 was the last version to apply the old
  field), and a v4-vs-v4 diff shows no change there: you are the detector.
  Renaming restores the declared encryption; the after-template gains
  `KmsKeyArn` on the function and `kms:Decrypt` in the role. Confirm with the
  user and explain both hunks.

## Runtimes — one consistent target

A runtime move changes what deploys, so it is an opportunity: report it, and
apply it only when the user says yes. When they do, use the newest GA Lambda
runtime for the language. Determine EOL status from
the AWS Lambda runtime deprecation schedule
(https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html).
`serverless package` warns about each runtime AWS has already deprecated,
with its dates, but schema validation and `serverless print` accept those
values (for example `nodejs16.x` or `go1.x`), and no command warns ahead of
a scheduled deprecation, so check the schedule yourself.
Apply ONE consistent choice across all functions in a run — do not vary the
target between functions or between runs. Note the AWS deprecation schedule
for the old runtime when you report it, including the date AWS blocks
function updates, after which deploys fail; the exact successor is the
user's call if they have a constraint. When that date has already passed,
the move is still the user's decision, but the next deploy fails until they
approve it: lead the report with it.

One runtime-behavior note the template diff cannot surface: `nodejs24.x` no
longer supports callback-style handler invocation — such functions deploy
cleanly but every invoke fails with `Runtime.CallbackHandlerDeprecated`.
When moving functions to `nodejs24.x`, confirm the handlers
use async/Promise style, including wrapper libraries that invoke an inner
handler for you (some Express-on-Lambda adapters drive it via callback even
when the exported handler is `async`). If callback style must stay, target
`nodejs22.x` and report the constraint.

Two migrations need more than a new value:

- **`go1.x` → `provided.al2023`:** the handler must become `bootstrap` (a
  binary named `bootstrap` at the artifact root), built for the current
  architecture (`GOOS=linux GOARCH=amd64` for the default `x86_64`), and
  packaged via `package.artifact` or an equivalent build step. Moving to
  `arm64` is a separate opportunity. This changes the build pipeline, not
  just the config value — verify the function still invokes, and expect
  handler/runtime hunks in the diff.
- **`dotnetcore*` → `dotnet10`:** the runtime value changes but the
  handler format (`Assembly::Namespace.Class::Method`) stays the same. The
  project's target framework must match the new runtime — flag the required
  rebuild to the user.

## Pin implicit `runtime:` and `region:`

A service that omits these keys deploys with defaults that are properties of
the CLI version and environment, not of the config:

- **`runtime:`** — the implicit default follows the CLI version: `nodejs12.x`
  in v2, `nodejs14.x` in v3.0–v3.34, `nodejs16.x` in v3.39, and a newer
  Node.js default in v4.
- **`region:`** — v4 resolves `provider.region`, then the `AWS_REGION`
  environment variable, then `us-east-1`; v3 did not read `AWS_REGION`. A
  config with no `region:` can target different regions depending on the
  shell that runs the deploy.

The baseline snapshot is packaged by v4, so it shows v4's defaults, not what
the service runs. Take the real runtime and region from the deployed stack
(`serverless diff`, or the function's Lambda configuration) or from the
default of the CLI version that deployed it, and pin those. A runtime or
region hunk against the baseline is then expected: explain it. Pinning a
different runtime is the runtime opportunity above.

## `provider.usagePlan` / `provider.apiKeys` → `provider.apiGateway.*`

The v1-era top-level keys moved under `provider.apiGateway`:

```yaml
# before
provider:
  apiKeys:
    - myKey
  usagePlan:
    quota:
      limit: 5000
      period: MONTH
# after
provider:
  apiGateway:
    apiKeys:
      - myKey
    usagePlan:
      quota:
        limit: 5000
        period: MONTH
```

v4 reports the old location as an unrecognized property and packaging
proceeds without it — the API keys and usage plan are absent from the
template. Because both equivalence snapshots are packaged by v4, the diff
shows no change for what a v1/v2-deployed stack had here: you are the
detector.
Relocate the keys, then confirm the `AWS::ApiGateway::UsagePlan` /
`AWS::ApiGateway::ApiKey` resources appear in the after-template and tell the
user they were being dropped.

## `params:` block → `stages:`

```yaml
# before (v3)
params:
  default:
    tableName: items-dev
  prod:
    tableName: items-prod
# after (v4)
stages:
  default:
    params:
      tableName: items-dev
  prod:
    params:
      tableName: items-prod
```

The old `params:` syntax still works, but `stages:` is the current shape and
adds per-stage `observability` and `resolvers`.

## `provider.iamRoleStatements` → `provider.iam.role.statements`

The v2-era `provider.iamRoleStatements` key is superseded by the `iam.role`
shape (since v2.24):

```yaml
# before
provider:
  iamRoleStatements:
    - Effect: Allow
      Action: [dynamodb:GetItem]
      Resource: '*'
# after
provider:
  iam:
    role:
      statements:
        - Effect: Allow
          Action: [dynamodb:GetItem]
          Resource: '*'
```

## `package.exclude` / `package.include` → `package.patterns`

Migrate the legacy keys to a single `package.patterns` list using `!`
negation:

```yaml
# before
package:
  exclude:
    - node_modules/**
  include:
    - src/**
# after
package:
  patterns:
    - '!node_modules/**'
    - src/**
```

Rewrite ONLY when the equivalence diff can prove the packaged file set is
unchanged — pattern-order semantics make this easy to get subtly wrong. For
how patterns are evaluated in order, the default exclusions, and how patterns
apply to the built-in esbuild output, read
`serverless agent docs providers/aws/guide/packaging` (Patterns). If the
service cannot produce a before-snapshot, report the rewrite as a suggestion
instead of applying it. One exception: if the block existed only to serve a
removed build plugin (e.g. webpack `node_modules` control), deleting it is
part of that build-plugin MUST-FIX change — the built-in bundler manages dependencies
itself.

## Plugin-era per-function IAM fields → native `iam.role.*`

Per-function IAM roles are built into the Framework (since 4.19.0). Migrate
the plugin-era function-level fields to the current native configuration:

| Old field                                   | Current field                                   |
| ------------------------------------------- | ----------------------------------------------- |
| `functions.<name>.iamRoleStatements`        | `functions.<name>.iam.role.statements`          |
| `functions.<name>.iamRoleStatementsInherit` | `functions.<name>.iam.inheritStatements`        |
| `functions.<name>.iamRoleStatementsName`    | `functions.<name>.iam.role.name`                |
| `functions.<name>.iamPermissionsBoundary`   | `functions.<name>.iam.role.permissionsBoundary` |

A per-function role is created when `iam.role.statements` or
`iam.role.managedPolicies` is set on a function. `provider.iam.role.mode:
perFunction` (since 4.26.0) gives **every** function its own role with
auto-scoped event-source permissions.

One note for the report phase: if the statements were previously inactive —
the service ran without `serverless-iam-roles-per-function`, so no
per-function role was ever deployed — native support activates them. Confirm
intent with the user and expect the corresponding IAM entries when reviewing
templates (they appear in both packaged snapshots, so the before/after diff
alone will not surface the activation).

Docs: `serverless agent docs providers/aws/guide/iam`

## `${opt:stage, self:provider.stage}` → `${sls:stage}`

`${opt:stage, self:provider.stage}` (and the region equivalent) predates the
`${sls:stage}` shorthand, which resolves the same effective stage. Two cases:

- **`provider.stage` not set in the config** — the fallback has nothing to
  resolve and packaging stops (`Cannot resolve '${opt:stage,
self:provider.stage}' ... No value is available`). Replacing the expression
  with `${sls:stage}` is the MUST-FIX change.
- **`provider.stage` set** — the idiom still resolves; report `${sls:stage}`
  as a simplification instead of applying it. If the user approves, the
  equivalence diff proves the rewrite (resolved values appear in the
  template).

## Variable resolvers (opportunity material)

v4 ships native resolvers that can replace secret-fetch scripts and hardcoded
ARNs. Report these; apply only if the user agrees, since they change how values
resolve:

- `${ssm:...}` — SSM Parameter Store / Secrets Manager values.
- `${terraform:...}` — remote Terraform state outputs.
- `${vault:...}` — HashiCorp Vault secrets.
- `${doppler:...}` — Doppler secrets.
- `${git:sha1|branch|tags|...}` — git metadata (the native successor to the
  git-variables plugin).
- `${aws:partition}` / `${aws:accountId}` / `${aws:region}` — replace hardcoded
  partition, account, and region segments in ARNs.
- Named resolver providers — `stages.<stage>.resolvers.<name>` plus
  `provider.resolver: <name>` select deployment credentials per stage, and
  `${<name>:ssm:...}` fetches variables from another account. The native
  route to multi-account setups previously handled with `AWS_PROFILE`
  switching.
