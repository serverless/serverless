/**
 * Node.js functions on this machine: the CLI's own Node.js runs the Framework's runtime client,
 * which imports the build's output when the Framework built the function, or the source file
 * otherwise (TypeScript through the tsx loader).
 */
import fs from 'fs'
import path from 'path'
import { spawn as nodeSpawn } from 'child_process'
import { CLIENT_FILES, clientPath, tsxLoaderUrl } from '../paths.js'
import { workerSpawnOptions } from './spawn-options.js'
import { mcpEntrySourcePath } from '../../../mcp/lib/packaging.js'
import { esbuildBuildState } from '../../../mcp/lib/esbuild-build-state.js'
import { localMcpVariables, mcpServersOf } from '../mcp.js'

const BUILT_EXTENSIONS = ['.js', '.mjs', '.cjs']
// Every extension the Framework's build compiles, after the ones Node.js runs as they are.
const SOURCE_EXTENSIONS = [
  ...BUILT_EXTENSIONS,
  '.ts',
  '.mts',
  '.cts',
  '.tsx',
  '.jsx',
]
// Run through the tsx loader.
const NEEDS_LOADER = /\.([cm]?ts|[tj]sx)$/
const TYPESCRIPT = /\.([cm]?ts|tsx)$/
const NEEDED = 'Node.js 18.19, 20.6 or later'
// An MCP server function runs the prebuilt MCP entry, which is built for Node.js 20: with the
// client's own floor, 20.6.
const MCP_NEEDED = 'Node.js 20.6 or later'

export const DECORATOR_METADATA_WARNING =
  "tsconfig.json sets emitDecoratorMetadata, which Dev Mode's TypeScript loader does not emit: code that relies on it, such as dependency injection, can fail on this machine."

/**
 * The client starts with `--import`, and the tsx loader registers through `module.register`:
 * Node.js has both from 18.19 and 20.6 (never in 19). The CLI itself starts on any Node.js 18.
 */
const runsClient = (version) => {
  const [major, minor] = String(version ?? '')
    .split('.')
    .map(Number)
  if (major === 18) return minor >= 19
  if (major === 20) return minor >= 6
  return major > 20
}

const majorOf = (version) => Number(String(version ?? '').split('.')[0])

/**
 * `src/api.main` → module `src/api`, export `main`: the export starts at the first dot of the file
 * name, as in Lambda. Without that dot there is no export (null): Lambda's runtime refuses such a
 * handler as Runtime.MalformedHandlerName, and so does the client.
 */
export const splitHandler = (handler) => {
  const value = String(handler ?? '')
  const dot = value.indexOf('.', value.lastIndexOf('/') + 1)
  if (dot === -1) return { modulePath: value, exportPath: null }
  return { modulePath: value.slice(0, dot), exportPath: value.slice(dot + 1) }
}

/** The handler's file under `root` with the first of `extensions` that exists, or null. */
const existingHandlerFile = ({ root, modulePath, extensions, exists }) => {
  for (const extension of extensions) {
    const file = path.join(root, `${modulePath}${extension}`)
    if (exists(file)) return file
  }
  return null
}

const findHandlerFile = (options) =>
  existingHandlerFile(options) ??
  // Not found: the client reports it as Lambda would, as Runtime.ImportModuleError.
  path.join(options.root, `${options.modulePath}.js`)

/**
 * The extensions a built handler can have when the build did not name its file (a build plugin
 * other than the Framework's), the bundler's own first. A leftover with another extension can sit
 * next to today's file (an `outExtension` change) and must not be the one found.
 */
const builtExtensions = async (serverless) => {
  try {
    const { outputExtension } = await esbuildBuildState({
      plugins: serverless?.pluginManager?.plugins ?? [],
    })
    return outputExtension ? [outputExtension] : BUILT_EXTENSIONS
  } catch {
    return BUILT_EXTENSIONS
  }
}

const emitsDecoratorMetadata = (serviceDir, readFile) => {
  try {
    return /"emitDecoratorMetadata"\s*:\s*true/.test(
      readFile(path.join(serviceDir, 'tsconfig.json'), 'utf8'),
    )
  } catch {
    return false
  }
}

/**
 * The directory a Node.js function's code runs from here, its task root: the build's output when
 * a dev build built the function (`built`), the service directory otherwise.
 */
export const nodeCodeRoot = ({ built, serviceDir }) =>
  built ? path.join(serviceDir, '.serverless', 'build') : serviceDir

export const nodeAdapter = Object.freeze({
  name: 'node',
  label: 'Node.js',
  matches: (runtime) => String(runtime ?? '').startsWith('nodejs'),
  deployedVersion: (runtime) =>
    /^nodejs(\d+)/.exec(String(runtime ?? ''))?.[1] ?? null,
  localVersionKey: (version) => String(version ?? '').split('.')[0],
  /** Whether this machine's Node.js (detected and usable) runs the function: `mcp` for an MCP server. */
  runsLocally: (local, { mcp = false } = {}) =>
    !mcp || majorOf(local?.version) >= 20,
  missingWhy: (runtime, local, { mcp = false } = {}) => {
    if (!local?.version)
      return `${mcp ? MCP_NEEDED : NEEDED} needed on this machine`
    return mcp
      ? `Node.js ${local.version} on this machine (MCP servers need ${MCP_NEEDED})`
      : `Node.js ${local.version} on this machine (Dev Mode needs ${NEEDED})`
  },
  /**
   * Whether the handler's source file is in the service directory, as `prepare` finds it for a
   * function the build does not build (one deployed from `package.artifact`).
   */
  hasHandler: ({ functionConfig = {}, serviceDir, exists = fs.existsSync }) =>
    existingHandlerFile({
      root: serviceDir,
      modulePath: splitHandler(functionConfig.handler).modulePath,
      extensions: SOURCE_EXTENSIONS,
      exists,
    }) !== null,
  async detectLocal({
    nodeVersion = process.versions.node,
    execPath = process.execPath,
  } = {}) {
    return runsClient(nodeVersion)
      ? { available: true, command: execPath, version: nodeVersion }
      : { available: false, command: null, version: nodeVersion }
  },
  async prepare({
    serverless,
    functionKey,
    functionConfig = {},
    serviceDir,
    resolveTsx = tsxLoaderUrl,
    exists = fs.existsSync,
    readFile = fs.readFileSync,
    built = false,
    // The handler file the build wrote, relative to the build directory: the one to run.
    builtFile = null,
  }) {
    const codeRoot = nodeCodeRoot({ built, serviceDir })
    if (mcpServersOf(serverless).has(functionKey)) {
      return {
        codeRoot,
        handlerFile: mcpEntrySourcePath,
        exportPath: 'handler',
        loader: null,
        env: await localMcpVariables({
          serverless,
          functionKey,
          functionConfig,
          built,
        }),
        nodeOptionsAppend: ['--enable-source-maps'],
        warnings: [],
      }
    }
    const { modulePath, exportPath } = splitHandler(functionConfig.handler)
    const handlerFile =
      built && builtFile
        ? path.join(codeRoot, builtFile)
        : findHandlerFile({
            root: codeRoot,
            modulePath,
            extensions: built
              ? await builtExtensions(serverless)
              : SOURCE_EXTENSIONS,
            exists,
          })
    const typescript = TYPESCRIPT.test(handlerFile)
    return {
      codeRoot,
      handlerFile,
      exportPath,
      loader: NEEDS_LOADER.test(handlerFile) ? resolveTsx() : null,
      env: {},
      nodeOptionsAppend: ['--enable-source-maps'],
      warnings:
        typescript && emitsDecoratorMetadata(serviceDir, readFile)
          ? [DECORATOR_METADATA_WARNING]
          : [],
    }
  },
  /**
   * Returns the child process: whoever starts it stops it (on Windows nothing else will). On POSIX
   * it leads its own process group (see `workerSpawnOptions`).
   */
  start({
    local,
    prepared,
    env,
    colors = false,
    deployedRuntime,
    serviceDir,
    spawn = nodeSpawn,
    platform = process.platform,
  }) {
    const config = {
      handlerFile: prepared.handlerFile,
      exportPath: prepared.exportPath,
      taskRoot: prepared.codeRoot,
      serviceDir,
      deployedRuntime,
      colors,
      // The client exits once this process, the one that spawns it, is gone.
      parentPid: process.pid,
      // It leads its own process group (see `workerSpawnOptions`), which it takes with it then.
      ownGroup: platform !== 'win32',
    }
    return spawn(
      local.command,
      [
        ...(prepared.loader ? ['--import', prepared.loader] : []),
        clientPath(CLIENT_FILES.node),
        JSON.stringify(config),
      ],
      workerSpawnOptions({ cwd: prepared.codeRoot, env, platform }),
    )
  },
})
