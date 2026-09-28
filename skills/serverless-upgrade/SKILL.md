---
name: serverless-upgrade
description: >-
  Upgrades Serverless Framework services from v1, v2, or v3 to v4, and cleans
  up older v4 configuration, without changing what the service deploys. Use
  whenever a serverless.yml pins frameworkVersion below 4, lists plugins the
  Framework now builds in, uses v3-era syntax or a deprecated runtime, prints
  deprecation warnings, or the project installs serverless v3 locally — and
  whenever the user asks to upgrade, modernize, or fix such a service, even
  if they never say "upgrade". Not for adding features to a v4 service; that
  is the serverless-framework skill.
metadata:
  managed-by: serverless-framework
  version: '1'
  author: Serverless Inc.
---

# Upgrading Serverless Framework Services to v4

Bring an existing service to modern v4 configuration **without changing what it
deploys**. Work in two strictly separated phases: MUST-FIX changes you apply,
and opportunities you only report.

## The equivalence gate

Before editing anything, snapshot the packaged CloudFormation template. After
your changes, package again and diff. The diff must be empty after known-benign
normalization, or every surviving hunk must be explained to the user. "The
changes look safe" is not a verification — looking safe and being equivalent are
different claims, and this gate is what turns one into the other. Procedure and
benign-diff list: [references/verification.md](references/verification.md).

"Do not deploy" does not mean "do not verify". `serverless print` and
`serverless package` deploy nothing and change no infrastructure. They need
sign-in, and `package` also needs AWS credentials. If the CLI asks for them,
that is one-time setup to resolve with the user, not a blocker — see the
Authentication section of
[references/upgrading-from-v3.md](references/upgrading-from-v3.md), then
continue verification.

## Workflow

1. **Snapshot** — package the unmodified config to a folder (verification.md,
   "Before"). If the service is not in a git repository, also copy the files
   you will edit (`serverless.yml`, `package.json`, the lockfile) into that
   folder, so the user can compare and revert. If a v1–v3 `frameworkVersion` pin is what blocks it, package
   with only the pin changed to `'4'`. If `devDependencies` list `serverless`
   v1–v3, every command runs that local copy, which refuses the new pin:
   remove it too (`npm uninstall serverless`; upgrading-from-v3.md, "A local
   `serverless` install"). If a legacy build plugin then conflicts
   with the built-in bundler, add `build.esbuild: false` for this snapshot
   only; the upgrade itself removes the plugin and moves its options under
   the built-in `build.esbuild` (plugin-replacements.md). If the config still
   will not package, capture the error verbatim and tell the user; the bar
   then becomes "the after config packages cleanly and its template is
   reviewed" (verification.md, "No baseline").
2. **Audit** — scan against the detection checklist below. Classify every
   finding as MUST-FIX or OPPORTUNITY.
3. **Apply MUST-FIX changes only** — exact per-pattern changes:
   [plugin-replacements.md](references/plugin-replacements.md) for absorbed
   plugins; [modern-config.md](references/modern-config.md) for
   schema/runtime/variable/IAM updates;
   [upgrading-from-v3.md](references/upgrading-from-v3.md) when the service
   comes from v3 or earlier (auth for CI, dotenv, deploy mode).
4. **Verify** — package again and diff (verification.md, "After"). Iterate until
   equivalent or every hunk is explained. `serverless print` is the quick
   config-resolution check between edits. For a service that is already
   deployed, finish with `serverless diff` against the live stack
   (verification.md, "Against the deployed stack").
5. **Report opportunities** — a short list with rationale. Apply none of them
   unless the user explicitly says yes.

## Gotchas

- The project's npm scripts (`npm start` and the like) run the `serverless`
  in its `node_modules`, not the global v4. A plugin whose peer range allows
  only v3 (serverless-offline 13) installs v3 there even after you remove the
  dependency: move it to a v4 major and run the scripts after the upgrade
  (upgrading-from-v3.md, "A local `serverless` install").
- `build.esbuild: false` is for the before-snapshot only; the upgrade itself
  removes the build plugin, unless the user decides to keep it
  (plugin-replacements.md).
- Removing `useDotenv: true` also removes the rule that keeps `.env*` files
  out of the package: add `'!.env*'` to `package.patterns` in the same edit
  (upgrading-from-v3.md).
- The built-in bundler builds TypeScript handlers with zero config and
  JavaScript handlers when `build.esbuild` is set, for functions whose own or
  provider `runtime:` is an explicit `nodejs*` value. Pin `runtime:` before
  or with removing a build plugin (plugin-replacements.md).
- Moving to the built-in bundler adds a generated `package.json` and the
  lockfile to every zip (expected), turns on source maps through
  `NODE_OPTIONS`, and leaves code unminified by default (plugin-replacements.md).
- v4 reads only the current keys for top-level `usagePlan`/`apiKeys` and a
  function's `awsKmsKeyArn`, so the old ones have no template effect and a
  v4-to-v4 diff shows no change there. Check those yourself (modern-config.md).
- `serverless package` warns about runtimes AWS has already deprecated;
  `serverless print` does not, and no command warns ahead of a scheduled
  deprecation. Check the runtime against AWS's schedule and report it
  (modern-config.md).

## Two-phase discipline

MUST-FIX = a change that keeps the deployed result identical, or that the
service will not package or keep deploying without: removing an absorbed
plugin, pinning `frameworkVersion`, current-schema syntax. It also covers
restoring what the config declares but v3 and later no longer apply in its old form
(`usagePlan`/`apiKeys` under `provider`, `awsKmsKeyArn`, plugin-era
per-function IAM): confirm with the user first, then explain the hunks it
adds.

OPPORTUNITY = anything that changes what deploys or how it behaves: a one-line
config change (`architecture`, `BillingMode`) as much as a code rewrite.
Report it; never apply it silently inside an upgrade. Approval is a yes
to a named change; a broad mandate ("make it modern", "whatever it takes") or
a cost complaint is not. These are the tempting
"improvements" that are really new decisions:

- **API product switches** — `http` (REST API) to `httpApi` (HTTP API, payload
  v2) is a different gateway with different request/response shapes.
- **Resource renames** — a renamed queue, table, or bucket is a _replacement_ on
  deploy: the old resource is deleted.
- **Billing-mode changes** — e.g. DynamoDB `ProvisionedThroughput` to
  `PAY_PER_REQUEST`.
- **Error/failure semantics** — removing a catch-all handler, adding a DLQ or
  RedrivePolicy, changing an ID format (`uuid1` to `uuid4`).
- **Architecture/runtime swaps** — adding `arm64`, moving to a newer runtime
  version. A deprecated or end-of-life runtime goes first in the report, with
  AWS's dates. It stays an opportunity even when AWS already blocks function
  updates on it, but then the next deploy fails until the user approves the
  move: say so prominently at the top of the report (modern-config.md).
- **Code rewrites** — CommonJS to ESM, adding TypeScript, restructuring or
  reformatting handlers. Handler code stays as it is unless a MUST-FIX change
  requires an edit.

A good idea belongs in the report, not in the diff.

## Detection checklist (MUST-FIX)

- **Absorbed plugin still listed** — entry in `plugins:` matching an absorbed plugin. Fix in plugin-replacements.md.
- **`service:` object form** — `service:` with a nested `name:`. Fix in modern-config.md.
- **No `frameworkVersion`, or a pin that excludes v4** — top-level key absent, or a pre-4 value. Fix in modern-config.md.
- **v3 `params:` block** — top-level `params:`. Fix in modern-config.md.
- **v2 `provider.iamRoleStatements`** — that key under `provider`. Fix in modern-config.md.
- **Legacy property aliases** — `lambdaHashingVersion`, `provider.role`, `cfnRole`, `iamManagedPolicies`, `rolePermissionsBoundary`, `awsKmsKeyArn`, or top-level `console:` present. Fix in modern-config.md; confirm `awsKmsKeyArn` and `lambdaHashingVersion: '20200924'` first.
- **v1 API Gateway keys** — `usagePlan` or `apiKeys` directly under `provider`. Fix in modern-config.md; confirm first.
- **Implicit runtime or region** — `runtime:` or `region:` absent. Fix in modern-config.md.
- **Stage fallback idiom** — `${opt:stage, self:provider.stage}` in a config without `provider.stage` (with it, an opportunity). Fix in modern-config.md.
- **Plugin-era per-function IAM fields** — `iamRoleStatements` and related fields on functions. Fix in modern-config.md; confirm first when they were inactive.
- **`package.exclude` / `package.include`** — either key under `package:`. Fix in modern-config.md.
- **`useDotenv: true` or dotenv plugin** — either present. Fix in upgrading-from-v3.md.
- **A local `serverless` below v4** — `npm ls serverless` lists a v1–v3 copy, from `package.json` or from a plugin's peer dependency. Fix in upgrading-from-v3.md.

## Opportunities (REPORT ONLY)

- **Deprecated or EOL runtime** — `runtime:` set to a version AWS has deprecated or scheduled for end of life; report it first, with AWS's dates, and flag it as blocking the next deploy once AWS blocks function updates; how to move: modern-config.md.
- **Native per-function IAM `iam.role.mode: perFunction`** — when it helps: wants per-function least privilege; docs: `providers/aws/guide/iam`.
- **`serverless diff` before deploy** — when it helps: CI preview of stack changes; docs: `providers/aws/cli-reference/diff`.
- **`serverless dev` live event routing** — when it helps: `serverless-offline` / `serverless-dynamodb` local loops; docs: `providers/aws/cli-reference/dev`.
- **Built-in alerts / domains / prune** — when it helps: replacing hand-rolled CloudWatch alarms or manual pruning; docs: `providers/aws/guide/alerts`, `providers/aws/guide/domains`, `providers/aws/guide/prune`.
- **Variable resolvers (`${ssm:}`, `${terraform:}`, `${vault:}`, `${doppler:}`, `${git:}`, `${aws:partition}`)** — when it helps: replacing secret-fetch scripts or hardcoded partition/account ARNs; docs: `guides/variables`.
- **Named resolver providers + `provider.resolver`** — when it helps: multi-account deploys without `AWS_PROFILE` switching; docs: `providers/aws/guide/credentials`.
- **`uv` installer for Python requirements** — when it helps: faster, repeatable Python installs; docs: `providers/aws/guide/python`.
- **Isolated / ephemeral compute (Sandboxes)** — when it helps: untrusted or per-session workloads; use the `serverless-sandboxes` skill.

## When NOT to use this skill

- Authoring a brand-new service — there is no legacy config to preserve.
- SAM- or CloudFormation-only projects without a `serverless.yml`.
- Adding or changing a feature on a v4 service — the `serverless-framework`
  skill.
