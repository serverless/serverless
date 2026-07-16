// Selection: given the discovered-resource index (discover-resources.js's
// flat descriptor list) and the parsed `agent inspect` command options,
// decides which resources to expand (the two-axis union) plus the IAM-inline
// dedup decision (see computeInlineFunctionRole below).
//
// Replaces the stale single-axis scaffold (select-categories.js), which
// hardcoded 5 categories. This module derives both the category set AND the
// --aws-services token set from the registry (lib/registry/index.js) so the
// real set (functions/iam/api/events/storage/observability/cdn/identity/
// iot/sandboxes, growing as more registry entries are added) can never
// drift out of sync here.

import ServerlessError from '../../../serverless-error.js'
import { REGISTRY_ENTRIES, resolveAwsServiceAlias } from './registry/index.js'

/**
 * Every category flag the registry currently knows about, e.g.
 * ['functions', 'iam', 'api', 'events', 'storage', ...]. Order follows first
 * appearance in REGISTRY_ENTRIES; --all/--name-alone-mode selection is
 * category-agnostic so this order isn't load-bearing for correctness, only
 * for readability of error messages.
 */
function knownCategories() {
  return [...new Set(REGISTRY_ENTRIES.map((entry) => entry.category))]
}

/**
 * Every canonical --aws-services token the registry currently knows about
 * (aliases resolve to these, they aren't listed again themselves). Excludes
 * `null` -- index-only entries (e.g. AWS::Lambda::NetworkConnector, which has
 * no describe op in the SDK, see registry/lambda-microvms.js) carry
 * `awsService: null` since they have no describe capability; they must never
 * surface as a selectable/valid --aws-services token.
 */
function knownAwsServices() {
  return [...new Set(REGISTRY_ENTRIES.map((entry) => entry.awsService))].filter(
    Boolean,
  )
}

/**
 * Parses the `--aws-services` option into a Set of canonical (alias-resolved)
 * AWS service tokens. Accepts a comma-separated string or an array of
 * strings (serverless gives an array for `array: true` options, but a single
 * comma-list string is also supported for the `--aws-services <list>`
 * form). Trims whitespace, drops empty segments (trailing/leading/double
 * commas), lowercases before alias resolution (case-insensitive).
 *
 * Throws a structured ServerlessError on any unknown token, listing every
 * supported (canonical) service token.
 */
function parseAwsServices(rawAwsServices) {
  if (!rawAwsServices) return new Set()

  const rawTokens = Array.isArray(rawAwsServices)
    ? rawAwsServices
    : String(rawAwsServices).split(',')

  const tokens = rawTokens
    .map((token) => String(token).trim().toLowerCase())
    .filter((token) => token.length > 0)

  const known = new Set(knownAwsServices())
  const resolved = new Set()

  for (const token of tokens) {
    const canonical = resolveAwsServiceAlias(token)
    if (!known.has(canonical)) {
      throw new ServerlessError(
        `Unknown --aws-services value "${token}". Supported services: ${[
          ...known,
        ]
          .sort()
          .join(', ')}.`,
        'AGENT_INSPECT_UNKNOWN_AWS_SERVICE',
      )
    }
    resolved.add(canonical)
  }

  return resolved
}

/**
 * Resolves axis 1 (category flags) into a Set of selected category names.
 * `--all` selects every category the registry knows about.
 */
function resolveSelectedCategories(options) {
  if (options.all) return new Set(knownCategories())
  return new Set(knownCategories().filter((category) => options[category]))
}

/**
 * Normalizes the `--name` option (repeatable CLI flag) into a plain array of
 * logical IDs.
 *
 * Defensive comma-splitting (the canonical repeatable-option pattern in this
 * codebase -- cf. agent-skills-install's `Array.isArray(dir) ? dir : [dir]`):
 * although `name` is declared `array: true`, the CoreRunner->framework
 * delegation re-serializes the parsed options through a yargs argv round-trip
 * (utils/cli/cli.js `buildArgvArray` does `--${key} ${value}`), which
 * String()-joins a multi-value array into ONE comma-delimited token. So
 * `--name Hello --name Worker` can arrive here as the single-element array
 * `['Hello,Worker']` (or, for a bare value, the string `'Hello,Worker'`)
 * instead of `['Hello', 'Worker']`. We flatten every element and split on
 * commas to recover the individual names. This is safe and lossless: CFN
 * logical IDs are alphanumeric (`[A-Za-z0-9]`) and can never contain a comma,
 * so a comma is unambiguously a delimiter. Whitespace is trimmed and empty
 * segments dropped. A single `--name X` and alone-mode are unaffected.
 */
function normalizeNames(rawName) {
  if (!rawName) return []
  const raw = Array.isArray(rawName) ? rawName : [rawName]
  return raw
    .flatMap((value) => String(value).split(','))
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
}

/**
 * Looks up each requested logicalId (case-sensitive -- CFN logical IDs are
 * case-sensitive) against the full resource index. Throws a structured error
 * for an unknown logicalId (listing every valid one), for a logicalId shared
 * by resources in more than one stack (ambiguous across nested stacks --
 * listing the `stack`-qualified candidates), or for a logicalId that resolves
 * to the `other` bucket (unsupported/undescribable type).
 */
function resolveNamedResources(names, resources) {
  // Group by logicalId so a name shared across nested stacks is detected
  // rather than silently resolving to whichever entry landed last in a Map.
  const byLogicalId = new Map()
  for (const resource of resources) {
    const bucket = byLogicalId.get(resource.logicalId)
    if (bucket) bucket.push(resource)
    else byLogicalId.set(resource.logicalId, [resource])
  }

  return names.map((name) => {
    const matches = byLogicalId.get(name)
    if (!matches) {
      const validIds = resources.map((r) => r.logicalId).sort()
      throw new ServerlessError(
        `Unknown --name "${name}". Valid logical IDs: ${validIds.join(', ')}.`,
        'AGENT_INSPECT_UNKNOWN_NAME',
      )
    }
    if (matches.length > 1) {
      const candidates = matches
        .map((r) => `${r.stack}/${r.logicalId}`)
        .sort()
        .join(', ')
      throw new ServerlessError(
        `Ambiguous --name "${name}": it matches resources in multiple stacks (${candidates}). This isn't yet disambiguable by stack; rename the conflicting resource or select by category/service instead.`,
        'AGENT_INSPECT_AMBIGUOUS_NAME',
      )
    }
    const resource = matches[0]
    if (resource.category === 'other' || !resource.awsService) {
      throw new ServerlessError(
        `Resource "${name}" (${resource.type}) is not describable -- its type isn't supported by "serverless agent inspect".`,
        'AGENT_INSPECT_NAME_NOT_DESCRIBABLE',
      )
    }
    return resource
  })
}

/**
 * Dedup rule (fixed by category, not by flag order): a function's IAM role
 * policies are inlined under the function only when functions are in the
 * RESOLVED selection and iam is NOT -- checked on the union of both axes, so
 * `--iam --functions` and `--functions --iam` (and `--functions
 * --aws-services iam`) all produce the identical decision.
 */
function computeInlineFunctionRole(selected) {
  const categories = new Set(selected.map((r) => r.category))
  return categories.has('functions') && !categories.has('iam')
}

/**
 * select({ resources, options }) -> { selected, inlineFunctionRole }
 *
 * @param {object}   args
 * @param {Array<{logicalId, physicalId, type, status, awsService, category}>} args.resources
 *   The flat discovered-resource index (discover-resources.js output
 *   flattened across categories, `other` included).
 * @param {object}   args.options - parsed command flags: booleans per
 *   category (`functions`, `api`, `events`, `iam`, `storage`, `observability`,
 *   `cdn`, `identity`, `iot`, `sandboxes`, ... -- whatever the registry
 *   currently defines), `all` (boolean), `awsServices` (comma-string or
 *   array), `name` (array -- repeatable `--name`).
 *
 * @returns {{ selected: Array<object>, inlineFunctionRole: boolean }}
 *   `selected` preserves `resources`' input order and contains no duplicates
 *   even when a resource matches both axes. `inlineFunctionRole` is the
 *   IAM-inline dedup decision computed on the resolved selection, for the
 *   inline-role step (run-calls.js's inlineFunctionRoles) to consume.
 *
 * Selection semantics:
 *   - Axis 1 (category flags) ∪ Axis 2 (--aws-services) -- a resource is
 *     selected if its category is flagged OR its awsService is in the
 *     resolved service list.
 *   - `--name` narrows the union above when axis flags/services are also
 *     given. Given ALONE (no axis flags, no --aws-services), it switches to
 *     alone-mode: the named resources are auto-selected directly, no
 *     category flag required.
 *   - Neither axis nor --name given => empty selection (caller renders the
 *     cheap index).
 */
function select({ resources, options = {} }) {
  const names = normalizeNames(options.name)
  const selectedCategories = resolveSelectedCategories(options)
  const selectedAwsServices = parseAwsServices(options.awsServices)

  const hasAxisSelection =
    selectedCategories.size > 0 || selectedAwsServices.size > 0

  // Alone-mode: --name with no axis flags at all auto-selects the named
  // resources directly, independent of category/service membership.
  if (names.length > 0 && !hasAxisSelection) {
    const selected = dedupeInInputOrder(
      resolveNamedResources(names, resources),
      resources,
    )
    return { selected, inlineFunctionRole: computeInlineFunctionRole(selected) }
  }

  if (!hasAxisSelection) {
    return { selected: [], inlineFunctionRole: false }
  }

  // Expansion requires the resource be describable (has an awsService, i.e.
  // it's a registry PRIMARY -- never a folded sub-resource or unsupported
  // type, both of which discovery labels `other`/awsService:null) AND that it
  // match a selected axis (its category flagged OR its awsService listed).
  // Gating on `awsService` makes the invariant explicit and future-proof: a
  // folded sub-resource can never be independently expanded even if some
  // future design gave it a describable category.
  const axisSelected = resources.filter(
    (resource) =>
      Boolean(resource.awsService) &&
      (selectedCategories.has(resource.category) ||
        selectedAwsServices.has(resource.awsService)),
  )

  if (names.length === 0) {
    return {
      selected: axisSelected,
      inlineFunctionRole: computeInlineFunctionRole(axisSelected),
    }
  }

  // `--name` alongside axis flags/services is a pure FILTER (narrows the
  // axis selection to just the named resource(s)) -- it does not pull in
  // resources outside the flagged categories/services. Names are still
  // validated the same way as alone-mode (unknown logicalId / `other`-bucket
  // both error), even for a name that would end up filtered out, since an
  // invalid --name is a user mistake regardless of which axis is active.
  const named = resolveNamedResources(names, resources)
  const namedIds = new Set(named.map((r) => r.logicalId))
  const selected = axisSelected.filter((r) => namedIds.has(r.logicalId))

  return { selected, inlineFunctionRole: computeInlineFunctionRole(selected) }
}

/**
 * De-duplicates a list of resources (by logicalId) while preserving the
 * original `resources` index order -- keeps output deterministic regardless
 * of flag order or which axis contributed a given resource.
 */
function dedupeInInputOrder(list, resources) {
  const ids = new Set(list.map((r) => r.logicalId))
  return resources.filter((r) => ids.has(r.logicalId))
}

export { select }
