import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import JSZip from 'jszip'

/**
 * @param {string} bindPath
 * @param {object} options
 * @param {string} [options.servicePath]
 * @param {string | null} [options.dockerHostServicePath]
 * @returns {string}
 */
export function rewriteDockerHostServicePath(
  bindPath,
  { servicePath = process.cwd(), dockerHostServicePath = null } = {},
) {
  if (!dockerHostServicePath) return bindPath

  const resolvedServicePath = path.resolve(servicePath)
  const resolvedBindPath = path.resolve(bindPath)
  const relative = path.relative(resolvedServicePath, resolvedBindPath)
  if (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  ) {
    return path.join(dockerHostServicePath, relative)
  }
  return bindPath
}

/**
 * @param {string} source
 * @param {string} target
 * @param {'ro' | 'rw'} mode
 * @returns {{ source: string, target: string, mode: 'ro' | 'rw', readOnly: boolean, bind: string }}
 */
function createMount(source, target, mode) {
  return {
    source,
    target,
    mode,
    readOnly: mode === 'ro',
    bind: `${source}:${target}:${mode}`,
  }
}

/**
 * Extract a ZIP buffer into a destination directory, rejecting any entry whose
 * resolved path escapes that directory (path-traversal guard). Directory
 * entries are skipped; file modes are preserved from the archive.
 *
 * @param {Buffer} buffer
 * @param {string} destDir
 * @returns {Promise<void>}
 */
export async function extractZipBuffer(buffer, destDir) {
  const zip = await JSZip.loadAsync(buffer)
  const writes = []
  for (const [entryName, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue
    const destination = path.resolve(destDir, entryName)
    const relative = path.relative(destDir, destination)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Unsafe ZIP entry path: ${entryName}`)
    }
    writes.push(
      (async () => {
        await fs.mkdir(path.dirname(destination), { recursive: true })
        await fs.writeFile(destination, await entry.async('nodebuffer'), {
          mode: entry.unixPermissions,
        })
      })(),
    )
  }
  await Promise.all(writes)
}

/**
 * @param {object} args
 * @param {string} args.artifactPath
 * @param {string} args.cacheRoot
 * @returns {Promise<{ artifactHash: string, codeDir: string }>}
 */
async function extractZipArtifact({ artifactPath, cacheRoot }) {
  const artifactBuffer = await fs.readFile(artifactPath)
  const artifactHash = crypto
    .createHash('sha256')
    .update(artifactBuffer)
    .digest('hex')
  const codeDir = path.join(cacheRoot, artifactHash, 'code')
  const markerPath = path.join(cacheRoot, artifactHash, '.artifact.json')
  const markerPayload = JSON.stringify({ artifactPath, artifactHash })

  try {
    const existing = await fs.readFile(markerPath, 'utf8')
    if (existing === markerPayload) return { artifactHash, codeDir }
  } catch {
    // cache miss
  }

  await fs.rm(codeDir, { recursive: true, force: true })
  await fs.mkdir(codeDir, { recursive: true })

  await extractZipBuffer(artifactBuffer, codeDir)
  await fs.writeFile(markerPath, markerPayload)
  return { artifactHash, codeDir }
}

/**
 * Resolve Docker bind mounts for one Lambda invocation. `extraLayerMounts` is
 * intentionally present while empty so Lambda layer support can inject `/opt`
 * layer mounts without changing the Docker runner contract.
 *
 * @param {object} args
 * @param {string} args.functionKey
 * @param {string} [args.runtime]
 * @param {string | null} [args.artifactPath]
 * @param {string} [args.handlerPath]
 * @param {string} [args.handlerBaseDir]
 * @param {string} [args.codeDir]
 * @param {string} [args.servicePath]
 * @param {string} [args.cacheRoot]
 * @param {string | null} [args.dockerHostServicePath]
 * @param {boolean} [args.dockerReadOnly]
 * @returns {Promise<{ kind: string, codeDir: string, artifactHash?: string, codeMount: object, extraLayerMounts: object[], layerMounts: object[], mounts: object[] }>}
 */
export async function resolveDockerCodeMount({
  runtime = '',
  artifactPath = null,
  handlerPath,
  handlerBaseDir,
  codeDir,
  servicePath = process.cwd(),
  cacheRoot = path.join(servicePath, '.serverless-offline', 'docker-artifacts'),
  dockerHostServicePath = null,
  dockerReadOnly = true,
}) {
  const mode = dockerReadOnly ? 'ro' : 'rw'
  let sourcePath
  let target = '/var/task'
  let kind = 'source'
  let artifactHash

  if (artifactPath?.endsWith('.zip')) {
    ;({ artifactHash, codeDir: sourcePath } = await extractZipArtifact({
      artifactPath,
      cacheRoot,
    }))
    kind = 'zip-artifact'
  } else if (artifactPath?.endsWith('.jar')) {
    sourcePath = path.dirname(artifactPath)
    target = '/var/task/lib'
    kind = 'java-jar'
  } else if (artifactPath && /^provided\.(al2|al2023)$/.test(runtime)) {
    sourcePath = path.dirname(artifactPath)
    kind = 'bootstrap-artifact'
  } else {
    sourcePath =
      codeDir ??
      handlerBaseDir ??
      (handlerPath ? path.dirname(handlerPath) : servicePath)
  }

  const resolvedCodeDir = sourcePath
  const rewrittenSourcePath = rewriteDockerHostServicePath(sourcePath, {
    servicePath,
    dockerHostServicePath,
  })

  const codeMount = createMount(rewrittenSourcePath, target, mode)
  const extraLayerMounts = []
  return {
    kind,
    codeDir: resolvedCodeDir,
    ...(artifactHash ? { artifactHash } : {}),
    codeMount,
    extraLayerMounts,
    layerMounts: extraLayerMounts,
    mounts: [codeMount, ...extraLayerMounts],
  }
}
