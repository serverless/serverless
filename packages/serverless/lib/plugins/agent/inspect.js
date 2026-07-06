// The `serverless agent inspect` command plugin: the integration keystone that
// wires the building blocks under lib/ (registry, run-calls.js,
// build-clients.js, select.js, discover-resources.js) into the CLI.
//
// Two modes, one lifecycle event:
//   * INDEX  (bare `inspect`, no axis flags / no --name): a cheap categorized
//     table of contents built from ONE paginated listStackResources (+ nested
//     stacks). No per-resource describes. Envelope carries `mode: 'index'` and
//     a `hint` listing every expansion flag.
//   * EXPAND (any category flag, --aws-services, or --name): the selected
//     descriptors are run through the registry-driven runner concurrently, and
//     the merged raw SDK responses are keyed by category -> logicalId.
//
// CLI contract (agents branch on this):
//   * stdout carries EXACTLY ONE document (pretty JSON by default, or YAML with
//     --format yaml). Progress/warnings go to stderr via `log` only.
//   * Exit 0 on success, INCLUDING runs with per-resource `{ error }` entries
//     (partial data is a successful inspect). Fatal errors (non-AWS provider,
//     bad flag/name/service token, stack-not-deployed, credential failure)
//     emit a single structured JSON error object on stdout and rethrow a
//     ServerlessError, which the framework maps to a non-zero exit.
//   * Output is deterministic: categories in a fixed order, logicalIds sorted.
//
// Routing note: end-to-end CLI routing (delegating `agent inspect` from the
// sf-core router to this framework plugin) lives in sf-core. This plugin only
// needs to be loadable + unit-testable here; the container `agent` command it
// declares coexists with the sf-core-level `agent` group.

import yaml from 'js-yaml'
import { log, writeText } from '@serverless/util'
import ServerlessError from '../../serverless-error.js'
import { discoverResources, groupByCategory } from './lib/discover-resources.js'
import { select } from './lib/select.js'
import { createInvoker } from './lib/build-clients.js'
import { runMany, inlineFunctionRoles } from './lib/run-calls.js'
import { REGISTRY_ENTRIES, findByCfnType } from './lib/registry/index.js'

const logger = log.get('sls:plugins:agent:inspect')

// The category flags (axis 1). Derived from the registry so it can't drift out
// of sync with what select/discover know about; `all` is the meta-flag. Every
// spec-surface category (observability, cdn, identity, iot, sandboxes) now has
// registry entries, so this Set already contains them -- no manual append.
const CATEGORY_FLAGS = [
  ...new Set(REGISTRY_ENTRIES.map((entry) => entry.category)),
]

// Fixed category order for deterministic expand-mode output. Follows the
// registry's first-appearance order, then the not-yet-wired categories, then
// `other` last -- mirrors groupByCategory's contract for the index.
const CATEGORY_ORDER = [...CATEGORY_FLAGS, 'other']

// The exact expansion guidance from the spec's index example.
const INDEX_HINT =
  'Expand with category flags (--functions, --api, --events, --iam, --storage, --observability, --cdn, --identity, --iot, --sandboxes), --aws-services <names>, or --all. Add --name <logicalId> to scope to one resource.'

function buildCommandOptions() {
  const options = {}
  for (const flag of CATEGORY_FLAGS) {
    options[flag] = {
      type: 'boolean',
      usage: `Expand ${flag} resources`,
    }
  }
  options.all = {
    type: 'boolean',
    usage: 'Expand every category',
  }
  options['aws-services'] = {
    type: 'string',
    usage:
      'Comma-separated AWS service tokens to expand (e.g. "lambda,iam,s3")',
  }
  options.name = {
    type: 'string',
    array: true,
    usage:
      'Logical ID to scope to (repeatable; used alone auto-selects that resource)',
  }
  options.format = {
    type: 'string',
    usage: 'Output format: "json" (default) or "yaml"',
    default: 'json',
  }
  return options
}

class AgentInspect {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options || {}

    this.commands = {
      agent: {
        type: 'container',
        usage: 'Agent tooling',
        commands: {
          inspect: {
            usage:
              'Inspect a deployed service: a cheap resource index, or the raw AWS state of selected resources',
            lifecycleEvents: ['inspect'],
            options: buildCommandOptions(),
            serviceDependencyMode: 'required',
            hasAwsExtension: true,
          },
        },
      },
    }

    this.hooks = {
      'agent:inspect:inspect': this.inspect.bind(this),
    }
  }

  // Normalizes CLI options (declared with dashed names) into the shape select.js
  // expects: category booleans by name, `awsServices` (camelCase), `name`
  // (array). Reads both dashed and camelCase forms defensively so it works
  // whether the framework hands over dashed or camelCased options.
  selectionOptions() {
    const raw = this.options
    const normalized = {}
    for (const flag of CATEGORY_FLAGS) normalized[flag] = Boolean(raw[flag])
    normalized.all = Boolean(raw.all)
    normalized.awsServices = raw.awsServices || raw['aws-services']
    normalized.name = raw.name
    return normalized
  }

  format() {
    return this.options.format || 'json'
  }

  // Emits the single stdout document in the requested format. YAML mirrors
  // print.js (js-yaml, noRefs); JSON is pretty-printed and byte-stable.
  render(payload) {
    if (this.format() === 'yaml') {
      writeText(yaml.dump(payload, { noRefs: true }))
      return
    }
    writeText(JSON.stringify(payload, null, 2))
  }

  async inspect() {
    this.provider = this.serverless.getProvider('aws')
    const region = this.options.region || this.provider.getRegion()
    const stage = this.provider.getStage()

    try {
      // Guard: this command only runs against the AWS provider. Structured
      // error up front, before any AWS call. (Compose-root / no-service cases
      // are handled by the framework's normal command guards.)
      if (this.serverless.service.provider.name !== 'aws') {
        throw new ServerlessError(
          `"serverless agent inspect" requires the "aws" provider (found "${this.serverless.service.provider.name}").`,
          'AGENT_INSPECT_UNSUPPORTED_PROVIDER',
        )
      }

      const stackName = this.provider.naming.getStackName()

      // Discovery: one paginated listStackResources, recursing into nested
      // stacks. The lister is injected so discovery stays provider-agnostic.
      const listStackResources = (name, nextToken) =>
        this.provider.request('CloudFormation', 'listStackResources', {
          StackName: name,
          NextToken: nextToken,
        })

      logger.debug(`Discovering resources in stack ${stackName}`)
      const discovered = await discoverResources({
        listStackResources,
        stackName,
      })

      const { selected, inlineFunctionRole } = select({
        resources: discovered,
        options: this.selectionOptions(),
      })

      // INDEX mode: nothing selected -> the cheap table of contents.
      if (selected.length === 0) {
        this.render({
          service: this.serverless.service.service,
          stage,
          region,
          stackName,
          mode: 'index',
          hint: INDEX_HINT,
          resources: groupByCategory(discovered),
        })
        return
      }

      // EXPAND mode: describe the selected resources concurrently.
      logger.debug(
        `Expanding ${selected.length} resource(s)` +
          (inlineFunctionRole ? ' (function IAM roles will be inlined)' : ''),
      )
      const payload = await this.expand({
        selected,
        inlineFunctionRole,
        stage,
        region,
        stackName,
      })
      this.render(payload)
    } catch (error) {
      // Fatal: emit ONE structured JSON error object on stdout naming the
      // profile/region/stage that were used, then rethrow so the framework
      // maps it to a non-zero exit. Never silently try other profiles.
      this.render({
        error: {
          code: error.code || 'AGENT_INSPECT_ERROR',
          message: error.message || String(error),
          region,
          stage,
          ...(this.options['aws-profile'] || this.options.awsProfile
            ? {
                profile: this.options['aws-profile'] || this.options.awsProfile,
              }
            : {}),
        },
      })
      if (error instanceof ServerlessError) throw error
      throw new ServerlessError(
        error.message || String(error),
        error.code || 'AGENT_INSPECT_ERROR',
      )
    }
  }

  // Runs the selected descriptors through the registry-driven runner and
  // assembles the deterministic { [category]: { [logicalId]: data | {error} } }
  // payload. Descriptors with no physicalId (failed/in-progress) are marked
  // not-deployed and never described. The rest are mapped to their registry
  // entry by cfnType and run via runMany.
  async expand({ selected, inlineFunctionRole, stage, region, stackName }) {
    const c = await this.provider.getCredentials()
    const invoker = createInvoker({
      region,
      credentials: {
        accessKeyId: c.accessKeyId,
        secretAccessKey: c.secretAccessKey,
        sessionToken: c.sessionToken,
      },
    })

    // Split describable descriptors (have a physicalId + a registry entry) from
    // not-deployed ones (empty physicalId -> skip describe, mark error).
    const runnable = []
    const notDeployed = []
    for (const descriptor of selected) {
      if (!descriptor.physicalId) {
        notDeployed.push(descriptor)
        continue
      }
      const entry = findByCfnType(descriptor.type)
      if (!entry) {
        // Defensive: select only returns describable primaries, but if a
        // descriptor somehow lacks a registry entry, don't crash the run.
        notDeployed.push(descriptor)
        continue
      }
      runnable.push({
        descriptor,
        entry,
        identifier: entry.identifier(summaryFromDescriptor(descriptor)),
      })
    }

    const results = await runMany({
      resources: runnable.map(({ entry, identifier }) => ({
        entry,
        identifier,
      })),
      invoke: invoker.invoke,
    })

    // Bucket results by category -> logicalId (deterministic ordering applied
    // by buildResourcesPayload).
    const perDescriptor = []
    runnable.forEach(({ descriptor }, index) => {
      perDescriptor.push({ descriptor, data: results[index] })
    })
    for (const descriptor of notDeployed) {
      perDescriptor.push({
        descriptor,
        data: { error: 'not deployed / no physical id' },
      })
    }

    const resources = buildResourcesPayload(perDescriptor)

    // IAM-inline dedup: when functions are selected without iam,
    // fetch + attach each function's execution role (deduped by role name)
    // under functions.<logicalId>.role, reusing the IAM registry entry's own
    // `calls` so the inline/attached-policy fan-out logic lives in one place.
    // When iam IS selected too, roles are expanded under their own category
    // instead and function results are left untouched (see select.js's
    // computeInlineFunctionRole for the flag-order-independent rule).
    if (inlineFunctionRole) {
      const iamEntry = findByCfnType('AWS::IAM::Role')
      await inlineFunctionRoles({
        resources,
        invoke: invoker.invoke,
        iamEntry,
      })
    }

    return {
      service: this.serverless.service.service,
      stage,
      region,
      stackName,
      resources,
    }
  }
}

// Reconstructs the minimal StackResourceSummary shape a registry entry's
// `identifier` function reads (PhysicalResourceId etc.) from a flat descriptor.
function summaryFromDescriptor(descriptor) {
  return {
    LogicalResourceId: descriptor.logicalId,
    PhysicalResourceId: descriptor.physicalId,
    ResourceType: descriptor.type,
    ResourceStatus: descriptor.status,
  }
}

// Assembles { [category]: { [logicalId]: data } } with deterministic ordering:
// categories in CATEGORY_ORDER (only those actually present), logicalIds sorted
// ascending. Categories with no results are omitted so the expand payload
// stays scoped to what was selected.
function buildResourcesPayload(perDescriptor) {
  const byCategory = new Map()
  for (const { descriptor, data } of perDescriptor) {
    const category = descriptor.category
    if (!byCategory.has(category)) byCategory.set(category, [])
    byCategory.get(category).push({ logicalId: descriptor.logicalId, data })
  }

  const resources = {}
  for (const category of CATEGORY_ORDER) {
    const entries = byCategory.get(category)
    if (!entries || entries.length === 0) continue
    entries.sort((a, b) =>
      a.logicalId < b.logicalId ? -1 : a.logicalId > b.logicalId ? 1 : 0,
    )
    const bucket = {}
    for (const { logicalId, data } of entries) bucket[logicalId] = data
    resources[category] = bucket
  }
  return resources
}

export default AgentInspect
