# Verification: the CloudFormation equivalence gate

## Contents

- Before (snapshot the original)
- After (snapshot the modified config)
- Normalize, then diff
- Compare what the zips contain, too
- Against the deployed stack
- The way the project runs it
- Benign diff classes (normalized away)
- Output noise that is not a service finding
- No baseline (original cannot package)
- Between edits

The equivalence gate proves your changes did not alter what deploys. Package the
config before and after your edits, normalize away the known-nondeterministic
fields, and diff. An empty normalized diff means the change is safe. Any
surviving hunk is a genuine behavioral change — stop and either revert it or
explain it to the user. Never hand-wave a surviving hunk.

## Before (snapshot the original)

Run from the service directory, into a throwaway folder outside it:
everything inside the service directory is packaged into the next build,
snapshots included.

```bash
serverless package --package ../.sls-equivalence/pkg-before
```

The template to compare is
`../.sls-equivalence/pkg-before/cloudformation-template-update-stack.json`.
Delete `../.sls-equivalence` when the migration is done.

If the original config declares third-party plugins, install dependencies
first (`npm install`) — the CLI cannot load undeclared plugins, and a
"plugin not found" packaging error is NOT the no-baseline case. Install and
retry before concluding no baseline is possible.

## After (snapshot the modified config)

```bash
serverless package --package ../.sls-equivalence/pkg-after
```

## Normalize, then diff

Several template fields change every packaging run even for byte-identical
source. Normalize both templates before comparing (requires `jq` ≥ 1.6 for
`walk`, and `sed -E` — GNU or BSD both work):

```bash
normalize() {
  jq -S 'walk(if type=="object" then
      (if has("S3Key") then .S3Key="NORMALIZED" else . end)
      | (if has("CodeSha256") then .CodeSha256="NORMALIZED" else . end)
    else . end)' "$1" \
  | sed -E \
      -e 's/([A-Za-z]+)Version[A-Za-z0-9]{15,}/\1VersionNORMALIZED/g' \
      -e 's/ApiGatewayDeployment[0-9]{10,}/ApiGatewayDeploymentNORMALIZED/g' \
  | jq -S '.'
}
normalize ../.sls-equivalence/pkg-before/cloudformation-template-update-stack.json > ../.sls-equivalence/before.json
normalize ../.sls-equivalence/pkg-after/cloudformation-template-update-stack.json  > ../.sls-equivalence/after.json
diff -u ../.sls-equivalence/before.json ../.sls-equivalence/after.json && echo EQUIVALENT
```

## Compare what the zips contain, too

The template diff cannot see files inside the deployment artifacts: a file
that starts or stops being packaged (a `.env` file, dev dependencies, the
snapshots themselves) leaves the template unchanged. List both sides and
diff them:

```bash
for side in before after; do
  for zip in ../.sls-equivalence/pkg-$side/*.zip; do unzip -Z1 "$zip"; done | sort > ../.sls-equivalence/$side.files
done
diff -u ../.sls-equivalence/before.files ../.sls-equivalence/after.files && echo SAME-FILES
```

A file that appears only in `after` is packaged by the upgraded config:
confirm it belongs in the function before going on. One case is expected:
after moving to the built-in bundler, every zip gains a generated
`package.json` and the project's lockfile, which the bundler always ships
beside the bundle.

## Against the deployed stack

When the service is already deployed, finish with the live stack as the
baseline: `serverless diff --stage <stage>` shows what the next deploy would
change there. Expect only code and version hunks plus the changes you made
on purpose. Anything else is drift between the deployed stack and the
original config: stop and report it before deploying.

## The way the project runs it

A shell command runs the global v4, while the project's npm scripts run the
copy in its `node_modules`. After the upgrade:

- `npm ls serverless` lists no copy below 4 (upgrading-from-v3.md, "A local
  `serverless` install");
- the project's npm scripts that call `serverless` (`npm start` and the like)
  still work. Stop any long-running one when it answers.

## Benign diff classes (normalized away)

| Field                                                   | Why it always differs                                                                                                                      | Applies   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| `S3Key`                                                 | embeds a fresh packaging timestamp/hash each run                                                                                           | every run |
| `CodeSha256`                                            | hash of the deployment zip, which embeds file timestamps                                                                                   | every run |
| `AWS::Lambda::Version` logical ID (`<Fn>Version<hash>`) | hash suffix derived from packaging-run data; also appears as `Ref` in Outputs and `DependsOn`, so it must be replaced everywhere it occurs | every run |
| `ApiGatewayDeployment<unix-ms>` logical ID              | a `Date.now()` timestamp baked into the logical ID                                                                                         | every run |

Two special cases where a surviving hunk is expected and legitimate — call each
out to the user rather than treating the diff as a failure:

- **Build-plugin removal.** Removing `serverless-esbuild` /
  `serverless-webpack` / `serverless-plugin-typescript` / `serverless-bundle`
  switches to the built-in bundler (with `runtime:` pinned, and
  `build.esbuild` set for JavaScript handlers) and produces a _different
  bundle_, so the Lambda `Version`
  logical ID and `CodeSha256` diffs above appear. The built-in bundler also
  injects `NODE_OPTIONS=--enable-source-maps` into function environments by
  default — set `build.esbuild.sourcemap: false` for strict equivalence (see
  plugin-replacements.md). Beyond that, confirm nothing _else_ changed — if
  any non-code resource (functions, events, IAM, tables, queues) differs,
  that is a real change to investigate.
- **Confirmed IAM changes.** Migrating plugin-era per-function IAM fields, or
  activating statements that were previously inactive (see modern-config.md),
  adds or moves IAM roles and policies — IAM entries in the diff are then the
  intended result. Verify the IAM hunks match the intent the user confirmed
  and that nothing beyond IAM changed. Note: statements a v4 upgrade activates
  natively appear in _both_ snapshots, so include them in the report rather
  than relying on the diff to surface them.

## Output noise that is not a service finding

Packaging output can include a Node `DEP0169` deprecation warning
(`url.parse() behavior is not standardized…`). It comes from the CLI's
default AWS client path, not from the service being migrated — setting
`SLS_AWS_SDK=3` opts the CLI into its AWS SDK v3 client and the warning
disappears. Mention it to the user with that remedy if they ask; never
attribute it to the config.

## No baseline (original cannot package)

Legacy services often will not package with their original toolchain — old
bundlers can be incompatible with modern Node/OpenSSL, dated native
dependencies may not build, or required credentials and remote resources may
be unavailable. (Note: an EOL runtime is NOT such a blocker — packaging
proceeds, with a warning for each runtime AWS has already deprecated; a
scheduled deprecation is caught only by the audit against AWS's schedule.)

If the ONLY blocker is the old pin (the v4 CLI refuses a `frameworkVersion`
that excludes v4), take the "Before" snapshot with only `frameworkVersion`
changed to a v4 range, and keep every other line original. That pin change
is then the one known difference between the snapshots. If
`devDependencies` list `serverless` v1–v3, remove it for the snapshot as
well: the CLI otherwise runs that local copy, which refuses the v4 pin
(upgrading-from-v3.md, "A local `serverless` install").

Before giving up on a baseline, try the stronger option: if the ONLY reason the
original config cannot package is the build-plugin conflict (`... conflicts
with the plugin 'serverless-webpack'`), take the "Before" snapshot from the
otherwise-original config with `build:\n  esbuild: false` added — the
supported opt-out, for the snapshot only: the After config removes the plugin
and uses the built-in bundler (plugin-replacements.md). That yields a genuine
template baseline and a real diff. Only fall back to review-only when packaging is blocked by something
deeper: an incompatible toolchain, unresolvable variables, or missing
credentials required by a plugin.

When no "Before" package is possible at all:

1. Capture the failure output **verbatim** and record it.
2. Tell the user there is no before-baseline, so a byte-for-byte equivalence
   diff is not possible for this service.
3. Fall back to a weaker but explicit bar: the **after** config packages
   cleanly, and you review the generated template against the intended
   behavior. Report exactly which changes were made and that they could not be
   diffed against a baseline.

Do not silently treat "it packages now" as equivalence — an unbaselined service
is a flagged result, not a green one.

## Between edits

`serverless print` resolves and prints the effective config (variables, stages,
merged blocks) without packaging. Use it as a fast sanity check after each edit;
use the full package + diff for the actual equivalence proof.

The CLI also surfaces its own deprecation, deprecated-runtime, and
plugin-absorption warnings at package time (e.g. the python-requirements
notice). You only see them by running
the CLI — another reason this verification step is mandatory, not optional.
