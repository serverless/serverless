/**
 * Pure helpers deriving bounded analytics fields from service config and the
 * compiled CloudFormation template. Every function here must be total (never
 * throw on malformed input): a throw escaping the analytics path aborts
 * finalization and silently drops the billing usage event.
 *
 * Breakdown maps use a closed key vocabulary (AWS::* / Custom / other /
 * unknown) — open-ended keys break Glue schema inference on the events lake.
 */

const MAX_RESOURCE_TYPE_KEYS = 50

export const tallyResourceTypes = (resources) => {
  if (!resources || typeof resources !== 'object' || Array.isArray(resources)) {
    return undefined
  }
  const tally = {}
  for (const resource of Object.values(resources)) {
    const rawType = resource?.Type
    let type
    if (typeof rawType !== 'string' || rawType.length === 0) {
      type = 'unknown'
    } else if (rawType.startsWith('AWS::')) {
      type = rawType
    } else if (rawType.startsWith('Custom::')) {
      type = 'Custom'
    } else {
      type = 'other'
    }
    if (
      !(type in tally) &&
      Object.keys(tally).length >= MAX_RESOURCE_TYPE_KEYS
    ) {
      type = 'other'
    }
    tally[type] = (tally[type] ?? 0) + 1
  }
  return Object.keys(tally).length > 0 ? tally : undefined
}

export const deriveEventSourceTypes = (functions) => {
  const types = new Set()
  if (!functions || typeof functions !== 'object') return []
  for (const fn of Object.values(functions)) {
    const events = Array.isArray(fn?.events) ? fn.events : []
    for (const event of events) {
      const type =
        typeof event === 'string' ? event : Object.keys(event ?? {})[0]
      if (typeof type === 'string' && type.length > 0) types.add(type)
    }
  }
  return [...types].sort()
}

export const countUniqueLayers = (config) => {
  const definedCount =
    config?.layers &&
    typeof config.layers === 'object' &&
    !Array.isArray(config.layers)
      ? Object.keys(config.layers).length
      : 0
  const externalRefs = new Set()
  const collect = (layers) => {
    if (!Array.isArray(layers)) return
    for (const layer of layers) {
      // Object refs ({Ref}/{Fn::GetAtt}) target layers defined in this
      // service's own layers block, which are already counted above.
      if (typeof layer === 'string') externalRefs.add(layer)
    }
  }
  collect(config?.provider?.layers)
  if (config?.functions && typeof config.functions === 'object') {
    for (const fn of Object.values(config.functions)) collect(fn?.layers)
  }
  return definedCount + externalRefs.size
}

export const collectArtifactPaths = (service) => {
  const paths = new Set()
  if (typeof service?.package?.artifact === 'string') {
    paths.add(service.package.artifact)
  }
  const functions =
    service?.functions && typeof service.functions === 'object'
      ? Object.values(service.functions)
      : []
  for (const fn of functions) {
    if (typeof fn?.package?.artifact === 'string') {
      paths.add(fn.package.artifact)
    }
  }
  return [...paths]
}

export const deriveAnalysisEnrichment = ({
  config,
  compiledCloudFormationTemplate,
  command,
  serviceUniqueId,
  analyticsMetrics,
} = {}) => {
  const details = {}
  try {
    details.lambdaArchitecture = config?.provider?.architecture ?? 'x86_64'
    details.functionCount =
      config?.functions && typeof config.functions === 'object'
        ? Object.keys(config.functions).length
        : 0
    details.layerCount = countUniqueLayers(config)

    const eventSourceTypes = deriveEventSourceTypes(config?.functions)
    if (eventSourceTypes.length > 0) details.eventSourceTypes = eventSourceTypes

    const configResourceTypeBreakdown = tallyResourceTypes(
      config?.resources?.Resources,
    )
    if (configResourceTypeBreakdown) {
      details.configResourceTypeBreakdown = configResourceTypeBreakdown
    }

    const compiledResources = compiledCloudFormationTemplate?.Resources
    const resourceTypeBreakdown = tallyResourceTypes(compiledResources)
    if (resourceTypeBreakdown) {
      details.resourceTypeBreakdown = resourceTypeBreakdown
      details.resourceCount = Object.keys(compiledResources).length
    }

    // Only the plain `deploy` command can create the stack — sub-commands
    // (`deploy function`, `deploy list`) never do, so they don't report it
    if (
      Array.isArray(command) &&
      command.length === 1 &&
      command[0] === 'deploy' &&
      serviceUniqueId &&
      typeof analyticsMetrics?.stackExistedBeforeRun === 'boolean'
    ) {
      details.isFirstDeploy = !analyticsMetrics.stackExistedBeforeRun
    }

    if (typeof analyticsMetrics?.buildDurationMs === 'number') {
      details.buildDurationMs = analyticsMetrics.buildDurationMs
    }
    if (
      Array.isArray(analyticsMetrics?.artifactSizesBytes) &&
      analyticsMetrics.artifactSizesBytes.every((s) => typeof s === 'number')
    ) {
      details.artifactSizesBytes = analyticsMetrics.artifactSizesBytes
    }
  } catch {
    // Last-resort guard: return whatever was derived before the failure.
  }
  return details
}
