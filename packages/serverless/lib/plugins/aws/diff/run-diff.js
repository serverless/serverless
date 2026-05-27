import { readFile } from 'fs/promises'
import path from 'path'
import chalk from 'chalk'
import cfDiff from '@aws-cdk/cloudformation-diff'
import { writeText } from '@serverless/util'
import normalizeFiles from '../lib/normalize-files.js'
import { hashFile } from '../lib/hash-file.js'
import { resolveFunctionArtifactPaths } from '../lib/get-function-artifact-paths.js'
import ServerlessError from '../../../serverless-error.js'

const { diffTemplate, Formatter } = cfDiff

// NOTE: We intentionally do NOT cap concurrency around `provider.request`
// calls here. The shared request layer (`lib/aws/request-queue.js`) already
// caps every AWS call across the entire framework at concurrency 2 — adding
// another `pLimit` layer would be redundant and misleading.

/**
 * Mixin module that performs the actual diff. Exposed via `Object.assign` on
 * the AwsPackageDiff plugin so `this` is the plugin instance.
 */
export default {
  /**
   * Load the locally-packaged template, fetch the deployed template, compute
   * the diff, and render it (text by default, JSON when `--json` is set).
   *
   * Two orthogonal signals are surfaced:
   *   1. Per-function code changes — computed by hashing local zips and
   *      comparing to each Lambda's CodeSha256 in AWS. This is the framework's
   *      own definition of "did code change" (see check-for-changes.js for
   *      the analogous deploy-side check).
   *   2. Structured CloudFormation template diff — rendered after applying
   *      the same normalization the framework uses internally, so the diff
   *      output is free of S3Key timestamp churn and other artifact-routing
   *      noise the framework already considers meaningless.
   */
  async runDiff() {
    const [newTemplate, oldTemplate] = await Promise.all([
      this._loadLocalTemplate(),
      this._fetchDeployedTemplate(),
    ])

    const codeChanges = await this._detectCodeChanges(oldTemplate)

    const diff = diffTemplate(
      normalizeForDiff(oldTemplate),
      normalizeForDiff(newTemplate),
    )
    const summary = summarizeChanges(diff)

    // The package lifecycle's "Packaging" spinner is still active when our
    // `after:package:finalize` hook fires. Stop it before writing structured
    // output to stdout, otherwise the spinner overlays the first line of the
    // diff (or interleaves with `--json` payloads on TTY consumers piping to
    // `jq`).
    this.progress.remove()

    if (this.options.json) {
      writeText(
        JSON.stringify(buildJsonReport(diff, summary, codeChanges), null, 2),
      )
      return
    }

    this._renderCodeChangeSummary(codeChanges)

    if (diff.isEmpty) {
      this.log.notice('No infrastructure changes against the deployed stack')
      return
    }

    renderDiff(process.stdout, diff)
    this.log.notice(
      `Resources: ${summary.create} to create, ${summary.update} to update, ${summary.remove} to remove`,
    )
  },

  /**
   * Read the freshly-packaged CloudFormation template from disk. Resolves
   * the package directory the same way `AwsPackage` does: explicit
   * `--package` flag → `service.package.path` from serverless.yml →
   * `<serviceDir>/.serverless` default.
   */
  async _loadLocalTemplate() {
    const templateFile = path.join(
      this._resolvePackageDir(),
      this.provider.naming.getCompiledTemplateFileName(),
    )

    try {
      const contents = await readFile(templateFile, 'utf8')
      return JSON.parse(contents)
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new ServerlessError(
          `Packaged CloudFormation template not found at ${templateFile}. ` +
            'Run `serverless package` first, or pass `--package <path>` ' +
            'to point at an existing package directory.',
          'DIFF_TEMPLATE_NOT_FOUND',
        )
      }
      throw new ServerlessError(
        `Failed to read packaged template ${templateFile}: ${err.message}`,
        'DIFF_TEMPLATE_READ_FAILED',
      )
    }
  },

  /**
   * Fetch the currently-deployed CloudFormation template. Returns an empty
   * object when the stack does not exist yet (so the diff shows "everything
   * is new" instead of erroring).
   */
  async _fetchDeployedTemplate() {
    const stackName = this.provider.naming.getStackName()
    try {
      const response = await this.provider.request(
        'CloudFormation',
        'getTemplate',
        { StackName: stackName, TemplateStage: 'Processed' },
      )
      return JSON.parse(response.TemplateBody)
    } catch (err) {
      if (isStackNotFoundError(err)) {
        this.log.notice(
          `Stack "${stackName}" does not exist yet — treating all resources as new.`,
        )
        return {}
      }
      throw new ServerlessError(
        `Failed to fetch deployed template for stack "${stackName}": ${err.message}`,
        'DIFF_GET_TEMPLATE_FAILED',
      )
    }
  },

  /**
   * Compare every function's local zip hash against its deployed Lambda's
   * CodeSha256. Returns an array of `{ funcName, status }` where `status` is
   * one of:
   *   - `'new'`: function exists locally but not in the deployed stack OR
   *      the deployed Lambda is absent at AWS (e.g. forced replacement via
   *      `name:` change)
   *   - `'changed'`: local zip hash differs from the deployed Lambda's CodeSha256
   *   - `'unchanged'`: hashes match
   *   - `'image'`: container-image function (no zip to hash)
   *   - `'disabled'`: `package.disable: true` — packaging is skipped, so we
   *      have nothing to compare; included for completeness so the function
   *      isn't silently dropped
   *
   * Both `'image'` and `'disabled'` are excluded from the rendered summary
   * and the JSON `code` field — they're neither "code changes" nor signals
   * worth showing in a diff. Surfacing them in the returned array still lets
   * future callers introspect them if needed.
   *
   * If the deployed Lambda's `CodeSha256` can't be read for an unexpected
   * reason (permission denied, malformed response, transient AWS error), the
   * entire diff fails fast with `DIFF_FUNCTION_CODE_VERIFICATION_FAILED`.
   * Partial-state results don't help CI workflows that need a clear
   * pass/fail signal. `ResourceNotFoundException` is the documented benign
   * case and is mapped to `'new'` instead.
   */
  async _detectCodeChanges(deployedTemplate) {
    const functionNames = this.serverless.service.getAllFunctions()
    if (functionNames.length === 0) return []

    const deployedLambdaLogicalIds = new Set(
      Object.entries(deployedTemplate.Resources || {})
        .filter(([, r]) => r.Type === 'AWS::Lambda::Function')
        .map(([id]) => id),
    )

    // Resolve artifact paths once using the shared helper. This honors every
    // packaging shape the framework supports (per-function `package.artifact`,
    // service-level `package.artifact`, `service.artifact`, individual
    // packaging, default shared zip) — matching what `deploy` uploads.
    // Functions with `image` are omitted from the map by the helper.
    const artifactPaths = await resolveFunctionArtifactPaths(
      this.serverless,
      this._resolvePackageDir(),
    )

    // Hash each unique zip path exactly once. Under default packaging all
    // functions share a single zip; without this dedup we'd hash a (potentially
    // hundreds-of-MB) file once per function.
    //
    // Exclude paths that belong only to `package.disable: true` functions —
    // under `individually: true` their per-function zip is never written to
    // disk, so hashing it would throw ENOENT and abort the whole diff before
    // we ever reach the per-function disable guard below.
    const isDisabled = (name) => {
      const fn = this.serverless.service.getFunction(name)
      return Boolean(fn.package && fn.package.disable)
    }
    const hashablePaths = new Set()
    for (const [funcName, zipPath] of artifactPaths) {
      if (!isDisabled(funcName)) hashablePaths.add(zipPath)
    }
    const zipHashByPath = new Map(
      await Promise.all(
        Array.from(hashablePaths, async (p) => [p, await hashFile(p)]),
      ),
    )

    // No `pLimit` here — `provider.request` is internally serialized by the
    // framework's shared `requestQueue` (concurrency 2). The actual
    // outbound AWS rate is the same whether we Promise.all over 10 or 1000
    // functions; adding another bound here would just be misleading noise.
    return Promise.all(
      functionNames.map(async (funcName) => {
        const funcObj = this.serverless.service.getFunction(funcName)
        if (funcObj.image) return { funcName, status: 'image' }
        // `package.disable: true` opts a function out of packaging entirely
        // — its zip won't exist on disk, so attempting to hash it would
        // throw ENOENT. Skip those cleanly.
        if (funcObj.package && funcObj.package.disable) {
          return { funcName, status: 'disabled' }
        }

        const logicalId = this.provider.naming.getLambdaLogicalId(funcName)
        const isNew = !deployedLambdaLogicalIds.has(logicalId)
        if (isNew) return { funcName, status: 'new' }

        const zipPath = artifactPaths.get(funcName)
        if (!zipPath) {
          // Defensive: helper omits image-based functions and we already
          // handled those above. If we get here something unexpected went
          // wrong with artifact resolution — surface it rather than silently
          // mark the function as "we don't know."
          throw new ServerlessError(
            `Could not resolve a package artifact for function "${funcName}". ` +
              'This is unexpected — please file an issue.',
            'DIFF_ARTIFACT_NOT_RESOLVED',
          )
        }

        const localHash = zipHashByPath.get(zipPath)
        const remoteHash = await this._getRemoteCodeSha(funcObj.name)
        // A null remoteHash means the resolved Lambda name doesn't exist at
        // AWS yet. The logical id is already in the deployed CFN template
        // (otherwise we would have short-circuited above as `status: 'new'`),
        // so this is a function-rename or otherwise replacement-forcing
        // change: the existing physical Lambda is being destroyed and a new
        // one created under a new name. Surface the code as new — the
        // template diff will show the matching [-] destroy / [+] create on
        // the function resource.
        if (remoteHash === null) return { funcName, status: 'new' }
        return {
          funcName,
          status: localHash === remoteHash ? 'unchanged' : 'changed',
        }
      }),
    )
  },

  /**
   * Look up the deployed Lambda's CodeSha256.
   *
   * Returns `null` when the function is absent at AWS — typically because the
   * resolved name is being introduced for the first time by this change
   * (forced replacement via `name:`, or a function deleted out-of-band from
   * a stack that still references it). The caller classifies that as new
   * code.
   *
   * Throws `DIFF_FUNCTION_CODE_VERIFICATION_FAILED` for every other failure
   * mode (missing IAM permission, malformed response, transient AWS error)
   * — the diff command is meant to produce a definite answer, so partial-
   * failure states fail fast rather than silently degrade.
   */
  async _getRemoteCodeSha(awsFunctionName) {
    let res
    try {
      res = await this.provider.request('Lambda', 'getFunction', {
        FunctionName: awsFunctionName,
      })
    } catch (err) {
      // `ResourceNotFoundException` is the normal way AWS signals "this
      // function doesn't exist (yet)". Both SDK v2 and v3 expose the code
      // via `providerError.code` on the framework's wrapped error; fall
      // back to a name-match on the underlying error for safety.
      const code = err.providerError?.code || err.code || err.name
      if (code === 'ResourceNotFoundException') return null
      throw new ServerlessError(
        `Failed to verify code for function "${awsFunctionName}": ${err.message}`,
        'DIFF_FUNCTION_CODE_VERIFICATION_FAILED',
      )
    }
    const codeSha = res.Configuration && res.Configuration.CodeSha256
    if (!codeSha) {
      // AWS always populates CodeSha256 for deployed Lambdas — a missing value
      // would mean the response shape changed or the function is in an
      // unexpected state. Fail fast rather than mis-report "changed".
      throw new ServerlessError(
        `Failed to verify code for function "${awsFunctionName}": ` +
          'CodeSha256 missing from Lambda:getFunction response.',
        'DIFF_FUNCTION_CODE_VERIFICATION_FAILED',
      )
    }
    return codeSha
  },

  /**
   * Render the per-function code-change section above the structured template
   * diff. Mirrors the section style used by `@aws-cdk/cloudformation-diff`
   * (bold/underlined header + colored `[+]` / `[~]` / `[?]` markers) so the
   * Code section reads as a peer of `Resources`, `Outputs`, etc.
   *
   * Silent when the service has no zip-backed functions to compare. Emits a
   * one-line "No code changes" notice when functions exist but none changed.
   */
  _renderCodeChangeSummary(codeChanges) {
    if (!codeChanges.length) return

    // Build entries with colored markers matching the diff library's palette:
    // green for additions, yellow for modifications.
    const entries = []
    for (const c of codeChanges) {
      // `image`, `disabled`, and `unchanged` are not signals worth surfacing.
      if (
        c.status === 'image' ||
        c.status === 'disabled' ||
        c.status === 'unchanged'
      )
        continue
      if (c.status === 'new') {
        entries.push({ order: 0, line: `${chalk.green('[+]')} ${c.funcName}` })
      } else if (c.status === 'changed') {
        entries.push({ order: 1, line: `${chalk.yellow('[~]')} ${c.funcName}` })
      }
    }

    if (!entries.length) {
      this.log.notice('No function code changes')
      return
    }

    // Sort additions first, then modifications — matches the ordering
    // convention of the resource diff (creates before updates before removes)
    // and keeps output stable across runs.
    entries.sort((a, b) => a.order - b.order)

    // Use the diff library's Formatter so the Code section header is styled
    // identically to Resources / Outputs / IAM Statement Changes / etc.
    const formatter = new Formatter(process.stdout, {})
    formatter.printSectionHeader('Function Code')
    for (const entry of entries) {
      formatter.print(entry.line)
    }
    formatter.printSectionFooter()
  },

  _resolvePackageDir() {
    return (
      this.options.package ||
      this.serverless.service.package.path ||
      path.join(this.serverless.serviceDir || '.', '.serverless')
    )
  },
}

/**
 * Apply the same normalization the framework uses internally when deciding
 * whether a deploy is necessary (see `lib/plugins/aws/lib/normalize-files.js`
 * and its caller `deploy/lib/check-for-changes.js`). This blanks Lambda
 * `Code.S3Key` and Layer `Content.S3Key` so timestamp-only artifact-key
 * churn — which the framework already considers meaningless — doesn't
 * pollute the diff output. Real code changes are surfaced separately via
 * the per-function CodeSha256 check above.
 *
 * Templates can legitimately be empty (e.g., when the stack does not exist
 * yet). The shared normalizer requires `Resources` to be defined, so we
 * coerce an empty template into a no-op shape first.
 */
export function normalizeForDiff(template) {
  if (!template || !template.Resources) return template
  return normalizeFiles.normalizeCloudFormationTemplate(template)
}

/**
 * Render the CloudFormation diff to the given stream.
 *
 * Mirrors the upstream `formatDifferences()` from `@aws-cdk/cloudformation-diff`
 * but omits a trailing advisory line the upstream library appends after the
 * security section, since that line links to an external tracker.
 *
 * A drift-detection test (`run-diff.test.js`) asserts this function stays in
 * sync with upstream by comparing both outputs against a TemplateDiff that
 * exercises every section the upstream formatter renders. If a dep bump
 * adds or renames a section, that test fails and signals an update is needed.
 */
export function renderDiff(stream, templateDiff) {
  const formatter = new Formatter(stream, {}, templateDiff)

  if (
    templateDiff.awsTemplateFormatVersion ||
    templateDiff.transform ||
    templateDiff.description
  ) {
    formatter.printSectionHeader('Template')
    formatter.formatDifference(
      'AWSTemplateFormatVersion',
      'AWSTemplateFormatVersion',
      templateDiff.awsTemplateFormatVersion,
    )
    formatter.formatDifference('Transform', 'Transform', templateDiff.transform)
    formatter.formatDifference(
      'Description',
      'Description',
      templateDiff.description,
    )
    formatter.printSectionFooter()
  }

  // Security section — keep the IAM and security-group tables (genuinely
  // useful for review) but skip the trailing tracker-link advisory.
  if (
    templateDiff.iamChanges.hasChanges ||
    templateDiff.securityGroupChanges.hasChanges
  ) {
    formatter.formatIamChanges(templateDiff.iamChanges)
    formatter.formatSecurityGroupChanges(templateDiff.securityGroupChanges)
    formatter.printSectionFooter()
  }

  // For sections whose values are objects (Parameters, Metadata, Mappings,
  // Conditions, Outputs), the upstream default renderer dumps the entire
  // before/after JSON onto a single line. That's unreadable in practice —
  // especially for Outputs, where a single Lambda Version Ref change drags
  // the whole Output blob across the screen twice. Render those entries as
  // a tree-style diff instead, matching how the Resources section already
  // surfaces property-level changes.
  const treeFormatter = nestedSectionFormatter(formatter)
  formatter.formatSection(
    'Parameters',
    'Parameter',
    templateDiff.parameters,
    treeFormatter,
  )
  formatter.formatSection(
    'Metadata',
    'Metadata',
    templateDiff.metadata,
    treeFormatter,
  )
  formatter.formatSection(
    'Mappings',
    'Mapping',
    templateDiff.mappings,
    treeFormatter,
  )
  formatter.formatSection(
    'Conditions',
    'Condition',
    templateDiff.conditions,
    treeFormatter,
  )
  formatter.formatSection(
    'Resources',
    'Resource',
    templateDiff.resources,
    formatter.formatResourceDifference.bind(formatter),
  )
  formatter.formatSection(
    'Outputs',
    'Output',
    templateDiff.outputs,
    treeFormatter,
  )
  formatter.formatSection('Other Changes', 'Unknown', templateDiff.unknown)
}

/**
 * Build an entry formatter that renders the diff of an object-valued entry
 * (e.g., an Output) as a tree, instead of the upstream default's single-line
 * "OLD_JSON to NEW_JSON" dump.
 *
 * The header line ("`[~] Output Foo`") mirrors the upstream formatter's
 * style — same prefix, type, and logical-id treatment — so the section
 * stays visually consistent with everything else the diff renders.
 *
 * For modifications, the recursive walk down to changed leaves is delegated
 * to the diff library's `formatObjectDiff` (the same engine that powers
 * property-level diffs in the Resources section). Pure additions and
 * removals show only the header — the value blob isn't tree-friendly when
 * there's nothing to compare against, and the structured `--json` output
 * is the right place to inspect full values.
 */
function nestedSectionFormatter(formatter) {
  return (type, logicalId, diff) => {
    if (!diff || !diff.isDifferent) return
    formatter.print(
      `${formatter.formatPrefix(diff)} ${chalk.cyan(type)} ${formatter.formatLogicalId(logicalId)}`,
    )
    if (diff.isUpdate) {
      formatter.formatObjectDiff(diff.oldValue, diff.newValue, '')
    }
  }
}

/**
 * Bucket resource changes from a TemplateDiff into create/update/remove counts.
 * Matches the same algorithm used by the upstream serverless-diff-plugin fork
 * but stays in plain JS without the provider abstraction.
 */
function summarizeChanges(diff) {
  const summary = { create: 0, update: 0, remove: 0 }
  for (const change of Object.values(diff.resources.changes)) {
    if (change.isAddition) summary.create += 1
    else if (change.isRemoval) summary.remove += 1
    else summary.update += 1
  }
  return summary
}

/**
 * Shape the diff into a stable JSON payload for `--json` consumers. The
 * upstream diff types are class instances and don't serialize cleanly, so we
 * project only the fields a CI pipeline is likely to need.
 */
function buildJsonReport(diff, summary, codeChanges) {
  // Only actionable signals are surfaced: which functions' code is new and
  // which has changed. Unchanged/image/disabled functions are derivable by
  // the consumer (anything in `getAllFunctions()` and not in either array),
  // so they aren't repeated here.
  const code = { changed: [], new: [] }
  for (const c of codeChanges) {
    if (c.status === 'changed' || c.status === 'new') {
      code[c.status].push(c.funcName)
    }
  }
  return {
    code,
    summary,
    resources: Object.entries(diff.resources.changes).map(
      ([logicalId, change]) => ({
        logicalId,
        changeType: change.isAddition
          ? 'create'
          : change.isRemoval
            ? 'remove'
            : 'update',
        resourceType: change.newResourceType || change.oldResourceType || null,
      }),
    ),
  }
}

/**
 * Get the underlying AWS error class name in a way that's robust to the
 * framework's error wrapping.
 *
 * The framework's `provider.request` wraps AWS SDK errors in a `ServerlessError`
 * and preserves the original on `err.providerError`. So `err.name` is the
 * wrapper's class (`'ServerlessError'`), NOT the inner AWS class
 * (`'ValidationError'`, `'ResourceNotFoundException'`, etc.). This helper
 * unwraps that — preferring the inner class when present, falling back to the
 * direct class for raw SDK errors (when something bypassed the wrapper).
 *
 * Returns `null` when no class info is available.
 */
export function getEffectiveErrorClass(err) {
  if (!err) return null
  return (
    err.providerError?.name ||
    err.providerError?.code ||
    err.name ||
    err.code ||
    null
  )
}

/**
 * AWS CloudFormation reports a missing stack via a `ValidationError` whose
 * message has the canonical form `Stack with id <name> does not exist`. We
 * match BOTH the canonical phrasing AND (when the underlying error class is
 * available) verify it really is a ValidationError — so unrelated errors that
 * happen to mention "does not exist" don't get silently swallowed.
 */
export function isStackNotFoundError(err) {
  if (!err) return false
  if (!/Stack with id .* does not exist/i.test(err.message || '')) return false
  const cls = getEffectiveErrorClass(err)
  if (!cls) return true // No class info — trust the canonical-phrasing match.
  return cls === 'ValidationError' || cls === 'ValidationException'
}
