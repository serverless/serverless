import { rewriteDockerHostServicePath } from '../docker-code-mount.js'

/**
 * Build the read-only `/opt` bind mount descriptor for an extracted layer set.
 * Mirrors the descriptor shape produced for the code mount.
 *
 * @param {object} args
 * @param {string} args.optDir            Host dir holding the merged layer tree.
 * @param {string} [args.servicePath]
 * @param {string | null} [args.dockerHostServicePath]
 * @returns {{ source: string, target: string, mode: 'ro', readOnly: true, bind: string }}
 */
export function buildLayerMount({
  optDir,
  servicePath = process.cwd(),
  dockerHostServicePath = null,
}) {
  const source = rewriteDockerHostServicePath(optDir, {
    servicePath,
    dockerHostServicePath,
  })
  const target = '/opt'
  return {
    source,
    target,
    mode: 'ro',
    readOnly: true,
    bind: `${source}:${target}:ro`,
  }
}

/**
 * Env additions a runtime needs so layer modules under /opt are discovered.
 *
 * The official Lambda images already search /opt for Python, Ruby, Java, and
 * custom runtimes, and the base env keeps /opt/lib on LD_LIBRARY_PATH. Only
 * NODE_PATH is overridden to a value missing the /opt node paths, so Node is
 * the sole runtime needing a fix.
 *
 * @param {string} [runtime]
 * @returns {{ NODE_PATH_PREFIX?: string }}
 */
export function layerEnvFor(runtime) {
  const match = /^nodejs(\d+)\./.exec(runtime ?? '')
  if (!match) return {}
  const major = match[1]
  return {
    NODE_PATH_PREFIX: `/opt/nodejs/node_modules:/opt/nodejs/node${major}/node_modules`,
  }
}
