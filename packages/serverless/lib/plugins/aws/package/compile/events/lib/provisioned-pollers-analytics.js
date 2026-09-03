/**
 * Pure builder for the `provisionedPollers` block of the
 * sfcore.analysis.generated.v1 analytics event. Consumed by the sf-core
 * framework runner's getAnalysisEventDetails().
 *
 * Contract (mirrors sandboxes/mcp analytics builders):
 *  - Fixed keys only — never a user-authored string (the poller group NAME
 *    is never reported, only its presence count).
 *  - Explicit-only + omit-empty: a key appears only when a user set it.
 *  - HARD REQUIREMENT: total function — never throws; malformed input
 *    degrades to {} so analytics can never break a user command.
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

const sortedUniqueNumbers = (values) =>
  [...new Set(values.filter((n) => typeof n === 'number'))].sort(
    (a, b) => a - b,
  )

const SOURCES = ['sqs', 'kafka', 'msk']
// `group` (PollerGroupName) exists only on kafka/msk; the sqs schema rejects it,
// so a group on sqs is invalid config and is never reported.
const SOURCES_WITH_GROUP = new Set(['kafka', 'msk'])

export const buildProvisionedPollersAnalytics = (config) => {
  try {
    const functions = isObj(config?.functions)
      ? Object.values(config.functions)
      : []
    const perSource = {}
    for (const source of SOURCES) {
      const values = []
      for (const fn of functions) {
        const events = Array.isArray(fn?.events) ? fn.events : []
        for (const event of events) {
          if (!isObj(event?.[source])) continue
          const value = event[source].provisionedPollers
          if (value !== undefined) values.push(value)
        }
      }
      const objects = values.filter(isObj)
      const block = {}
      if (objects.length > 0) block.configured = objects.length
      const disabled = values.filter((v) => v === false).length
      if (disabled > 0) block.disabled = disabled
      const min = sortedUniqueNumbers(objects.map((o) => o.min))
      if (min.length > 0) block.min = min
      const max = sortedUniqueNumbers(objects.map((o) => o.max))
      if (max.length > 0) block.max = max
      if (SOURCES_WITH_GROUP.has(source)) {
        const groups = objects.filter(
          (o) => typeof o.group === 'string' && o.group.length > 0,
        ).length
        if (groups > 0) block.groups = groups
      }
      if (Object.keys(block).length > 0) perSource[source] = block
    }
    return Object.keys(perSource).length > 0
      ? { provisionedPollers: perSource }
      : {}
  } catch {
    return {}
  }
}
