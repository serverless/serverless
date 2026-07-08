/**
 * Pure builder for the `sandboxes` block of the sfcore.analysis.generated.v1
 * analytics event. Consumed by the sf-core framework runner's
 * getAnalysisEventDetails().
 *
 * Contract (mirrors the platform-core event schema for this field):
 *  - Fixed keys only — never sandbox names, ARNs, paths, patterns, env var
 *    names, or any other user-authored string.
 *  - Explicit-only: a knob is reported only when a sandbox explicitly sets it
 *    in serverless.yml (an explicit value equal to the default IS reported).
 *  - Omit-empty: absent key ≡ empty array ≡ 0 ≡ "all sandboxes on defaults".
 *  - Counts = "how many sandboxes explicitly set X"; arrays = sorted unique
 *    values customizers chose.
 *  - HARD REQUIREMENT: total function — never throws. Malformed input
 *    degrades to omitted keys or `undefined`; analytics must never break a
 *    user command.
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

const HOOK_NAMES = [
  'ready',
  'validate',
  'run',
  'resume',
  'suspend',
  'terminate',
]
const OS_CAPABILITIES = ['all']
const MAX_TIMEOUT_SECONDS = 3600

const sortedUnique = (values) => {
  const unique = [...new Set(values)]
  return typeof unique[0] === 'number'
    ? unique.sort((a, b) => a - b)
    : unique.sort()
}

const addIfPositive = (target, key, n) => {
  if (typeof n === 'number' && n > 0) target[key] = n
}

const addIfNonEmpty = (target, key, arr) => {
  if (Array.isArray(arr) && arr.length > 0) target[key] = arr
}

const isValidHookValue = (v) =>
  v === true ||
  (isObj(v) &&
    (v.timeout === undefined ||
      (typeof v.timeout === 'number' && v.timeout > 0)))

const buildHooks = (cfgs) => {
  const withHooks = cfgs.filter((c) => isObj(c.hooks))
  if (withHooks.length === 0) return undefined
  const out = { sandboxes: withHooks.length }

  addIfNonEmpty(
    out,
    'configured',
    sortedUnique(
      withHooks.flatMap((c) =>
        HOOK_NAMES.filter((h) => isValidHookValue(c.hooks[h])),
      ),
    ),
  )

  const timeouts = {}
  for (const h of HOOK_NAMES) {
    addIfNonEmpty(
      timeouts,
      h,
      sortedUnique(
        withHooks
          .map((c) => c.hooks[h])
          .filter(isObj)
          .map((v) => v.timeout)
          .filter((t) => typeof t === 'number' && t > 0)
          .map((t) => Math.min(t, MAX_TIMEOUT_SECONDS)),
      ),
    )
  }
  if (Object.keys(timeouts).length > 0) out.timeouts = timeouts

  addIfPositive(
    out,
    'customPort',
    withHooks.filter((c) => typeof c.hooks.port === 'number').length,
  )
  return out
}

const IAM_ROLES = ['buildRole', 'executionRole']

// 'existing' = user supplies a role (ARN string or CFN intrinsic — generation
// skipped); 'extended' = generated role extended with statements /
// managedPolicies / permissionsBoundary. Mirrors validators/schema.js.
const classifyRole = (v) => {
  if (typeof v === 'string') return 'existing'
  if (isObj(v)) {
    return v.statements || v.managedPolicies || v.permissionsBoundary
      ? 'extended'
      : 'existing'
  }
  return undefined
}

const buildIam = (cfgs) => {
  const out = {}
  for (const role of IAM_ROLES) {
    addIfNonEmpty(
      out,
      role,
      sortedUnique(
        cfgs
          .map((c) => (isObj(c.iam) ? classifyRole(c.iam[role]) : undefined))
          .filter(Boolean),
      ),
    )
  }
  return Object.keys(out).length > 0 ? out : undefined
}

// Reports RAW config presence (explicit-only), mirroring — not calling — the
// interpretation in compilers/observability.js resolveObservability. The
// anti-drift test in analytics.test.js pins the two together.
const buildObservability = (cfgs) => {
  const out = {}
  const customized = {}
  let defaults = 0
  let disabled = 0
  let logsDisabled = 0
  let metricsDisabled = 0
  let dashboardDisabled = 0
  let alarms = 0
  let logGroup = 0
  let metricFilters = 0
  let alarmThresholds = 0
  const retentionDays = []

  for (const c of cfgs) {
    const raw = c.observability
    if (raw === false) {
      disabled += 1
      continue
    }
    if (!isObj(raw)) {
      // absent or `true` (or malformed): the pure default — monitoring on,
      // no alarms. Keeps the invariant count − defaults − disabled =
      // sandboxes with a custom observability object.
      defaults += 1
      continue
    }
    if (raw.logs?.enabled === false) logsDisabled += 1
    if (raw.metrics?.enabled === false) metricsDisabled += 1
    if (raw.dashboard?.enabled === false) dashboardDisabled += 1
    if (raw.logs?.enabled !== false && isObj(raw.alarms) && raw.alarms.notify)
      alarms += 1
    if (typeof raw.logs?.retentionDays === 'number') {
      retentionDays.push(raw.logs.retentionDays)
    }
    if (typeof raw.logs?.logGroup === 'string') logGroup += 1
    if (
      isObj(raw.metrics?.filters) &&
      Object.keys(raw.metrics.filters).length > 0
    ) {
      metricFilters += 1
    }
    if (
      isObj(raw.alarms?.thresholds) &&
      Object.keys(raw.alarms.thresholds).length > 0
    ) {
      alarmThresholds += 1
    }
  }

  addIfPositive(out, 'defaults', defaults)
  addIfPositive(out, 'disabled', disabled)
  addIfPositive(out, 'logsDisabled', logsDisabled)
  addIfPositive(out, 'metricsDisabled', metricsDisabled)
  addIfPositive(out, 'dashboardDisabled', dashboardDisabled)
  addIfPositive(out, 'alarms', alarms)
  addIfNonEmpty(customized, 'retentionDays', sortedUnique(retentionDays))
  addIfPositive(customized, 'logGroup', logGroup)
  addIfPositive(customized, 'metricFilters', metricFilters)
  addIfPositive(customized, 'alarmThresholds', alarmThresholds)
  if (Object.keys(customized).length > 0) out.customized = customized
  return Object.keys(out).length > 0 ? out : undefined
}

export const buildSandboxesAnalytics = (sandboxesConfig) => {
  try {
    if (!isObj(sandboxesConfig)) return undefined
    const names = Object.keys(sandboxesConfig)
    if (names.length === 0) return undefined
    // Malformed entries still count toward `count` (they exist in config) but
    // contribute nothing to knob derivation.
    const cfgs = Object.values(sandboxesConfig).filter(isObj)

    const block = { count: names.length }

    addIfNonEmpty(
      block,
      'artifactTypes',
      sortedUnique(
        cfgs
          .map((c) =>
            typeof c.artifact === 'string'
              ? c.artifact.startsWith('s3://')
                ? 's3'
                : 'source'
              : undefined,
          )
          .filter(Boolean),
      ),
    )

    addIfNonEmpty(
      block,
      'minimumMemory',
      sortedUnique(
        cfgs.map((c) => c.minimumMemory).filter((v) => typeof v === 'number'),
      ),
    )

    const hooks = buildHooks(cfgs)
    if (hooks) block.hooks = hooks

    const iam = buildIam(cfgs)
    if (iam) block.iam = iam

    addIfPositive(block, 'vpc', cfgs.filter((c) => isObj(c.vpc)).length)

    const observability = buildObservability(cfgs)
    if (observability) block.observability = observability

    addIfNonEmpty(
      block,
      'envVarCounts',
      cfgs
        .map((c) =>
          isObj(c.environment) ? Object.keys(c.environment).length : 0,
        )
        .filter((n) => n > 0)
        .sort((a, b) => a - b),
    )

    addIfNonEmpty(
      block,
      'osCapabilities',
      sortedUnique(
        cfgs.flatMap((c) =>
          Array.isArray(c.osCapabilities)
            ? c.osCapabilities
                .filter((v) => typeof v === 'string')
                .map((v) => v.toLowerCase())
                .filter((v) => OS_CAPABILITIES.includes(v))
            : [],
        ),
      ),
    )

    addIfPositive(
      block,
      'tags',
      cfgs.filter((c) => isObj(c.tags) && Object.keys(c.tags).length > 0)
        .length,
    )

    return block
  } catch {
    // Last-resort guard: analytics must never throw into the CLI run.
    return undefined
  }
}
