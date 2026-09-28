# Plugins absorbed into the Framework

## Contents

- Keep in mind
- serverless-esbuild / serverless-webpack / serverless-plugin-typescript
- serverless-python-requirements
- serverless-apigateway-service-proxy
- serverless-prune-plugin
- serverless-appsync-plugin
- serverless-domain-manager
- serverless-iam-roles-per-function
- serverless-plugin-aws-alerts
- serverless-dotenv-plugin
- serverless-plugin-git-variables
- Not absorbed, but replaced by a native feature (report first)

Each plugin below now ships inside Serverless Framework v4. Upgrading means:
**delete the plugin from `plugins:` and from `package.json`** — the built-in
equivalent takes over. Config keys stay backward-compatible unless a section
says otherwise.

## Keep in mind

1. **Some built-ins activate on a `custom.*` key — keep that key, delete only
   the plugin.** `python-requirements`, `apigateway-service-proxy`, and `prune`
   read the same `custom.pythonRequirements` / `custom.apiGatewayServiceProxies`
   / `custom.prune` blocks their plugins used. Deleting the plugin _and_ its
   config disables the feature. Delete the plugin entry only, and add
   `custom.pythonRequirements: {}` when the service has no such block.
2. **Build plugins and the built-in bundler are mutually exclusive.** With a
   build plugin listed, packaging stops with
   `... conflicts with the plugin 'serverless-webpack'`; the build-plugin
   section below covers the change.

Build system docs: `serverless agent docs providers/aws/guide/building`

---

## serverless-esbuild / serverless-webpack / serverless-plugin-typescript

- **Detect:** any of these strings in `plugins:`, or `serverless-bundle`,
  which the built-in bundler replaces the same way. (Other bundling-era
  plugins still run in v4: see the section "Not absorbed, but replaced by a
  native feature (report first)" below.)
- **Change:** remove the plugin from `plugins:` and `package.json`. Pin
  `runtime:` first, or in the same edit: the built-in bundler builds only
  functions whose own or provider `runtime:` is an explicit `nodejs*` value
  (modern-config.md, "Pin implicit `runtime:` and `region:`"). TypeScript
  handlers (`.ts`, `.cts`, `.mts`, `.tsx`) then build with zero config; point
  `handler` straight at the `.ts` file. JavaScript handlers build when
  `build.esbuild` is set: move any custom bundler options (externals,
  excludes, sourcemaps, plugin list) under `build.esbuild`, which also turns
  it on, or add `build: { esbuild: {} }` when there are none to port. Delete
  config that only existed for the old plugin (`custom.esbuild`,
  `custom.webpack`, `webpack.config.js`, `tsconfig`-driven precompile steps)
  once ported.
- **Since:** 4.0.
- **Keep in mind — source maps on by default:** the built-in bundler enables
  source maps and adds `NODE_OPTIONS=--enable-source-maps` to every function's
  environment; typical `serverless-esbuild` configs did not. After migration
  this shows up in the template diff as a new environment variable. For strict
  equivalence set `build.esbuild.sourcemap: false` and report enabling source
  maps as an opportunity; otherwise explain the hunk to the user.
- **Keep in mind — minification:** a webpack production build minifies; the
  built-in bundler leaves code unminified by default. Set
  `build.esbuild.minify: true` to keep the old bundle size.
- **Verify:** the bundle changes, so `AWS::Lambda::Version` logical IDs and
  `CodeSha256` legitimately differ. No other resources should change (except
  the source-map env var above if you left the default on). If a zip holds
  unbundled source plus `node_modules` rather than a bundle, the function was
  not built: check its runtime pin and `build.esbuild`. If the user
  insists on keeping the old plugin, add `build:\n  esbuild: false`
  instead of deleting it.

## serverless-python-requirements

- **Detect:** `serverless-python-requirements` in `plugins:`.
- **Change:** remove the plugin from `plugins:` and `package.json`. **Keep
  `custom.pythonRequirements`, or add `custom.pythonRequirements: {}` if the
  service has none** — the built-in activates when that block is present
  (even `{}`), while the plugin also ran without it. `uv` is supported for
  fast, repeatable installs (an opportunity, not MUST-FIX).
- **Since:** 4.22.0.
- **Keep in mind — plugins that key off this plugin's name:** `serverless-wsgi`
  decides whether to delegate dependency packaging by checking the `plugins:`
  list for the literal string `serverless-python-requirements`, so it is
  unaware of the built-in equivalent. Removing the plugin from a service that
  also uses `serverless-wsgi` switches wsgi into self-packaging mode, which
  expects a local virtualenv and typically stops with "Unable to load
  virtualenv". Set `custom.wsgi.packRequirements: false` so wsgi defers to the
  built-in packager. In general, when removing an absorbed plugin, check the
  remaining plugins for ones that key off its name.
- **Verify:** same dependency bundling, so the template should not change. At
  package time the CLI prints a warning confirming the plugin is now built
  in.
- Docs: `serverless agent docs providers/aws/guide/python`

## serverless-apigateway-service-proxy

- **Detect:** `serverless-apigateway-service-proxy` in `plugins:`.
- **Change:** remove the plugin. **Keep `custom.apiGatewayServiceProxies`** —
  the built-in activates on that key.
- **Since:** 4.24.0.
- **Verify:** proxy resources unchanged; expect an empty diff.
- Docs: `serverless agent docs providers/aws/guide/api-gateway-aws-proxy`

## serverless-prune-plugin

- **Detect:** `serverless-prune-plugin` in `plugins:`.
- **Change:** remove the plugin. **Keep `custom.prune`.** The `serverless prune`
  command is built in.
- **Since:** 4.31.0.
- **Verify:** the plugin only deleted old function versions after deploy — it
  added no stack resources, so the template diff is empty.
- Docs: `serverless agent docs providers/aws/guide/prune`

## serverless-appsync-plugin

- **Detect:** `serverless-appsync-plugin` in `plugins:`.
- **Change:** remove the plugin. What happens to its config depends on the
  plugin version the service used:
  - **A top-level `appSync:` block** (plugin v2): keep it unchanged. The
    built-in reads the same block.
  - **Config under `custom.appSync`** (plugin v1): the built-in reads the
    top-level `appSync:` block, so config left under `custom.appSync` drops
    the API from the template.
    Convert it to the v2 format under a top-level `appSync:` block, following
    the plugin's
    [upgrade guide](https://github.com/sid88in/serverless-appsync-plugin/blob/master/doc/upgrading-from-v1.md)
    (for example `mappingTemplates` becomes `resolvers`, and
    `authenticationType` becomes `authentication.type`). The conversion
    changes deployed resources, so confirm it with the user and pass on the
    guide's caveats: the first deploy rotates AppSync API keys (clients need
    the new ones), a config with several APIs must be split and those APIs
    are replaced, and resolvers default to PIPELINE and JavaScript unless
    their kind is set explicitly.
- **Since:** 4.30.0.
- **Verify:** for a v2 block, expect an empty diff. For a converted v1 config,
  review the diff carefully to confirm the AppSync resources' logical IDs and
  properties match, apart from the API key rotation; for a single API, a
  replaced or missing API means the conversion is not finished.
- Docs: `serverless agent docs providers/aws/guide/appsync`

## serverless-domain-manager

- **Detect:** `serverless-domain-manager` in `plugins:` (its config lives at
  `custom.customDomain`).
- **Change:** remove the plugin. Use the built-in custom-domains config for
  HTTP, REST, and WebSocket APIs — `provider.domain` (a string or an object)
  or `provider.domains` (an array). The shape differs from
  `custom.customDomain`, so port it against the domains guide rather than
  copying keys.
- **Since:** 4.18.0.
- **Keep in mind — `securityPolicy` values:** the enhanced
  `SecurityPolicy_TLS13_*` policies and `accessMode` apply to REST
  (API Gateway V1) endpoints; domains served through API Gateway V2 (HTTP
  API, WebSocket, and REST with a multi-level base path) accept only
  `TLS_1_2`. The legacy lowercase `tls_1_0` / `tls_1_2` values remain
  accepted; there is no lowercase `tls_1_3`.
- **Verify:** both the plugin and the built-in manage the domain and
  base-path mappings at deploy time, outside the packaged template, so an
  empty diff for domain wiring is expected and proves nothing about it —
  confirm the new config resolves with `serverless print`, review it against
  the domains guide, and after the user deploys, check `serverless info`.
- Docs: `serverless agent docs providers/aws/guide/domains`

## serverless-iam-roles-per-function

- **Detect:** `serverless-iam-roles-per-function` in `plugins:`.
- **Change:** remove the plugin. Per-function roles are built in; rename the
  plugin-era fields as modern-config.md describes, and keep
  `custom.serverless-iam-roles-per-function` if present — the built-in reads
  its `defaultInherit` and `iamGlobalPermissionsBoundary`. The default
  (`shared`) mode is the equivalent: like the plugin, it gives a dedicated
  role only to functions that declare statements, and the rest keep the
  shared role. `provider.iam.role.mode: perFunction` gives every function its
  own role and changes the default statement inheritance, so it is an
  opportunity to report.
- **Since:** 4.19.0 (per-function roles) / 4.26.0 (`iam.role.mode: perFunction`).
- **Verify:** role resources may change logical IDs; review the diff.
- Docs: `serverless agent docs providers/aws/guide/iam`

## serverless-plugin-aws-alerts

- **Detect:** `serverless-plugin-aws-alerts` in `plugins:`.
- **Change:** remove the plugin. The same alerts config is built in — **keep
  `custom.alerts`**, the built-in reads the same block.
- **Since:** 4.15.0.
- **Keep in mind — `custom.alerts.stages`:** when set, alarms deploy only to
  the listed stages. Preserve that key as-is, and when verifying make sure the
  stage you package matches one the config deploys alarms to — otherwise the
  diff shows no alarms on either side and proves nothing about them.
- **Verify:** alarm resources unchanged; expect an empty diff.
- Docs: `serverless agent docs providers/aws/guide/alerts`

## serverless-dotenv-plugin

- **Detect:** `serverless-dotenv-plugin` in `plugins:`, or `useDotenv: true`.
- **Change:** remove the plugin. v4 loads `.env` and `.env.<stage>` so that
  `${env:…}` resolves; it adds no variables to function environments. The
  plugin put every variable from its files into every function's
  `environment` (or those in its `include` list), and chose the files by
  `NODE_ENV` or `--env`: `.env`, `.env.local`, `.env.<env>`,
  `.env.<env>.local`. Recreate the variables the functions need under
  `provider.environment` (`FOO: ${env:FOO}`), and load other files through
  `useDotenv` (a path or an array). Removing `useDotenv: true` needs
  `'!.env*'` added to `package.patterns` in the same edit:
  upgrading-from-v3.md, "`.env` is auto-loaded".
- **Since:** 4.0.
- **Verify:** every function's `environment` in the after-template matches
  the before-snapshot, variable for variable.

## serverless-plugin-git-variables

- **Detect:** `serverless-plugin-git-variables` in `plugins:`.
- **Change:** migrate to the native `${git:*}` resolver — remove the plugin
  and replace its substitutions with `${git:sha1|branch|tags|...}`. For the
  full list of `${git:…}` variables, read
  `serverless agent docs guides/variables/git`.
- **Keep in mind — the variable export:** the plugin defaults
  `exportGitVariables: true`, which adds six `GIT_*` environment variables AND
  six git tags to every function without any of them appearing in
  `serverless.yml`. The native `${git:*}` resolvers give git values where you
  reference them rather than exporting them to every function, so removing
  the plugin changes every function's environment and
  tags — the equivalence diff will show it. To preserve behavior exactly,
  recreate the six env vars on `provider.environment` via native resolvers:

  ```yaml
  provider:
    environment:
      GIT_COMMIT_SHORT: ${git:sha1}
      GIT_COMMIT_LONG: ${git:commit}
      GIT_BRANCH: ${git:branch}
      GIT_IS_DIRTY: ${git:isDirty}
      GIT_REPOSITORY: ${git:repository}
      GIT_TAGS: ${git:tags}
  ```

  and apply the six tags per-function (not `provider.tags` — that would also
  tag API Gateway resources the plugin never touched). Alternatively, report
  the dropped export to the user as an intentional cleanup and let them decide.

- **Since:** 4.0 (native `${git:*}` resolver).
- **Verify:** confirm the resolved git values match what the plugin produced,
  and that function environments and tags are unchanged (or the drop was
  explicitly approved).

---

## Not absorbed, but replaced by a native feature (report first)

These plugins still function as external plugins; a native equivalent exists.
Report the migration as an opportunity and apply it only on approval:

- **`serverless-plugin-optimize`, `serverless-babel-plugin`,
  `serverless-plugin-include-dependencies`** → the built-in bundler
  (`build.esbuild`) bundles, transpiles, and resolves dependencies. Moving
  changes every artifact, so the bundle hunks and zip contents change; on
  approval, set `build.esbuild` (JavaScript handlers need it) as the
  build-plugin section above describes.
- **`serverless-apigw-binary`** → `provider.apiGateway.binaryMediaTypes` takes
  the same media-type list. The plugin set the types after deploy through
  the API Gateway API, so the before-template has none and the after-template
  gains `BinaryMediaTypes` on the `AWS::ApiGateway::RestApi`: explain that
  hunk, and check the list against the media types the live API has.
- **`serverless-pseudo-parameters`** → the `${aws:accountId}` /
  `${aws:region}` / `${aws:partition}` resolvers replace the plugin's
  `#{AWS::AccountId}`-style substitutions. The plugin emitted `Fn::Sub`
  expressions; the resolvers put literal values in the template, so each
  replacement shows as an `Fn::Sub` → literal hunk: explain it, and confirm
  the literal is the value the stack resolved.
- **`serverless-offline` / `serverless-dynamodb` (and
  `serverless-dynamodb-local`)** → local-development tooling; `serverless dev`
  covers the live-development loop natively. Not a drop-in for offline HTTP
  emulation — leave the plugins in place and mention `serverless dev` in the
  report. Move serverless-offline to 14 or later, the first major that
  supports v4: 13 declares `serverless ^3` as a peer, so npm installs v3 into
  the project and the project's npm scripts run it (upgrading-from-v3.md, "A
  local `serverless` install"). Check the same for any other plugin that
  stays.
