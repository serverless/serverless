/**
 * The runtimes Dev Mode can run on this machine. Adding a runtime is one adapter here plus its
 * tests: the Runtime API, credentials, watcher and output do not change.
 */
import { nodeAdapter } from './node.js'
import { pythonAdapter } from './python.js'

export const ADAPTERS = Object.freeze([nodeAdapter, pythonAdapter])

export const adapterFor = (runtime, adapters = ADAPTERS) =>
  adapters.find((adapter) => adapter.matches(String(runtime ?? ''))) ?? null

/** This machine's interpreter for every adapter the given runtimes need, by adapter name. */
export const detectLocalRuntimes = async ({
  runtimes = [],
  serviceDir,
  env = process.env,
  adapters = ADAPTERS,
}) => {
  const needed = adapters.filter((adapter) =>
    runtimes.some((runtime) => adapter.matches(String(runtime ?? ''))),
  )
  return Object.fromEntries(
    await Promise.all(
      needed.map(async (adapter) => [
        adapter.name,
        await adapter.detectLocal({ serviceDir, env }),
      ]),
    ),
  )
}

/** One entry per adapter and deployed runtime whose version differs from this machine's. */
export const versionMismatches = ({
  functions,
  localRuntimes = {},
  adapters = ADAPTERS,
}) => {
  const groups = new Map()
  for (const { key, runtime } of functions) {
    const adapter = adapterFor(runtime, adapters)
    const local = adapter ? localRuntimes[adapter.name] : undefined
    if (!local?.available) continue
    const deployed = adapter.deployedVersion(runtime)
    if (!deployed || adapter.localVersionKey(local.version) === deployed) {
      continue
    }
    const id = `${adapter.name}:${runtime}`
    if (!groups.has(id)) {
      groups.set(id, { adapter, runtime, deployed, local, functions: [] })
    }
    groups.get(id).functions.push(key)
  }
  return [...groups.values()]
}
