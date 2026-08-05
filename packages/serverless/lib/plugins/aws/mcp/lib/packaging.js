// Everything the package phase does for an MCP server: get the prebuilt entry
// into the artifact, point the function at it, and tell it where the user's
// module ended up.
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rm,
  rmdir,
  stat,
} from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { log, ServerlessError } from '@serverless/util'

/**
 * Where the prebuilt entry sits, given the directory this module runs from.
 *
 * The release bundles this module into `dist/`, while the entry is a non-JS
 * asset the release scripts copy verbatim into the source-tree layout - so from
 * the bundle it has to be reached through that layout rather than relative to
 * the bundle. Same rewrite, for the same reason, as the dev-mode shim's
 * (`../../dev/index.js`), the delivery pattern this one copies.
 *
 * Split out from the value below so the bundled layout - which no unit test can
 * reach by importing this module - is pinned by a test rather than by the
 * release running: this is the path
 * `sf-core/scripts/prepareDistributionTarballs.js` has to copy the entry to.
 */
export const entryPathFrom = (moduleDir) =>
  path.join(
    moduleDir.endsWith('dist')
      ? path.join(moduleDir, '../lib/plugins/aws/mcp/lib')
      : moduleDir,
    '../entry/dist/entry.mjs',
  )

/** The prebuilt, self-contained entry - see `scripts/build-mcp-entry.js`. */
export const mcpEntrySourcePath = entryPathFrom(
  path.dirname(fileURLToPath(import.meta.url)),
)

// Staged inside the service dir rather than into `.serverless/`, because the
// esbuild zip is an explicit file list that only `package.patterns` can extend
// and both of its `globby` calls run without `dot: true` - a dot-path is
// unreachable that way. A non-dot directory works in both packaging modes: the
// classic packager globs the whole service dir anyway.
const stagedDirName = 'serverless-mcp'
const stagedEntryName = 'entry.mjs'

/** What `package.patterns` has to carry for the entry to reach the zip. */
export const stagedEntryPattern = `${stagedDirName}/**`

// `.mjs` rather than `index.js`: the zipped `package.json` is the user's, so
// its `type` field - and with it the loader Node picks for a `.js` file - is
// user-controlled, while the entry is ESM unconditionally.
export const mcpEntryHandler = `${stagedDirName}/${stagedEntryName.replace(/\.mjs$/, '')}.handler`

const stagedDirOf = (serviceDir) => path.join(serviceDir, stagedDirName)

/**
 * Whether an `entry.mjs` already at the staging path is one of ours.
 *
 * Absent is trivially fine. Present and byte-identical to the bundle about to be
 * copied can only be the leftover of a crashed run of this same version -
 * nothing else writes that content - so overwriting it costs nothing. Anything
 * else is the user's file, and the name alone does not make it ours: an entry
 * the Framework wrote is always exactly the bundle it ships.
 */
const isFrameworkEntry = async (stagedEntry, source) => {
  let existing
  try {
    existing = await readFile(stagedEntry)
  } catch {
    return true
  }
  return existing.equals(await readFile(source))
}

/**
 * Refuse to stage on top of anything the user owns.
 *
 * `unstageEntry` deletes what staging wrote, so without this check a service
 * that happens to keep sources in `serverless-mcp/` would have them removed by
 * a packaging run - and `serverless-mcp/entry.mjs` is a path a service is free
 * to have authored itself, which is why the file's content decides rather than
 * its name.
 */
const assertStageable = async (stagedDir, source) => {
  let stats
  try {
    stats = await stat(stagedDir)
  } catch {
    return
  }
  // Dot-entries do not count: `.DS_Store` and friends are dropped in by tools
  // rather than authored, so treating them as user sources would strand a
  // deploy over a file nobody would miss.
  const leftovers = stats.isDirectory()
    ? (await readdir(stagedDir)).filter(
        (name) => name !== stagedEntryName && !name.startsWith('.'),
      )
    : undefined
  if (
    leftovers !== undefined &&
    leftovers.length === 0 &&
    (await isFrameworkEntry(path.join(stagedDir, stagedEntryName), source))
  ) {
    return
  }
  throw new ServerlessError(
    `Packaging this service's MCP servers stages the MCP Lambda entry at "${stagedDirName}/${stagedEntryName}", but "${stagedDirName}" already exists and holds something the Framework did not write - other files, or an "${stagedEntryName}" that is not the entry this version stages. Move or rename it - the Framework removes what it stages there after packaging, so it will not write into a path it does not own.`,
    'MCP_ENTRY_STAGING_PATH_TAKEN',
    { stack: false },
  )
}

/**
 * Refuse to serve an MCP server from an artifact the user provided.
 *
 * A prebuilt `package.artifact` is deployed verbatim: both packagers
 * early-return on it (`../../../package/lib/package-service.js`), so
 * `package.patterns` is never evaluated and the staged entry reaches no zip -
 * while the handler is still swapped to it, leaving every invoke to fail with
 * ERR_MODULE_NOT_FOUND. There is nothing this integration can hook to fix that,
 * so it is a teaching error rather than a broken deploy.
 *
 * `serverFunctions` is the set of MCP server functions this packaging run
 * builds, so `deploy function` on an unrelated target is unaffected. The
 * service-level artifact counts regardless of `package.individually`: it is
 * skipped only for a function that sets `individually` on ITSELF, and a
 * synthesized MCP function has no `package` block to set it in.
 */
export const assertNoPrebuiltArtifact = ({
  servicePackage,
  serverFunctions,
}) => {
  const affected = serverFunctions
    .map(({ name, functionObject }) => ({
      name,
      artifact: functionObject?.package?.artifact ?? servicePackage?.artifact,
    }))
    .filter(({ artifact }) => artifact !== undefined)
  if (affected.length === 0) return
  const quoted = affected.map(({ name }) => `"${name}"`).join(', ')
  const artifacts = [...new Set(affected.map(({ artifact }) => artifact))]
    .map((artifact) => `"${artifact}"`)
    .join(', ')
  throw new ServerlessError(
    `MCP ${affected.length === 1 ? 'server' : 'servers'} ${quoted} would be deployed from the prebuilt artifact ${artifacts}, which is uploaded exactly as it is - so the MCP Lambda entry never reaches the artifact and the function fails at runtime with ERR_MODULE_NOT_FOUND. MCP servers are packaged by the Framework and cannot use a prebuilt "package.artifact" in this release: remove the artifact setting for this service, or move the MCP server to its own service.`,
    'MCP_PREBUILT_ARTIFACT_UNSUPPORTED',
    { stack: false },
  )
}

const addStagedPattern = (packageConfig) => {
  const patterns = (packageConfig.patterns = packageConfig.patterns ?? [])
  // Both `package` and `deploy function` stage, and a single `deploy` runs the
  // package lifecycle once - but nothing guarantees a given service model is
  // only staged into once.
  if (!patterns.includes(stagedEntryPattern)) patterns.push(stagedEntryPattern)
}

/**
 * Copy the prebuilt entry into the service dir and make packaging pick it up.
 *
 * `functionObjects` are the MCP server functions this run packages, and they
 * carry the pattern instead of the service under `package.individually`: a
 * service-level pattern merges into EVERY per-function zip - `getIncludes`
 * unions it into each classic per-function file list, and the esbuild plugin
 * unions it into each per-function zip the same way - which would put the
 * multi-megabyte entry in functions that have no use for it.
 *
 * `source` is injected so the tests do not depend on a built bundle.
 */
export const stageEntry = async ({
  serviceDir,
  servicePackage,
  functionObjects = [],
  source = mcpEntrySourcePath,
}) => {
  if (!existsSync(source)) {
    throw new ServerlessError(
      `The prebuilt MCP Lambda entry is missing at "${source}". In a source checkout it is a build product: run "npm run build:mcp:entry" in packages/serverless and retry. A released Serverless Framework ships it, so seeing this from an installed version is a bug - please report it at https://github.com/serverless/serverless/issues.`,
      'MCP_ENTRY_BUNDLE_MISSING',
      { stack: false },
    )
  }
  const stagedDir = stagedDirOf(serviceDir)
  await assertStageable(stagedDir, source)
  await mkdir(stagedDir, { recursive: true })
  await copyFile(source, path.join(stagedDir, stagedEntryName))
  if (servicePackage.individually !== true) {
    addStagedPattern(servicePackage)
    return
  }
  for (const functionObject of functionObjects) {
    addStagedPattern((functionObject.package = functionObject.package ?? {}))
  }
}

/**
 * Remove what `stageEntry` wrote.
 *
 * Called only by a run that staged, which the plugin tracks (`../index.js`): the
 * cleanup hooks fire on every command, including the ones that stage nothing, so
 * an unconditional delete here would remove a `serverless-mcp/entry.mjs` the
 * user authored on a bare `serverless info`.
 *
 * The directory goes only while it is empty, so a collision that somehow slipped
 * past `assertStageable` still cannot cost the user a file. Nothing runs after a
 * crash mid-package, which is why the staged name is deterministic: the leftover
 * is overwritten by the next run rather than accumulating.
 *
 * That fixed name plus a delete-at-end is a deliberate tradeoff, and its known
 * limitation is concurrency: two overlapping runs in one service directory race,
 * and the first to finish removes the entry the other still expects to zip. A
 * per-run unique name would trade that for leftovers no run ever cleans up
 * (nothing sweeps a directory of unknown names), and one service directory
 * packaged twice at once is not how the CLI is driven.
 */
export const unstageEntry = async ({ serviceDir }) => {
  const stagedDir = stagedDirOf(serviceDir)
  await rm(path.join(stagedDir, stagedEntryName), { force: true })
  try {
    await rmdir(stagedDir)
  } catch {
    // Absent, or still holding files that are not ours.
  }
}

// Mirrors the esbuild plugin's own `stripHandlerExportSuffix`
// (`lib/plugins/esbuild/index.js`): the LAST `.export` is stripped, so a path
// segment that happens to end in the export name survives.
const stripExportSuffix = (handler) => {
  const exportName = path.extname(handler)
  if (!exportName) return handler
  return handler.slice(0, handler.lastIndexOf(exportName))
}

/**
 * Where the user's server module lives inside the deployed artifact - the value
 * of SERVERLESS_MCP_SERVER_MODULE.
 *
 * `outputExtension` is what the esbuild plugin emits for this build, or
 * undefined in classic mode, where the source file is zipped verbatim and the
 * configured path is already right. In esbuild mode it is derived from the
 * handler rather than from the configured path, because the handler is what the
 * plugin derives its `outfile` from - the two cannot be allowed to disagree.
 */
export const artifactModulePath = ({ sourcePath, handler, outputExtension }) =>
  outputExtension === undefined
    ? sourcePath
    : `${stripExportSuffix(handler)}${outputExtension}`

// The domains plugin's own sentinel for "no base-path mapping"
// (`../../domains/globals.js`).
const NO_BASE_PATH = '(none)'

// `evaluateBoolean(config.enabled, true)` in `../../domains/models/domain-config.js`.
const isEnabled = (value) =>
  value === undefined ||
  !['false', '0'].includes(String(value).toLowerCase().trim())

// Close to `DomainConfig._getBasePath`, deliberately not the same: slashes are
// stripped repeatedly rather than once, and the reserved-path warning plus the
// `(none)` default belong to the domains plugin. What has to agree is the answer
// for the shapes that reach a base-path mapping - a name and an optional prefix.
const basePathOf = (basePath) => {
  if (typeof basePath !== 'string') return undefined
  const trimmed = basePath.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  return trimmed === '' || trimmed === NO_BASE_PATH ? undefined : trimmed
}

// A domain entry either names its API type through `apiType` or nests the whole
// config under one (`../../domains/index.js`). An entry that names neither picks
// up the type detected from the compiled template - which, for a service the
// mcp plugin contributed a REST API to, is REST unless the service also
// defines an HTTP or websocket API. That ambiguity is why only an unset or
// explicitly `rest` type counts here.
const API_TYPES = ['http', 'rest', 'websocket']

const restCandidatesOf = (entry) => {
  const config = typeof entry === 'string' ? { name: entry } : entry
  if (config === null || typeof config !== 'object') return []
  const nested = API_TYPES.filter((apiType) => config[apiType])
  if (nested.length > 0) {
    return nested
      .filter((apiType) => apiType === 'rest')
      .map((apiType) => config[apiType])
  }
  const apiType = config.apiType?.toLowerCase()
  return apiType === undefined || apiType === 'rest' ? [config] : []
}

/**
 * The public origin (plus base-path prefix) MCP clients reach this service on,
 * or undefined when the service is only reachable through the raw execute-api
 * URL, which the entry can read off the request itself.
 *
 * The base-path mapping of a REST custom domain is stripped before the function
 * is invoked, so it is the one prefix the entry cannot recover from the event -
 * hence this value, which overrides the entry's own derivation wholesale
 * (`../entry/lib/compose.mjs`, `clientFacingLocation`).
 *
 * Only a REST-facing domain qualifies: MCP servers are exposed through
 * the REST API, so a domain in front of an HTTP or websocket API says nothing
 * about their URL. Two REST domains leave the answer ambiguous, so nothing is
 * set and the request-derived value stands.
 */
export const publicBaseUrl = (provider) => {
  // Both keys accept a single entry as well as a list - the provider schema
  // takes a bare object for `domains` too - so they are normalized the same way
  // the domains plugin normalizes them (`[].concat`, `../../domains/index.js`),
  // and on the same truthiness check, rather than spread as if they were arrays.
  const entries = [].concat(provider?.domain || [], provider?.domains || [])
  const candidates = entries
    .flatMap(restCandidatesOf)
    .filter((config) => isEnabled(config.enabled))
    .map((config) => ({
      name: config.name || config.domainName,
      basePath: basePathOf(config.basePath),
    }))
    .filter((candidate) => typeof candidate.name === 'string')
  if (candidates.length === 0) return undefined
  if (candidates.length > 1) {
    log.debug(
      `mcp: ${candidates.length} custom domains front this service's REST API (${candidates
        .map(({ name }) => name)
        .join(
          ', ',
        )}), so SERVERLESS_MCP_PUBLIC_BASE_URL is left unset and each request's own host is used instead`,
    )
    return undefined
  }
  const [{ name, basePath }] = candidates
  // API Gateway custom domains serve HTTPS only.
  return `https://${name}${basePath === undefined ? '' : `/${basePath}`}`
}

/**
 * Warn when a service bundles part of itself and leaves an MCP server out.
 *
 * The zero-config esbuild predicate builds a Node function only when its entry
 * resolves to TypeScript (`_shouldBuildFunction`, `lib/plugins/esbuild/index.js`),
 * so `crm: src/crm.ts` alongside `docs: src/docs.mjs` is a mixed service without
 * anyone asking for one - and so is a single `.ts` handler of the user's own
 * next to MCP servers that are all `.mjs`, which is the same breakage with
 * nothing in the mcp block to hint at it. That is not two packaging modes side
 * by side: the bundler's own service-level zip sets `package.artifact`, and the
 * classic packager early-returns on it
 * (`../../../package/lib/package-service.js`) - so the unbundled server's file
 * reaches no zip at all and its function fails at runtime with
 * ERR_MODULE_NOT_FOUND.
 */
export const warnPartiallyBundledServers = (names) => {
  const quoted = names.map((name) => `"${name}"`).join(', ')
  log.warning(
    `esbuild bundles part of this service but not the MCP ${names.length === 1 ? 'server' : 'servers'} ${quoted}: a JavaScript entry is only bundled when "build.esbuild" asks for it, while a TypeScript one is bundled by default - and any bundled function at all, MCP server or not, is enough. A service that bundles anything is packaged from the bundler's own file list, so ${names.length === 1 ? 'that server' : 'those servers'} would be left out of the artifact and fail at runtime with ERR_MODULE_NOT_FOUND. Give every MCP server a TypeScript entry, or set "build.esbuild" so it covers all of them.`,
  )
}

// The packages an MCP server module imports that the entry does NOT bundle for
// it: the entry carries its own copies, but the user's module is resolved
// against the artifact's own `node_modules`. `@modelcontextprotocol/sdk` is the
// pre-rename spelling, still what most existing servers import.
const RUNTIME_MODULES = [
  '@modelcontextprotocol/server',
  '@modelcontextprotocol/sdk',
  'zod',
]

/**
 * Warn when classic packaging is about to strip a module the deployed server
 * imports.
 *
 * `excludeDevDependencies` defaults to on, and it removes dev-only packages from
 * the zip (`../../../package/lib/zip-service.js`) - the server then fails at
 * runtime with ERR_MODULE_NOT_FOUND, which says nothing about packaging. Only
 * classic mode is affected: esbuild bundles the user's imports into the output.
 */
export const warnStrippedDevDependencies = async ({
  serviceDir,
  servicePackage,
}) => {
  if (servicePackage?.excludeDevDependencies === false) return
  let devDependencies
  try {
    devDependencies = JSON.parse(
      await readFile(path.join(serviceDir, 'package.json'), 'utf8'),
    ).devDependencies
  } catch {
    // No package.json, or one this run has no business failing over - the
    // classic packager reads it itself and owns any error it deserves.
    return
  }
  if (devDependencies === null || typeof devDependencies !== 'object') return
  for (const name of RUNTIME_MODULES) {
    if (!(name in devDependencies)) continue
    log.warning(
      `"${name}" is a devDependency of this service, and packaging removes devDependencies from the artifact - so an MCP server importing it will fail at runtime with ERR_MODULE_NOT_FOUND. Move "${name}" to "dependencies", or set "package.excludeDevDependencies: false".`,
    )
  }
}
