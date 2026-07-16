// Discovery: turns a deployed CloudFormation stack into the flat resource
// index that select.js consumes and inspect.js's index render groups.
// Handles the discovery edge cases in one place: pagination,
// nested-stack recursion, and empty PhysicalResourceId.
//
// The index is registry-driven (lib/registry/index.js): `category` and
// `awsService` come from an EXACT ResourceType lookup, so only PRIMARY
// describable types get a real category/awsService. Every other type --
// folded sub-resources (AWS::Lambda::Permission/Version/Alias,
// AWS::ApiGateway::Method/Resource/Deployment, AWS::SNS::Subscription, ...)
// AND genuinely-unsupported types (WAF, Custom::*, unknown) -- gets
// `category: 'other'`, `awsService: null`. Keeping sub-resources in `other`
// (rather than a drift-prone sub-resource->category map) makes the describable
// set exactly the registry primaries: they are folded into their parent's
// describe and must never be independently expanded.

import { findByCfnType, REGISTRY_ENTRIES } from './registry/index.js'

const NESTED_STACK_TYPE = 'AWS::CloudFormation::Stack'

/**
 * Every category the registry knows about, in first-appearance order, with
 * `other` always last. Drives groupByCategory's stable shape so inspect.js's
 * index render always has the same keys regardless of what's deployed.
 */
function knownCategories() {
  return [...new Set(REGISTRY_ENTRIES.map((entry) => entry.category)), 'other']
}

/**
 * Derives a readable stack name from a nested-stack PhysicalResourceId, which
 * is the child stack's id/ARN, e.g.
 * `arn:aws:cloudformation:us-east-1:123456789012:stack/orders-api-dev-NestedStackOne/abc123`.
 * Returns the stack-name segment (`orders-api-dev-NestedStackOne`). Falls back
 * to the raw value for anything that isn't a recognizable stack ARN.
 */
function stackNameFromPhysicalId(physicalId) {
  if (!physicalId) return physicalId
  const arnMatch = physicalId.match(/:stack\/([^/]+)\//)
  if (arnMatch) return arnMatch[1]
  return physicalId
}

/**
 * Maps one StackResourceSummary to a flat descriptor, resolving category and
 * awsService from the registry by EXACT ResourceType. Non-primary types
 * (sub-resources + unsupported) get { category: 'other', awsService: null }.
 */
function toDescriptor(summary, stack) {
  const entry = findByCfnType(summary.ResourceType)
  return {
    logicalId: summary.LogicalResourceId,
    physicalId: summary.PhysicalResourceId || '',
    type: summary.ResourceType,
    status: summary.ResourceStatus,
    category: entry ? entry.category : 'other',
    awsService: entry ? entry.awsService : null,
    stack,
  }
}

/**
 * Pages through listStackResources for a single stack, following NextToken
 * until exhausted, and returns the concatenated StackResourceSummaries.
 */
async function listAllStackResources(listStackResources, stackName) {
  const summaries = []
  let nextToken
  do {
    const page = await listStackResources(stackName, nextToken)
    summaries.push(...(page.StackResourceSummaries || []))
    nextToken = page.NextToken
  } while (nextToken)
  return summaries
}

/**
 * discoverResources({ listStackResources, stackName, registry? }) ->
 *   Promise<Array<{ logicalId, physicalId, type, status, category, awsService, stack }>>
 *
 * @param {object}   args
 * @param {(stackName: string, nextToken?: string) =>
 *   Promise<{ StackResourceSummaries: Array, NextToken?: string }>} args.listStackResources
 *   INJECTED CloudFormation lister (inspect.js wires it to the provider). Kept as a
 *   parameter so discovery is unit-testable with a mock.
 * @param {string}   args.stackName - the root stack name to enumerate.
 *
 * Behaviors:
 *  - Pagination: follows NextToken until exhausted.
 *  - Nested stacks: an AWS::CloudFormation::Stack resource is NOT emitted as a
 *    descriptor itself; instead its child stack is enumerated and folded into
 *    the flat output, each child descriptor tagged with `stack` = the child
 *    stack's readable name. A `seen` set of stack ids guards against cycles.
 *  - Empty/failed: a resource with an empty/absent PhysicalResourceId is still
 *    emitted (physicalId: '') so nothing is hidden; downstream skips describing
 *    it.
 *
 * @returns {Promise<Array<object>>} flat descriptor list, top-level stack's
 *   resources first, then each nested stack's resources in encounter order.
 */
async function discoverResources({ listStackResources, stackName }) {
  const seen = new Set()

  async function collect(currentStackName) {
    // Guard against nested-stack cycles: a stack we've already enumerated is
    // skipped rather than recursed into again.
    if (seen.has(currentStackName)) return []
    seen.add(currentStackName)

    const summaries = await listAllStackResources(
      listStackResources,
      currentStackName,
    )

    const descriptors = []
    for (const summary of summaries) {
      if (summary.ResourceType === NESTED_STACK_TYPE) {
        // Do not emit the wrapper; recurse into the child stack (its
        // PhysicalResourceId is the child stack id/ARN) and fold its
        // resources in, tagged with the child stack's readable name.
        const childStackName = stackNameFromPhysicalId(
          summary.PhysicalResourceId,
        )
        if (childStackName) {
          descriptors.push(...(await collect(childStackName)))
        }
        continue
      }
      descriptors.push(toDescriptor(summary, currentStackName))
    }
    return descriptors
  }

  return collect(stackName)
}

/**
 * groupByCategory(descriptors) -> { [category]: descriptor[] }
 *
 * Buckets a flat descriptor list into the display grouping for inspect.js's
 * index render. EVERY known category (from the registry) plus `other` is
 * always present as an array (possibly empty), so the rendered shape is
 * stable regardless of what's deployed.
 *
 * Determinism: category key order follows the registry's first-appearance
 * order with `other` last; within each category, descriptors are sorted by
 * logicalId (case-sensitive, ascending) so the output is byte-stable across
 * runs and independent of stack-enumeration order.
 */
function groupByCategory(descriptors) {
  const grouped = {}
  for (const category of knownCategories()) grouped[category] = []

  for (const descriptor of descriptors) {
    // A descriptor's category is always one the registry knows about, or
    // 'other'; both are pre-seeded above.
    grouped[descriptor.category].push(descriptor)
  }

  for (const category of Object.keys(grouped)) {
    grouped[category].sort((a, b) =>
      a.logicalId < b.logicalId ? -1 : a.logicalId > b.logicalId ? 1 : 0,
    )
  }

  return grouped
}

export { discoverResources, groupByCategory }
