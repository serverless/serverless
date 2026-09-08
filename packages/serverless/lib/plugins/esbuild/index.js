import path from 'path'
import { pathToFileURL } from 'url'
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'fs/promises'
import { createWriteStream, existsSync } from 'fs'
import * as esbuild from 'esbuild'
import { ZipArchive } from 'archiver'
import spawnExt from 'child-process-ext/spawn.js'
import _ from 'lodash'
import pLimit from 'p-limit'
import { globby } from 'globby'
import micromatch from 'micromatch'
import ServerlessError from '../../serverless-error.js'
import { log } from '@serverless/util'
import { resolveServerlessConfigFileExcludes } from '../package/lib/package-service.js'
import {
  compilePatterns,
  filterPaths,
  isDirIncluded,
  isPathIncluded,
} from '../../utils/package-patterns.js'
import {
  applyTsconfigCompileFilter,
  detectOutputCollisions,
  nearestPackageJsonType,
  outputPathFor,
  scanUnresolvableRelativeImports,
  splitCompileAndCopy,
  sweepProjectFiles,
  toSweptPath,
} from './project-sweep.js'

const nodeRuntimeRe = /nodejs(?<version>\d+).x/

// Every extension the plugin will probe when turning a `handler` string into a
// source file. Single source of truth so the "checked extensions" wording in
// the unresolvable-handler error can never drift from what is actually probed.
const BUILDABLE_HANDLER_EXTENSIONS = [
  '.js',
  '.ts',
  '.cjs',
  '.mjs',
  '.cts',
  '.mts',
  '.jsx',
  '.tsx',
]

// The files classic packaging drops from every artifact no matter how the
// service is configured. Mirrors `defaultExcludes` in
// `lib/plugins/package/lib/package-service.js`, minus the entries the project
// sweep already handles itself (`.git`, `.serverless`, `.serverless_plugins`).
const CLASSIC_DEFAULT_EXCLUDES = [
  '.gitignore',
  '.DS_Store',
  'npm-debug.log',
  'yarn-*.log',
]

// Env files never reach an artifact. This is deliberately stricter than
// classic packaging on two counts: classic drops them only when `useDotenv` is
// set, and only at the service root. Here the rule is unconditional and
// applies at any depth, because a file of secrets in a Lambda package is the
// same hazard wherever it sits, and the framework reads these files at deploy
// time — the values a function needs have already become environment variables
// by the time it runs. A service that genuinely needs the file at runtime (the
// `dotenv`-at-startup pattern) asks for it with a positive `package.patterns`
// entry: exclusions are leading negations, so any later positive match — the
// file's own name or a glob that covers it — re-includes it.
const DOTENV_EXCLUDE = '**/.env*'

// How many raw file copies run at once during a non-bundled build. A large
// service can sweep tens of thousands of files, and an unbounded `Promise.all`
// over them opens every source and destination descriptor at the same time,
// which is an EMFILE away from failing the build on default ulimits.
const COPY_CONCURRENCY = 32

// How many `file → specifier` pairs the extensionless-import warning prints
// before it stops naming them and just counts. A half-migrated service can
// produce hundreds, and a wall of them buries every other line of build
// output; ten is enough to recognize the pattern and go fix it.
const ESM_SPECIFIER_WARNING_LIMIT = 10

// Build-dir root entries the artifact walk never picks up.
//
// `node_modules` is appended separately, by its own sorted walk, so picking it
// up here would append every dependency file twice.
//
// The Yarn PnP runtime and cache belong to the developer's resolution setup:
// `.yarn/cache` alone is routinely larger than the whole artifact. The project
// sweep already keeps them out of the build directory by default, so what
// reaches it is a Yarn Berry install run inside it — and none of them shipped
// before the artifact became "everything in the build directory" either.
//
// These are default exclusions, not a hard rule: a positive `package.patterns`
// entry gets the last word here as everywhere else. Files a pattern put under
// one of these roots are recorded in `patternClaimedBuildPaths` and the walk
// keeps exactly those (see `_collectBuildDirEntries`).
const BUILD_DIR_EXCLUDED_ROOT_ENTRIES = new Set([
  'node_modules',
  '.yarn',
  '.pnp.cjs',
  '.pnp.loader.mjs',
  // Copied in by `_preparePackageJson` so that a pnpm install run inside the
  // build directory puts node_modules there. It is the install's scaffolding,
  // not the function's, and no earlier release packaged it.
  'pnpm-workspace.yaml',
  'pnpm-workspace.yml',
])

// The artifact's own manifest: `package.json` as `_preparePackageJson`
// generates it, and the lockfile copied beside it. Function-level negations
// slim a function's archive, but these are the plugin's files, not project
// files, and every earlier release shipped them unconditionally. For a
// `"type": "module"` service emitting `.js`, the manifest is the only thing
// telling Lambda to load the handler as ES module code; a classic slimming
// idiom such as `!**/*.json` would otherwise deploy a function that fails at
// initialization with no diagnostic at build time.
const ARTIFACT_MANIFEST_ENTRIES = new Set([
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
])

// esbuild's own build metadata: `meta.json` from the bundling path, and one
// `meta.<class><format>.json` per partition from the non-bundled one. A regex
// rather than a glob because every character in these names is literal.
const BUILD_METAFILE_RE = /^meta\.(?:[^/]*\.)?json$/

// Directories `package.patterns` can never select, whatever the patterns say.
// `.serverless` holds the build directory itself (selecting it would nest a
// copy of the artifact inside the artifact) and `.git` is never part of a
// deployment package. The configured `--package` directory belongs in the same
// class and is appended per instance by `_packageDirectoryIgnores`.
//
// `node_modules` is deliberately NOT here. Writing the service's own tree over
// the one installed into the build directory from the pruned package.json would
// corrupt the install — which `_resetBuildDir` then preserves into every later
// deploy — so the COPY step refuses those paths (see
// `isInstalledDependencyPath`). Refusing to package them is a different thing
// entirely, and dropping them here did exactly that: a positive pattern naming
// a vendored or patched dependency silently produced an artifact without it.
const PATTERN_RESOLVE_IGNORE = ['.serverless/**', '.git/**']

// A pattern match that lands on the installed dependency tree at the artifact
// root. Only the root tree is the install; a nested `packages/x/node_modules/y`
// is just another project file and is copied like any other.
const isInstalledDependencyPath = (zipPath) =>
  zipPath === 'node_modules' || zipPath.startsWith('node_modules/')

// Where a `package.patterns` match lands in the artifact. A pattern that reaches
// above the service directory (`../shared/**`) comes back from globby as a
// `../`-prefixed path; an archive has no parent directory to put that in, so
// the leading segments come off and the file sits at what remains
// (`shared/x.json`). archiver applies exactly this rule to every entry name it
// is handed, which is how classic packaging and every earlier esbuild release
// placed such files. It is applied here explicitly, before the path is used,
// so the build-directory copy, the dedup against the installed tree and the
// post-zip handler assertion all see the entry the archive will actually hold.
const archivePathFor = (relativePath) =>
  path.posix.normalize(relativePath).replace(/^(\.\.\/)+/, '')

const logger = log.get('esbuild')

// Serverless `handler` strings are `path/to/file.exportName`. Strip only the
// LAST `.exportName` occurrence (not the first) so that a path segment
// earlier in the string that happens to collide with the export name (e.g. a
// directory named after the handler, `items.get/index.get`) doesn't cause the
// wrong file path to be derived. Mirrors the community serverless-esbuild
// plugin's deliberate `lastIndexOf` approach: "replace only last instance to
// allow the same name for file and handler".
const stripHandlerExportSuffix = (functionHandler) => {
  const exportName = path.extname(functionHandler) // '.get' for 'src/items.get'
  if (!exportName) return functionHandler
  return functionHandler.slice(0, functionHandler.lastIndexOf(exportName))
}

// Compare two arrays as sets (order- and duplicate-insensitive). Used to
// detect whether functions sharing a handler file resolved to the same
// esbuild `external` list.
const areSameSet = (a, b) => {
  const setA = new Set(a)
  const setB = new Set(b)
  if (setA.size !== setB.size) return false
  for (const value of setA) {
    if (!setB.has(value)) return false
  }
  return true
}

// Pin every archive entry to a fixed date so that identical content always
// produces a byte-for-byte identical zip. Without this, archiver stamps each
// entry with the source file's mtime (esbuild rewrites its output on every
// build), so the artifact hash changes on every deploy and check-for-changes
// forces a needless redeploy of every function (issue #4240).
const PINNED_ARTIFACT_DATE = new Date(0)

// lstat (not stat) so that a symlink becomes a symlink entry, which is what
// this path has always produced. An unreadable file fails packaging (same
// contract as the classic packaging path) — archiver's own stat queue would
// silently drop the entry and ship an incomplete artifact.
const lstatEntry = async (sourcePath) => {
  try {
    return await lstat(sourcePath)
  } catch (error) {
    throw new ServerlessError(
      `Cannot read file ${sourcePath} due to: ${error.message}`,
      'CANNOT_READ_FILE',
    )
  }
}

// A pinned date alone doesn't make the zip reproducible: archiver resolves
// `zip.file()` calls without `stats` through an internal stat queue with
// concurrency 4, so entries land in the archive in lstat-completion order,
// which races between runs and changes the whole-zip bytes (and therefore the
// sha256 used by check-for-changes). Pre-fetching the stats makes archiver
// enqueue the entry synchronously, so entries appear strictly in call order.
// `stats` may be supplied by a caller that already had to look them up, so
// that the entry is never lstat'ed twice.
// `mode` — optional — overrides the mode archiver would take off the
// filesystem. Left undefined (the default) the entry keeps the stats-derived
// mode, so callers that only want deterministic ORDER are untouched; callers
// that also need deterministic PERMISSIONS pass a normalized value, because
// the same tree installed under a different umask otherwise hashes
// differently.
const appendFileEntry = async (zip, sourcePath, name, stats, mode) => {
  zip.file(sourcePath, {
    name,
    date: PINNED_ARTIFACT_DATE,
    stats: stats ?? (await lstatEntry(sourcePath)),
    ...(mode === undefined ? {} : { mode }),
  })
}

// The mode the artifact records for a walked entry, independent of the umask
// the tree was created under: 0755 for directories and for anything carrying
// the owner-executable bit, 0644 otherwise. Windows has no executable bit and
// reports none, so everything there is marked executable rather than stripping
// the bit off files that need it.
const normalizedEntryMode = (stats) =>
  stats.isDirectory()
    ? 0o755
    : stats.mode & 0o100 || process.platform === 'win32'
      ? 0o755
      : 0o644

// Deterministic replacement for zip.directory(): expand the tree ourselves
// and append sequentially in sorted order. zip.directory()'s async walk
// feeds the archive in readdir order, which differs per filesystem/volume
// (e.g. ext4 hashes directory entries with a per-filesystem seed), so the
// same unchanged service hashed differently between machines — a laptop
// deploy followed by a CI deploy saw phantom diffs. The globby options
// reproduce zip.directory's walk entry-for-entry: directory entries included
// (empty ones too), symlinks kept as symlinks, nothing followed.
//
// `filter(entry, stats)` — optional — decides per entry whether it is
// appended; `entry` is the walk-relative posix path and `stats` are its
// (already fetched) lstat results, so the caller can tell directories from
// files. Filtering happens after the sort, so it can never reorder anything.
//
// `normalizeEntryModes` — optional — records a umask-independent mode for
// every appended entry instead of the filesystem's. Enabled only for the
// node_modules walk, where the tree comes from a package manager install
// whose permissions vary between machines; the include expansion keeps the
// source tree's own modes, as it always has.
const appendDirectoryEntries = async (
  zip,
  dirPath,
  destPath,
  filter,
  normalizeEntryModes = false,
) => {
  const entries = (
    await globby('**', {
      cwd: dirPath,
      dot: true,
      onlyFiles: false,
      followSymbolicLinks: false,
    })
  ).sort()
  for (const entry of entries) {
    const sourcePath = path.join(dirPath, entry)
    const stats = await lstatEntry(sourcePath)
    if (filter && !filter(entry, stats)) continue
    await appendFileEntry(
      zip,
      sourcePath,
      `${destPath}/${entry}`,
      stats,
      normalizeEntryModes ? normalizedEntryMode(stats) : undefined,
    )
  }
}

// The file-vs-directory probe for a package-pattern include (stat, following
// symlinks, as the include pipeline always has) with the same failure
// contract as appendFileEntry.
const statIncludeEntry = async (absolutePath) => {
  try {
    return await stat(absolutePath)
  } catch (error) {
    throw new ServerlessError(
      `Cannot read file ${absolutePath} due to: ${error.message}`,
      'CANNOT_READ_FILE',
    )
  }
}

// Builds the per-artifact node_modules entry filter and its counters. One
// shared factory for both packaging paths, so the twin filters cannot drift.
// The `excludedNodeModulesEntryCount` counter is scoped to the node_modules
// walk: only it can attest that the patterns removed dependencies, which is
// what the emptied-node_modules warning claims. `excludedEntryCount` also
// absorbs filtered additive includes and build-directory entries at the call
// sites. `excludedNodeModulesFileCount` narrows the walk-scoped count to FILES,
// because directory entries are structure rather than payload: a node_modules
// holding nothing but empty directories loses no dependency when a pattern
// strips those husks, and the warning must not claim otherwise.
const createNodeModulesEntryFilter = (compiledPatterns) => {
  const counters = {
    excludedEntryCount: 0,
    excludedNodeModulesEntryCount: 0,
    excludedNodeModulesFileCount: 0,
    includedNodeModulesFileCount: 0,
  }
  const filter = (entry, stats) => {
    // `entry` is relative to the walked directory, so it has to be
    // re-prefixed to match patterns written against the zip root.
    const entryZipPath = `node_modules/${entry}`
    const isDirectory = stats.isDirectory()
    const included = isDirectory
      ? isDirIncluded(compiledPatterns, entryZipPath)
      : isPathIncluded(compiledPatterns, entryZipPath)
    if (!included) {
      counters.excludedEntryCount += 1
      counters.excludedNodeModulesEntryCount += 1
      if (!isDirectory) {
        counters.excludedNodeModulesFileCount += 1
      }
      return false
    }
    if (!isDirectory) {
      counters.includedNodeModulesFileCount += 1
    }
    return true
  }
  return { filter, counters }
}

class Esbuild {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options || {}
    this._functions = undefined
    // Set once the `packages: external` / empty-node_modules warning has been
    // emitted, so that it is reported per invocation rather than per function.
    this._nodeModulesExclusionWarned = false

    // Captured once at construction so the reset target stays stable: `invoke
    // local` and `offline` repoint the live service path AT this directory
    // (see `_setConfigForLocalInvocation`), and a value derived after that
    // would nest a second `.serverless/build` inside the build output.
    // `serviceDir` is null when the CLI runs outside a service (e.g.
    // `serverless create`) — the plugin is still constructed there, but
    // nothing is ever built.
    this.buildDirPath = this.serverless.config.serviceDir
      ? path.join(this.serverless.config.serviceDir, '.serverless', 'build')
      : undefined

    // Build-directory paths under a `BUILD_DIR_EXCLUDED_ROOT_ENTRIES` root
    // that a positive pattern selected (see `_claimBuildPaths`). Reset per
    // build; empty when packaging runs on a build directory this instance did
    // not populate.
    this.patternClaimedBuildPaths = new Set()

    this._buildProperties = _.memoize(this._buildProperties.bind(this))
    this._readPackageJson = _.memoize(this._readPackageJson.bind(this))

    this.hooks = {
      'before:dev-build:build': async () => {
        if (await this._shouldRun('originalHandler')) {
          await this._build('originalHandler')
        }
      },
      'after:dev-build:build': async () => {},
      'before:invoke:local:invoke': async () => {
        if (await this._shouldRun()) {
          await this._build()
          this._setConfigForLocalInvocation()
        }
      },
      // Make sure we build for the serverless-offline plugin too
      'before:offline:start': async () => {
        if (await this._shouldRun()) {
          await this._build()
          this._setConfigForLocalInvocation()
        }
      },
      'before:package:createDeploymentArtifacts': async () => {
        if (await this._shouldRun()) {
          await this._build()
          await this._preparePackageJson()
          await this._package()
        }
      },
      'before:deploy:function:packageFunction': async () => {
        if (await this._shouldRun()) {
          await this._build()
          await this._preparePackageJson()
          await this._package()
        }
      },
      'before:esbuild-package': async () => {},
    }

    this.commands = {
      'esbuild-package': {
        groupName: 'main',
        options: {},
        usage:
          'Internal hook for esbuild to call for packaging logic prior to internal packaging',
        lifecycleEvents: ['package'],
        type: 'entrypoint',
      },
    }
  }

  async asyncInit() {
    this._defineSchema()
  }

  _defineSchema() {
    this.serverless.configSchemaHandler.defineBuildProperty('esbuild', {
      description: `esbuild configuration for bundling TypeScript/JavaScript.
@since v4
@see https://www.serverless.com/framework/docs/providers/aws/guide/building#esbuild`,
      anyOf: [
        {
          type: 'object',
          properties: {
            // The node modules that should not be bundled
            external: {
              description: `Node modules to exclude from bundle.
@example ['aws-sdk']`,
              type: 'array',
              items: { type: 'string' },
            },
            // These are node modules that should not be bundled but also not included in the package.json
            exclude: { type: 'array', items: { type: 'string' } },
            // The packages config, this can be set to override the behavior of external
            packages: { type: 'string', enum: ['external'] },
            buildConcurrency: {
              description: `Number of concurrent unique handler-file builds and per-function packaging operations. Functions sharing a handler file are built once, and by default all unique handler files are built concurrently.`,
              type: 'number',
            },
            // Whether to bundle or not. Default is true
            bundle: { type: 'boolean' },
            tsconfig: {
              description: `Path to a tsconfig file used to select which TypeScript sources are compiled when bundle is false, and passed to esbuild for compilerOptions.
@example './tsconfig.build.json'
@since v4`,
              type: 'string',
              // An empty string would resolve to the service directory and be
              // read as "discover one for me", which is not what anyone who
              // wrote `tsconfig: ''` meant.
              minLength: 1,
            },
            outExtension: {
              description: `Output file extension for the bundled handlers, e.g. { '.js': '.mjs' } to emit ES module bundles.
@example { '.js': '.mjs' }`,
              type: 'object',
              properties: {
                '.js': { type: 'string', enum: ['.js', '.cjs', '.mjs'] },
              },
            },
            // Whether to minify or not. Default is false
            minify: { type: 'boolean' },
            // If set to a boolean, true, then framework uses external sourcemaps and enables it on functions by default.
            sourcemap: {
              description: `Sourcemap generation configuration.
@see https://www.serverless.com/framework/docs/providers/aws/guide/building#configuration`,
              anyOf: [
                { type: 'boolean' },
                {
                  type: 'object',
                  properties: {
                    type: {
                      description: `Sourcemap generation type.
@default 'linked'`,
                      type: 'string',
                      enum: ['inline', 'linked', 'external'],
                    },
                    setNodeOptions: {
                      description: `Whether to set NODE_OPTIONS=--enable-source-maps.
@default false`,
                      type: 'boolean',
                    },
                  },
                },
              ],
            },
          },
        },
        { type: 'boolean' },
      ],
    })
  }

  async _shouldRun(handlerPropertyName = 'handler') {
    const functions = await this.functions(handlerPropertyName)
    return Object.keys(functions).length > 0
  }

  /**
   * Get a record of functions that should be built by esbuild
   */
  async functions(handlerPropertyName = 'handler') {
    if (this._functions) {
      return this._functions
    }

    const functions = this.options.function
      ? {
          [this.options.function]: this.serverless.service.getFunction(
            this.options.function,
          ),
        }
      : this.serverless.service.functions

    const functionsToBuild = {}

    for (const [alias, functionObject] of Object.entries(functions)) {
      const shouldBuild = await this._shouldBuildFunction(
        functionObject,
        handlerPropertyName,
      )
      if (shouldBuild) {
        functionsToBuild[alias] = functionObject
      }
    }

    this._functions = functionsToBuild

    return functionsToBuild
  }

  static WillEsBuildRun(
    configFile,
    serviceDir,
    handlerPropertyName = 'handler',
  ) {
    if (!configFile || configFile?.build?.esbuild === false) {
      return false
    }

    const functions = configFile.functions || {}

    const willRun = Object.entries(functions).some(([, functionObject]) => {
      // If user provided a function-level artifact, do not build this function
      if (functionObject?.package?.artifact) {
        return false
      }

      // If user provided a service-level artifact and packaging is not individual for this function,
      // do not build this function
      const servicePackage = configFile.package || {}
      const functionPackage = functionObject.package || {}
      const isFunctionPackagedIndividually =
        functionPackage.individually === true
      // If a service-level artifact is provided and the function itself is not individually packaged,
      // do not build this function (matches packageFunction behavior)
      if (!isFunctionPackagedIndividually && servicePackage.artifact) {
        return false
      }

      const functionHandler = functionObject[handlerPropertyName]
      if (!functionHandler) {
        return false
      }

      const runtime = functionObject.runtime || configFile.provider.runtime
      if (!runtime || !runtime.startsWith('nodejs')) {
        return false
      }

      if (configFile.build?.esbuild) {
        return true
      }

      const handlerPath = stripHandlerExportSuffix(functionHandler)
      let parsedExtension = undefined
      for (const extension of BUILDABLE_HANDLER_EXTENSIONS) {
        if (existsSync(path.join(serviceDir, handlerPath + extension))) {
          parsedExtension = extension
          break
        }
      }

      if (
        parsedExtension &&
        ['.ts', '.cts', '.mts', '.tsx'].includes(parsedExtension)
      ) {
        return true
      }

      return false
    })
    return willRun
  }

  /**
   * Take a Function Configuration and determine if it should be built by esbuild
   * @param {Object} functionObject - A Framework Function Configuration Object
   * @returns
   */
  async _shouldBuildFunction(functionObject, handlerPropertyName = 'handler') {
    if (this.serverless.service.build?.esbuild === false) {
      return false
    }
    // An explicit function-level `build: false` opts a single function out of
    // building. This has to be checked up front: `false` is falsy, so it fell
    // through both the zero-config TypeScript detection and the
    // `functionBuildParam` branches below into the provider-level default,
    // and the function got built anyway. It is the escape hatch the
    // unresolvable-handler error points people at, so it has to work.
    if (functionObject.build === false) {
      return false
    }
    // If handler isn't set then it is a docker function so do not attempt to build
    if (!functionObject[handlerPropertyName]) {
      return false
    }
    // If user provided a function-level artifact, do not build this function
    if (functionObject?.package?.artifact) {
      return false
    }
    // If user provided a service-level artifact and packaging is not individual for this function,
    // do not build this function
    const isFunctionPackagedIndividually =
      functionObject?.package?.individually === true
    // If a service-level artifact is provided and the function itself is not individually packaged,
    // do not build this function (matches packageFunction behavior)
    if (
      !isFunctionPackagedIndividually &&
      this.serverless?.service?.package?.artifact
    ) {
      return false
    }
    const runtime =
      functionObject.runtime || this.serverless.service.provider.runtime
    const functionBuildParam = functionObject.build
    const providerBuildParam = this.serverless.service.build

    // If runtime is not node then should not build
    if (!runtime || !runtime.startsWith('nodejs')) {
      return false
    }

    // If the build property is not set then we use the zero-config checking which is simply
    // if the handler is a typescript file
    if (!functionBuildParam && !providerBuildParam) {
      log.debug(
        'Build property not set using default checking behavior for esbuild',
      )
      const extension = await this._extensionForFunction(
        functionObject[handlerPropertyName],
      )
      if (extension && ['.ts', '.cts', '.mts', '.tsx'].includes(extension)) {
        log.debug('Build property not set using esbuild since typescript')
        return true
      }
    }

    // If the build property on the function config is defined and is set to esbuild then
    // framework should build the function, otherwise if the build property is defined
    // but not set to esbuild then it should not be built
    if (functionBuildParam && functionBuildParam === 'esbuild') {
      return true
    } else if (functionBuildParam) {
      return false
    }

    // If the provider build property is set to esbuild then build by default
    if (
      providerBuildParam &&
      (providerBuildParam === 'esbuild' || providerBuildParam.esbuild)
    ) {
      return true
    }

    return false
  }

  // This is all the possible extensions that the esbuild plugin can build for
  async _extensionForFunction(functionHandler) {
    const handlerPath = stripHandlerExportSuffix(functionHandler)
    for (const extension of BUILDABLE_HANDLER_EXTENSIONS) {
      if (
        existsSync(
          path.join(this.serverless.config.serviceDir, handlerPath + extension),
        )
      ) {
        return extension
      }
    }
    return undefined
  }

  /**
   * Reads the package.json file in the service directory.
   * Note: This is a memoized function up in the constructor.
   *
   * @returns {Object} - The package.json object
   */
  async _readPackageJson(specifiedPackageJsonPath) {
    const packageJsonPath =
      specifiedPackageJsonPath ||
      path.join(this.serverless.serviceDir, 'package.json')

    if (existsSync(packageJsonPath)) {
      const packageJsonStr = await readFile(packageJsonPath, 'utf-8')
      return JSON.parse(packageJsonStr)
    }

    return {}
  }

  async _buildProperties() {
    const defaultConfig = { bundle: true, minify: false, sourcemap: true }

    const packageJson = await this._readPackageJson()

    // If the user explicitly set the type to "module" then we need to set the output format to ESM
    if (packageJson.type === 'module') {
      defaultConfig.format = `esm`
    }

    if (
      this.serverless.service.build &&
      this.serverless.service.build !== 'esbuild' &&
      this.serverless.service.build.esbuild
    ) {
      // For advanced use cases, users can provide a js file that exports a function that returns esbuild configuration options
      // This is useful for when users want to use esbuild plugins (which require calling a function) or other advanced configurations
      // That you can't really do in serverless.yml
      let jsConfig = {}
      if (this.serverless.service.build.esbuild.configFile) {
        // Resolve the absolute path to the config file
        const configFilePath = path.resolve(
          this.serverless.config.serviceDir,
          this.serverless.service.build.esbuild.configFile,
        )

        // This is a dynamic import because we want to support both CommonJS and ESM
        const configFile = await import(pathToFileURL(configFilePath).href)

        const configFunction = configFile.default || configFile

        // Print a nice error message if the export is not a function
        if (typeof configFunction !== 'function') {
          throw new ServerlessError(
            `Your build config "${path.basename(configFilePath)}" file must export a function that returns esbuild configuration options. For more details, please refer to the documentation: https://www.serverless.com/framework/docs/providers/aws/guide/building`,
            'ESBUILD_CONFIG_ERROR',
          )
        }

        // Passing the serverless instance can be useful
        // Ref: https://github.com/floydspace/serverless-esbuild/issues/168
        jsConfig = await configFunction(this.serverless)
      }

      // Users can use both serverless.yml and js file to configure esbuild
      // The yml config will take precedence over js config
      const mergedOptions = _.merge(
        defaultConfig,
        jsConfig,
        this.serverless.service.build.esbuild,
      )

      if (this.serverless.service.build.esbuild.sourcemap === true) {
        mergedOptions.sourcemap = true
      } else if (this.serverless.service.build.esbuild.sourcemap === false) {
        delete mergedOptions.sourcemap
      } else if (this.serverless.service.build.esbuild?.sourcemap?.type) {
        if (this.serverless.service.build.esbuild.sourcemap.type === 'linked') {
          mergedOptions.sourcemap = true
        } else {
          mergedOptions.sourcemap =
            this.serverless.service.build.esbuild.sourcemap.type
        }
      } else if (
        typeof this.serverless.service.build.esbuild.sourcemap === 'object'
      ) {
        // When sourcemap is an object without type (e.g., { setNodeOptions: false }),
        // default to true for esbuild compatibility
        mergedOptions.sourcemap = true
      }

      // esbuild resolves a relative `tsconfig` against its own working
      // directory, which under Compose is the compose root and not this
      // service -- the build then dies with `Cannot find tsconfig file`.
      // Making it absolute once, here, is what lets every consumer (both
      // build paths and the compile-selection filter) agree on which file the
      // user meant, whatever the process happens to be cd'ed into.
      if (mergedOptions.tsconfig) {
        mergedOptions.tsconfig = path.resolve(
          this.serverless.config.serviceDir,
          mergedOptions.tsconfig,
        )
      }

      return mergedOptions
    }

    return defaultConfig
  }

  /**
   * The extension of the bundled handler files, derived from esbuild's
   * `outExtension` option. The plugin builds with `outfile` (not `outdir`),
   * and esbuild ignores `outExtension` in outfile mode, so the mapping is
   * applied here — to the outfile passed to esbuild and to the file names the
   * packaging step zips — instead of by esbuild itself.
   * @param {object} buildProperties - The merged esbuild build properties
   * @param {string} [format] - The format the extension is checked against.
   *   Defaults to the service-wide `format`; the non-bundled build passes the
   *   format it resolved for the `.js` class instead, which is decided per file
   *   from the nearest package.json rather than service-wide.
   * @returns {string} The configured output extension, defaulting to '.js'
   */
  _outputExtension(buildProperties, format = buildProperties.format) {
    const extension = buildProperties.outExtension?.['.js'] ?? '.js'

    if (!['.js', '.cjs', '.mjs'].includes(extension)) {
      throw new ServerlessError(
        `esbuild's "outExtension" maps ".js" to "${extension}", but only ".js", ".cjs" and ".mjs" are supported because the Lambda Node.js runtime cannot load handler files with other extensions`,
        'ESBUILD_OUT_EXTENSION_UNSUPPORTED',
      )
    }

    // Mirrors esbuild's own coherence rules: Lambda decides between the CJS
    // and ESM loaders by file extension, so a mismatched pair produces a
    // bundle that crashes at initialization. Fail at build time instead.
    const isEsm = format === 'esm'
    if (isEsm && extension === '.cjs') {
      throw new ServerlessError(
        'esbuild format "esm" cannot emit files with the ".cjs" extension. Remove the "outExtension" mapping or set the format to "cjs"',
        'ESBUILD_OUT_EXTENSION_FORMAT_MISMATCH',
      )
    }
    if (!isEsm && extension === '.mjs') {
      throw new ServerlessError(
        'Emitting ".mjs" files requires the esbuild format "esm". Set "format: esm" in the esbuild configuration or remove the "outExtension" mapping',
        'ESBUILD_OUT_EXTENSION_FORMAT_MISMATCH',
      )
    }

    return extension
  }

  /**
   * Determine which modules to mark as external (i.e. added to the generated package.json) and which modules to be excluded all together
   * @param {string} runtime - The provider.runtime or functionObject.runtime value used to determine which version of the AWS SDK to exclude
   * @returns
   */
  async _getExternal(runtime) {
    const buildProperties = await this._buildProperties()
    let external = new Set(buildProperties.external || [])
    let exclude = new Set(buildProperties.exclude || [])
    if (buildProperties.exclude) {
      external = [...external, ...buildProperties.exclude]
    } else {
      const nodeRuntimeMatch = runtime.match(nodeRuntimeRe)
      if (nodeRuntimeMatch) {
        const version = parseInt(nodeRuntimeMatch.groups.version) || 18
        // If node version is 18 or greater then we need to exclude all @aws-sdk/ packages
        if (version >= 18) {
          external.add('@aws-sdk/*')
          exclude.add('@aws-sdk/*')
        } else {
          external.add('aws-sdk')
          exclude.add('aws-sdk')
        }
      }
    }
    return { external, exclude }
  }

  async _getDefaultExternalExcludes(runtime) {
    const external = []
    const exclude = []
    const nodeRuntimeMatch = runtime.match(nodeRuntimeRe)
    if (nodeRuntimeMatch) {
      const version = parseInt(nodeRuntimeMatch.groups.version) || 18
      logger.debug(
        'Setting default external for node version ',
        version,
        runtime,
      )
      // If node version is 18 or greater then we need to exclude all @aws-sdk/ packages
      if (version >= 18) {
        external.push('@aws-sdk/*')
        exclude.push('@aws-sdk/*')
      } else {
        external.push('aws-sdk')
        exclude.push('aws-sdk')
      }
    }
    return { external, exclude }
  }

  async _externals(runtime) {
    const packageJson = await this._readPackageJson()

    const buildProperties = await this._buildProperties()
    const { external: externalDefault, exclude: excludeDefault } =
      await this._getDefaultExternalExcludes(runtime)

    let external = Array.from(
      new Set([...externalDefault, ...(buildProperties.external ?? [])]),
    )
    let exclude = Array.from(
      new Set([...excludeDefault, ...(buildProperties.exclude ?? [])]),
    )

    const userDefinedExternalDefaults = (buildProperties.external ?? []).filter(
      (external) => externalDefault.includes(external),
    )
    const userDefinedExcludeDefaults = (buildProperties.exclude ?? []).filter(
      (exclude) => excludeDefault.includes(exclude),
    )

    logger.debug('Initial External ', external)
    logger.debug('Initial Exclude ', exclude)
    if (packageJson.dependencies) {
      const dependencies = Object.keys(packageJson.dependencies)
      const dependencyExternal =
        external.length > 0 ? micromatch(dependencies, external) : []
      const dependencyExclude =
        exclude.length > 0 ? micromatch(dependencies, exclude) : []

      external = [...external, ...dependencyExternal]
      exclude = [...exclude, ...dependencyExclude]

      logger.debug('External After Dependency ', external)
      logger.debug('Exclude After Dependency ', exclude)
      let externalToFilter = []
      let excludeToFilter = []
      if (micromatch(dependencies, externalDefault).length > 0) {
        externalToFilter = [...externalToFilter, ...externalDefault]
      }

      if (micromatch(dependencies, excludeDefault).length > 0) {
        excludeToFilter = [...excludeToFilter, ...excludeDefault]
      }

      let finalExternal = external.filter(
        (ex) => !ex.includes('!') && !externalToFilter.includes(ex),
      )
      let finalExclude = exclude.filter(
        (ex) => !ex.includes('!') && !excludeToFilter.includes(ex),
      )

      if (userDefinedExternalDefaults.length > 0) {
        finalExternal = [...finalExternal, ...userDefinedExternalDefaults]
      }
      if (userDefinedExcludeDefaults.length > 0) {
        finalExclude = [...finalExclude, ...userDefinedExcludeDefaults]
      }

      logger.debug('Externals to Filter ', externalToFilter)
      logger.debug('Excludes to Filter ', excludeToFilter)
      logger.debug('Final External ', finalExternal)
      logger.debug('Final Exclude ', finalExclude)
      return { external: finalExternal, exclude: finalExclude }
    }

    return { external: external, exclude: exclude }
  }

  /**
   * When invoking locally we need to set the servicePath to the build directory so that invoke local correctly uses the built function and does not
   * attempt to use the typescript file directly.
   */
  _setConfigForLocalInvocation() {
    this.serverless.config.servicePath = path.join(
      this.serverless.config.serviceDir,
      '.serverless',
      'build',
    )
  }

  /**
   * Take the current build context. Which could be service-wide or a given function and then build it
   * @param {string} handlerPropertyName - The property name of the handler in the function object. In the case of dev mode this will be different, so we need to be able to set it.
   */
  async _build(handlerPropertyName = 'handler') {
    // Where each function's handler artifact was actually emitted, recorded by
    // the build itself so packaging never has to re-derive it. Rebuilt from
    // scratch on every invocation (dev mode rebuilds through the same plugin
    // instance) so it can never report an artifact from a previous build.
    this.builtArtifacts = new Map()
    this.patternClaimedBuildPaths = new Set()

    const functionsToBuild = await this.functions(handlerPropertyName)

    if (Object.keys(functionsToBuild).length === 0) {
      log.debug('No functions to build with esbuild')
      return
    }

    const buildProperties = await this._buildProperties()

    // Without bundling, a handler's `import`s stay in the emitted file and are
    // resolved by Node at runtime, so the artifact has to carry the whole
    // project rather than one file per handler. That is a different build
    // entirely — different entry points, different output layout — so it runs
    // as its own path and leaves the bundling one below untouched.
    if (buildProperties.bundle === false) {
      // Dev mode (the only caller passing `originalHandler`) keeps the
      // last-good outputs, exactly as on the bundling path. The reset belongs
      // HERE, in `_build`: `before:esbuild-package` fires after it and is the
      // plugin injection point whose outputs the zip must include, so a reset
      // in `_package` would wipe plugin-injected files (see `_resetBuildDir`).
      if (handlerPropertyName !== 'originalHandler') {
        await this._resetBuildDir()
      }

      try {
        await this._buildProject(
          functionsToBuild,
          handlerPropertyName,
          buildProperties,
        )
      } catch (err) {
        if (this.serverless.devmodeEnabled === true) {
          return
        }
        // Errors this path raises deliberately (an output collision, an
        // unusable `outExtension`) already say what to do about them; only
        // esbuild's own failures need wrapping.
        if (err instanceof ServerlessError) {
          throw err
        }
        throw new ServerlessError(err.message, 'ESBULD_BUILD_ERROR')
      }

      if (handlerPropertyName !== 'originalHandler') {
        this._assertAllHandlersBuilt(functionsToBuild, handlerPropertyName)
      }

      return
    }

    const outputExtension = this._outputExtension(buildProperties)

    // Multiple functions can share a single handler file (e.g. one module
    // exporting several handlers). Building each function separately would
    // spawn concurrent esbuild.build() calls writing to the same outfile,
    // racing on truncate+write and corrupting the output (#13716). Instead we
    // group functions by their resolved absolute entry path and build each
    // unique file once, applying the per-function side effects to every alias
    // in the group afterwards.
    const buildGroups = new Map()

    for (const [alias, functionObject] of Object.entries(functionsToBuild)) {
      const handlerPath = stripHandlerExportSuffix(
        functionObject[handlerPropertyName],
      )
      const runtime =
        functionObject.runtime || this.serverless.service.provider.runtime

      const external = (await this._externals(runtime)).external

      const extension = await this._extensionForFunction(
        functionObject[handlerPropertyName],
      )
      if (!extension) {
        continue
      }

      // `path.join` normalizes the entry path (e.g. `./src/x` vs `src/x`) so
      // functions pointing at the same file land in the same group.
      const entry = path.join(
        this.serverless.config.serviceDir,
        handlerPath + extension,
      )

      const existingGroup = buildGroups.get(entry)
      if (existingGroup) {
        existingGroup.aliases.push(alias)
        existingGroup.externals.push(external)
      } else {
        buildGroups.set(entry, {
          entry,
          // Relative stripped handler path used to derive the outfile. All
          // members of a group resolve to the same file, so any member's
          // relative path is correct once `path.join`-normalized below.
          handlerPath,
          aliases: [alias],
          externals: [external],
        })
      }
    }

    if (buildGroups.size === 0) {
      log.debug('No buildable handler files resolved for esbuild')
      // "No buildable handlers" is not "nothing to package". A service whose
      // every handler lives in a Lambda layer (`/opt/nodejs/...`) resolves no
      // entry point and is a perfectly normal configuration — the assertion
      // below says so out loud — and it still gets packaged. So the build
      // directory has to exist AND be clean before packaging walks it:
      // without the reset it never existed at all and `_preparePackageJson`
      // wrote into a missing directory, and a stale outfile left by a build
      // made before the handler was switched to a layer-provided path would
      // otherwise ship.
      //
      // Nothing resolving also means EVERY approved function is unresolvable,
      // so this path needs the same assertion as a completed build — otherwise
      // the worst case is the one case that stays silent. Dev mode
      // (`originalHandler`) keeps its last-good outputs and skips both.
      if (handlerPropertyName !== 'originalHandler') {
        await this._resetBuildDir()
        this._assertAllHandlersBuilt(functionsToBuild, handlerPropertyName)
      }
      return
    }

    // Dev mode (the only caller passing `originalHandler`) must keep the
    // last-good outputs, so the reset is limited to the deploy/package flows.
    if (handlerPropertyName !== 'originalHandler') {
      await this._resetBuildDir()
    }

    // Determine the concurrency to use for building, by default framework will
    // attempt to build all unique handler files concurrently, but this can be
    // overridden by setting the buildConcurrency property.
    const concurrency = buildProperties.buildConcurrency ?? buildGroups.size

    const limit = pLimit(concurrency)

    const shouldSetNodeOptions = this._shouldSetNodeOptions(buildProperties)

    try {
      await Promise.all(
        Array.from(buildGroups.values()).map((group) => {
          return limit(async () => {
            // Reconcile the group members' external lists. They only diverge
            // when functions sharing a handler file straddle the node16/18
            // boundary via per-function `runtime`. This matters solely when
            // bundling: `bundle !== true` forces `external: []` below, so the
            // lists are never consulted and no conflict is possible.
            const externals = group.externals
            let external = externals[0]
            if (buildProperties.bundle === true) {
              const referenceExternal = externals[0]
              const hasConflict = externals.some(
                (candidate) => !areSameSet(candidate, referenceExternal),
              )
              if (hasConflict) {
                // Compare as (order-insensitive) sets and use the intersection
                // so we never bundle a module that any function in the group
                // needs left external. Filter the first member's array to keep
                // a deterministic order.
                external = referenceExternal.filter((dep) =>
                  externals.every((other) => other.includes(dep)),
                )
                logger.warning(
                  `Functions ${group.aliases.join(', ')} share the handler file "${group.entry}" but resolve to different esbuild "external" lists. ` +
                    `Building the file once with the intersection of those lists: ${external.length > 0 ? external.join(', ') : '(empty)'}.`,
                )
              }
            }

            const outfile = path.join(
              this.buildDirPath,
              group.handlerPath + outputExtension,
            )

            const esbuildProps = {
              ...buildProperties,
              platform: 'node',
              ...(buildProperties.bundle === true
                ? { external }
                : { external: [] }),
              entryPoints: [group.entry],
              outfile,
              logLevel: 'error',
            }

            // Remove the following properties from the esbuildProps as they are not valid esbuild properties
            delete esbuildProps.exclude
            delete esbuildProps.buildConcurrency
            delete esbuildProps.configFile
            // Applied to the outfile above; esbuild ignores it in outfile mode
            delete esbuildProps.outExtension

            const result = await esbuild.build(esbuildProps)

            /**
             * If the user has set the esbuild metafile option, we need to write the metafile to the build directory
             * so that they analyze the build output, just like the esbuild CLI does.
             */
            if (result.metafile) {
              await writeFile(
                path.join(
                  this.serverless.config.serviceDir,
                  '.serverless',
                  'build',
                  'meta.json',
                ),
                JSON.stringify(result.metafile, null, 2),
              )
            }

            if (!this.serverless.builtFunctions) {
              this.serverless.builtFunctions = new Set()
            }

            // Recorded here, where the emitted paths are known for certain,
            // rather than re-derived from the handler string at packaging
            // time. Zip-relative and POSIX-separated because that is what an
            // archive entry name has to be, on every platform.
            //
            // The outfile is probed rather than assumed: a configFile can
            // merge `write: false`, which makes esbuild return the output in
            // memory and touch nothing on disk. Recording a path that was
            // never written would give packaging a phantom artifact and
            // satisfy the end-of-build assertion.
            const zipRelativeOutfile = path
              .relative(this.buildDirPath, outfile)
              .split(path.sep)
              .join('/')
            const artifact = existsSync(outfile)
              ? {
                  outfile: zipRelativeOutfile,
                  // `sourcemap: 'inline'`/`false` emit no map file.
                  mapfile: existsSync(`${outfile}.map`)
                    ? `${zipRelativeOutfile}.map`
                    : null,
                }
              : null

            // Apply the per-function side effects to every alias sharing this
            // handler file, not just the one whose build we ran. Each alias
            // gets its own copy of the record so a consumer mutating one
            // cannot reach into its group siblings.
            for (const alias of group.aliases) {
              this.serverless.builtFunctions.add(alias)
              if (artifact) {
                this.builtArtifacts.set(alias, { ...artifact })
              }
              if (shouldSetNodeOptions) {
                const functionObject =
                  this.serverless.service.getFunction(alias)
                if (functionObject.environment?.NODE_OPTIONS) {
                  functionObject.environment.NODE_OPTIONS = `${functionObject.environment.NODE_OPTIONS} --enable-source-maps`
                } else {
                  if (!functionObject.environment) {
                    functionObject.environment = {}
                  }
                  functionObject.environment.NODE_OPTIONS =
                    '--enable-source-maps'
                }
              }
            }
          })
        }),
      )
    } catch (err) {
      if (this.serverless.devmodeEnabled === true) {
        return
      }
      throw new ServerlessError(err.message, 'ESBULD_BUILD_ERROR')
    }

    // Dev mode deliberately swallows build failures above so the dev loop
    // keeps serving the last-good outputs; the same reasoning applies here.
    if (handlerPropertyName !== 'originalHandler') {
      this._assertAllHandlersBuilt(functionsToBuild, handlerPropertyName)
    }

    return
  }

  /**
   * Whether to inject `NODE_OPTIONS=--enable-source-maps` into the built
   * functions. A yml `sourcemap` value decides when present (the object form
   * via its `setNodeOptions` flag, false by default); otherwise the decision
   * follows the effective merged setting so that `sourcemap: false` inside a
   * `configFile` suppresses the env var just like its yml equivalent (#12997).
   *
   * @param {object} buildProperties - The merged esbuild build properties
   * @returns {boolean}
   */
  _shouldSetNodeOptions(buildProperties) {
    const ymlSourcemap = this.serverless.service.build?.esbuild?.sourcemap
    return typeof ymlSourcemap === 'object' && ymlSourcemap !== null
      ? ymlSourcemap.setNodeOptions === true
      : ymlSourcemap === undefined
        ? Boolean(buildProperties.sourcemap)
        : ymlSourcemap === true
  }

  /**
   * Build a service with `bundle: false`.
   *
   * Unbundled output keeps its `import`/`require` specifiers, so the artifact
   * has to contain every file the handler can reach at runtime, at the path it
   * reaches it by. This selects the same files classic packaging would have
   * shipped, transpiles the ones esbuild has to handle, copies the rest
   * verbatim, and preserves the directory layout in both cases.
   *
   * Transpilation is partitioned by (module-system class, format): the format
   * and the output extension are precisely what esbuild cannot vary within one
   * call, and both genuinely vary across a project. `.mts`/`.mjs` must stay
   * ESM, `.cts`/`.cjs` must stay CommonJS, and a plain `.ts`/`.js` follows the
   * `type` of its nearest package.json the same way Node will when it loads the
   * emitted file. Options the user scopes to their own module system —
   * `format`, `outExtension`, `banner`, `footer`, `inject` — apply to the `.js`
   * class only, since the other classes are defined by refusing to move.
   *
   * @param {Object} functionsToBuild - Functions approved by `_shouldBuildFunction`
   * @param {string} handlerPropertyName - The handler property to resolve from
   * @param {object} buildProperties - The merged esbuild build properties
   */
  async _buildProject(functionsToBuild, handlerPropertyName, buildProperties) {
    const serviceDir = this.serverless.config.serviceDir
    const service = this.serverless.service

    // A `format` the user actually asked for governs the `.js` class outright.
    // The one `_buildProperties` derives from the root package.json `type` does
    // not: that derivation is the service-wide special case of the per-file
    // rule applied below, and letting it win here would make a nested
    // `"type"` — the only thing that rule can tell you that the root cannot —
    // unreachable.
    const rootPackageJson = await this._readPackageJson()
    const derivedFormat =
      rootPackageJson.type === 'module' ? 'esm' : /* c8 ignore next */ undefined
    const explicitFormat =
      buildProperties.format && buildProperties.format !== derivedFormat
        ? buildProperties.format
        : undefined

    // Validated once, up front, against the format the `.js` class takes at the
    // service root. Leaving it to the per-partition call below would let an
    // unusable mapping through unchecked in a service that happens to have no
    // `.js`-class file to compile — and an `outExtension` the runtime cannot
    // load is worth refusing whether or not this particular build trips over
    // it. The per-partition call still runs, and still catches a subdirectory
    // whose resolved format disagrees with the root's.
    this._outputExtension(buildProperties, explicitFormat ?? derivedFormat)

    // Resolved handler files, normalized onto the form the sweep produces so
    // that `./src/handler.ts` and the swept `src/handler.ts` are one file.
    const handlerFileByAlias = new Map()
    for (const [alias, functionObject] of Object.entries(functionsToBuild)) {
      const functionHandler = functionObject[handlerPropertyName]
      const extension = await this._extensionForFunction(functionHandler)
      // No local file. That is not necessarily an error — layer-provided
      // wrappers resolve inside the Lambda at runtime — and
      // `_assertAllHandlersBuilt` is what decides, so this path stays silent
      // and simply builds the rest of the project.
      if (!extension) continue
      handlerFileByAlias.set(
        alias,
        toSweptPath(stripHandlerExportSuffix(functionHandler) + extension),
      )
    }

    const layerPaths =
      typeof service.getAllLayers === 'function'
        ? service
            .getAllLayers()
            .map((layer) => service.getLayer(layer)?.path)
            .filter(Boolean)
        : []

    const swept = await sweepProjectFiles({
      serviceDir,
      additionalIgnores: this._packageDirectoryIgnores(),
      // `package.include` is the other half of the legacy pre-`patterns` pair
      // (see `package.exclude` below). Classic merges it ahead of `patterns`
      // (`getIncludes`: include first, patterns after), so a patterns negation
      // still gets the last word over an include.
      patterns: [
        ...(service.package?.include ?? []),
        ...(service.package?.patterns ?? []),
      ],
      configFileNames: resolveServerlessConfigFileExcludes(this.serverless),
      layerPaths,
      localPluginPath:
        this.serverless.pluginManager?.parsePluginsObject?.(service.plugins)
          ?.localPath ?? null,
      additionalExclusions: [
        ...CLASSIC_DEFAULT_EXCLUDES,
        // `package.exclude` is the pre-`patterns` spelling. Classic still
        // merges it into its exclude list, so a service that never migrated
        // has to keep excluding the same files here.
        ...(service.package?.exclude ?? []),
        DOTENV_EXCLUDE,
      ],
    })

    const handlerFiles = [...handlerFileByAlias.values()]
    const { compile: sweptCompile, copy } = splitCompileAndCopy(
      swept,
      handlerFiles,
    )

    // The sweep decides what the artifact ships; the tsconfig decides which of
    // that TypeScript is part of the program. Narrowing here -- before the
    // collision check -- is deliberate: a `util.ts` the tsconfig does not
    // claim is never emitted, so it cannot clash with a hand-written
    // `util.js`, and excluding it is the documented way out of that clash.
    const { compile, warning: tsconfigWarning } = applyTsconfigCompileFilter({
      serviceDir,
      tsconfigPath: buildProperties.tsconfig,
      compileFiles: sweptCompile,
      handlerFiles,
    })
    if (tsconfigWarning) {
      logger.warning(tsconfigWarning)
    }

    this._assertNoOutputCollisions(detectOutputCollisions(compile, copy))

    const packageJsonTypeCache = new Map()
    const partitions = new Map()
    for (const file of compile) {
      // The class a file belongs to is the module system its own name carries:
      // `.mts`/`.mjs` are ESM, `.cts`/`.cjs` are CommonJS, and everything else
      // defers to its directory. `outputPathFor` already encodes exactly that
      // mapping. Deriving the class from it — rather than from the compilable
      // extensions alone — is what keeps a `.mjs` or `.cjs` HANDLER in its own
      // class: handlers are force-compiled whatever their extension, and
      // treating one as `.js` emitted `handler.js` while everything downstream
      // (`outputPathFor`, `builtArtifacts`, packaging) looked for
      // `handler.mjs`, failing the build with ESBUILD_HANDLER_NOT_BUILT.
      const sourceClass = path.posix.extname(outputPathFor(file))
      let outputExtension
      let format
      if (sourceClass === '.mjs') {
        outputExtension = '.mjs'
        format = 'esm'
      } else if (sourceClass === '.cjs') {
        outputExtension = '.cjs'
        format = 'cjs'
      } else {
        format =
          explicitFormat ??
          (nearestPackageJsonType(serviceDir, file, packageJsonTypeCache) ===
          'module'
            ? 'esm'
            : 'cjs')
        // `outExtension` is a `.js`-class setting: the other classes carry a
        // module system in their name and renaming their output discards it.
        outputExtension = this._outputExtension(buildProperties, format)
      }

      // Keyed by SOURCE class, not by the extension it ends up with: with
      // `outExtension: { '.js': '.mjs' }` the `.js` and `.mjs` classes emit the
      // same extension in the same format, yet only the `.js` one takes the
      // user's `.js`-scoped options — and each still needs its own metafile.
      const key = `${sourceClass}|${format}`
      const partition = partitions.get(key)
      if (partition) partition.entryFiles.push(file)
      else {
        partitions.set(key, {
          sourceClass,
          outputExtension,
          format,
          entryFiles: [file],
        })
      }
    }

    // `detectOutputCollisions` derives outputs from source extensions, so it
    // cannot see a clash that exists only because `outExtension` moved the
    // `.js` class onto `.mjs`/`.cjs`. Re-check against the resolved plan when
    // that is in play.
    if (buildProperties.outExtension?.['.js'] !== undefined) {
      this._assertNoOutputCollisions(
        this._detectPlannedOutputCollisions(partitions, copy),
      )
    }

    const esbuildBase = {
      ...buildProperties,
      platform: 'node',
      // Nothing is resolved into the output, so there is nothing to keep out
      // of it either.
      external: [],
      logLevel: 'warning',
    }
    // Not valid esbuild properties, or set per partition below.
    delete esbuildBase.exclude
    delete esbuildBase.buildConcurrency
    delete esbuildBase.configFile
    delete esbuildBase.bundle
    delete esbuildBase.format
    delete esbuildBase.outExtension
    // The bundling path builds one file at a time and may carry an `outfile`
    // through from a configFile. esbuild rejects it alongside the `outdir` this
    // path needs, and it would name a single output for a whole partition
    // anyway.
    delete esbuildBase.outfile
    // A tsconfig the user named is theirs to apply, so esbuild gets it too,
    // carried through by the spread above -- `_buildProperties` has already
    // made it absolute. A tsconfig merely discovered is not forwarded:
    // esbuild does its own per-file lookup, and pinning every file to the root
    // config would override the nested ones that lookup exists to honor.
    if (!buildProperties.tsconfig) {
      delete esbuildBase.tsconfig
    }

    // Options the user aims at their handler's own module system. They are
    // scoped to the `.js` class for the same reason `format` and `outExtension`
    // are: a `createRequire(import.meta.url)` banner — the standard fix for an
    // ESM build — is a syntax error in a CommonJS output, and the `.cts`/`.cjs`
    // partitions exist precisely to stay CommonJS.
    const jsClassOnlyProperties = {}
    for (const property of ['banner', 'footer', 'inject']) {
      if (esbuildBase[property] !== undefined) {
        jsClassOnlyProperties[property] = esbuildBase[property]
        delete esbuildBase[property]
      }
    }

    // `buildConcurrency` caps the partition builds, the way it caps the
    // per-handler builds on the bundling path. Partitions write disjoint files,
    // so the default is to run them all at once.
    const partitionLimit = pLimit(
      buildProperties.buildConcurrency ?? Math.max(partitions.size, 1),
    )

    await Promise.all(
      [...partitions.entries()].map(([key, partition]) =>
        partitionLimit(async () => {
          const result = await esbuild.build({
            ...esbuildBase,
            ...(partition.sourceClass === '.js' ? jsClassOnlyProperties : {}),
            bundle: false,
            format: partition.format,
            entryPoints: partition.entryFiles.map((file) =>
              path.join(serviceDir, file),
            ),
            // `outbase` is what preserves the layout: esbuild places each
            // output at its entry point's path relative to it. Without it
            // esbuild picks the lowest common ancestor of the partition's entry
            // points, which differs per partition and would flatten or shift
            // the tree.
            outdir: this.buildDirPath,
            outbase: serviceDir,
            ...(partition.outputExtension !== '.js'
              ? { outExtension: { '.js': partition.outputExtension } }
              : {}),
          })

          // One metafile per partition. A single `meta.json`, as the bundling
          // path writes, would be overwritten by each partition in turn and
          // describe only the last one.
          if (result.metafile) {
            await writeFile(
              path.join(
                this.buildDirPath,
                `meta.${key.replace(/[|.]/g, '')}.json`,
              ),
              JSON.stringify(result.metafile, null, 2),
            )
          }
        }),
      ),
    )

    // Every file this build just emitted, with the depth of scan its format
    // warrants. Derived from the partition plan rather than from a walk of the
    // build directory: the plan is the only thing that knows each output's
    // format, and a walk would sweep up the sourcemaps, the metafiles and the
    // verbatim copies alongside them — none of which this scan has anything to
    // say about, and the first of which is a second copy of every emitted file.
    const scanTargets = []
    for (const partition of partitions.values()) {
      // CommonJS output is scanned for `import()` only. esbuild rewrites the
      // static forms into `require()`, which the CommonJS resolver happily
      // completes with an extension — but it leaves `import()` verbatim, and
      // Node routes `import()` through the ES module resolver even from inside
      // a CommonJS file. So the dynamic form is unsafe in every format, and
      // the static ones only where they survive as imports.
      const dynamicOnly = partition.format !== 'esm'
      for (const file of partition.entryFiles) {
        const base = outputPathFor(file)
        scanTargets.push({
          output: base.endsWith('.js')
            ? `${base.slice(0, -'.js'.length)}${partition.outputExtension}`
            : base,
          dynamicOnly,
        })
      }
    }
    await this._warnOnUnresolvableRelativeImports(scanTargets)

    // Anything the sweep selected under a root the artifact walk skips by
    // default got there through a positive pattern (the sweep's own
    // exclusions cover those roots), so the walk has to keep it.
    this._claimBuildPaths([
      ...compile.map((file) =>
        this._outputPathForSource(file, buildProperties),
      ),
      ...copy,
    ])

    // Raw copies, layout preserved. Directories first, deduplicated: a flat
    // service of 10k files would otherwise issue 10k redundant `mkdir` calls.
    const destinations = copy.map((file) => ({
      from: path.join(serviceDir, file),
      to: path.join(this.buildDirPath, file),
    }))
    for (const dir of new Set(
      destinations.map((destination) => path.dirname(destination.to)),
    )) {
      await mkdir(dir, { recursive: true })
    }
    const copyLimit = pLimit(COPY_CONCURRENCY)
    await Promise.all(
      destinations.map((destination) =>
        copyLimit(() => copyFile(destination.from, destination.to)),
      ),
    )

    // Per-alias side effects, gated on the artifact actually being on disk:
    // `write: false` in a configFile makes esbuild return its output in memory
    // and touch nothing, and a function reported as built but with no file
    // behind it sends dev mode and packaging at a path that is not there.
    if (!this.serverless.builtFunctions) {
      this.serverless.builtFunctions = new Set()
    }
    const shouldSetNodeOptions = this._shouldSetNodeOptions(buildProperties)
    for (const [alias, handlerFile] of handlerFileByAlias) {
      const outfile = this._outputPathForSource(handlerFile, buildProperties)
      if (!existsSync(path.join(this.buildDirPath, outfile))) continue

      this.serverless.builtFunctions.add(alias)
      this.builtArtifacts.set(alias, {
        outfile,
        // `sourcemap: 'inline'`/`false` emit no map file.
        mapfile: existsSync(path.join(this.buildDirPath, `${outfile}.map`))
          ? `${outfile}.map`
          : null,
      })

      if (shouldSetNodeOptions) {
        const functionObject = this.serverless.service.getFunction(alias)
        if (functionObject.environment?.NODE_OPTIONS) {
          functionObject.environment.NODE_OPTIONS = `${functionObject.environment.NODE_OPTIONS} --enable-source-maps`
        } else {
          if (!functionObject.environment) {
            functionObject.environment = {}
          }
          functionObject.environment.NODE_OPTIONS = '--enable-source-maps'
        }
      }
    }
  }

  /**
   * Say once, after the build, which emitted files import a relative path Node
   * will not resolve.
   *
   * Bundling used to hide both of these: esbuild resolved the specifier itself
   * and inlined the result. With bundling off the specifier survives into the
   * artifact, and either Node's ES module resolver refuses it (it adds no
   * extension and probes no `index.js`) or it names a source file the build
   * emitted under a different name (`./util.ts` → `util.js`). Both fail on the
   * first invocation of the deployed function, pointing at a file that is
   * right there in the zip. Nothing before this point can catch it: esbuild
   * does not resolve imports when it is not bundling, so it has no opinion to
   * report.
   *
   * Each target is read once, scanned, and dropped — up to `COPY_CONCURRENCY`
   * of them in flight at a time, so peak memory is bounded by that many files
   * rather than by the size of the project. Only the hits are retained.
   *
   * @param {Array<{output: string, dynamicOnly: boolean}>} targets build-dir-
   *   relative POSIX output paths, each with the scan depth its format warrants
   */
  async _warnOnUnresolvableRelativeImports(targets) {
    // Indexed rather than appended: the reads are concurrent, and a warning
    // whose first ten entries depend on I/O scheduling is a warning that reads
    // differently on every run.
    const perTarget = new Array(targets.length)
    const limit = pLimit(COPY_CONCURRENCY)
    await Promise.all(
      targets.map((target, index) =>
        limit(async () => {
          let contents
          try {
            contents = await readFile(
              path.join(this.buildDirPath, target.output),
              'utf8',
            )
          } catch {
            // Nothing on disk to scan. `write: false` carried in from a
            // configFile is the ordinary way here, and it is not this
            // function's business to complain about it.
            return
          }
          const found = scanUnresolvableRelativeImports(contents, {
            dynamicOnly: target.dynamicOnly,
          })
          // Only the hits are kept, and the contents go out of scope here.
          if (
            found.extensionless.length > 0 ||
            found.sourceExtension.length > 0
          )
            perTarget[index] = found
        }),
      ),
    )

    let total = 0
    const pairs = []
    const record = (index, detail) => {
      total += 1
      if (pairs.length < ESM_SPECIFIER_WARNING_LIMIT) {
        pairs.push(`${targets[index].output} → ${detail}`)
      }
    }
    for (const [index, found] of perTarget.entries()) {
      if (!found) continue
      for (const specifier of found.extensionless) record(index, specifier)
      for (const specifier of found.sourceExtension) {
        // Naming the emitted file is the whole fix, so print it rather than
        // making the reader work out what `.ts` compiles to.
        record(index, `${specifier} (emitted as "${outputPathFor(specifier)}")`)
      }
    }
    if (total === 0) {
      return
    }

    const remainder =
      total > pairs.length ? ` (and ${total - pairs.length} more)` : ''
    logger.warning(
      `Found ${total} relative import${total === 1 ? '' : 's'} in this build's output that Node will not resolve: ` +
        `${pairs.join(', ')}${remainder}. ` +
        `Node resolves ES module specifiers verbatim — it adds no file extension and looks for no "index" file, and "import()" uses ` +
        `that resolver even inside CommonJS — so each of these fails at runtime with ERR_MODULE_NOT_FOUND even though the target is ` +
        `in the package. Write relative imports with an explicit extension naming the EMITTED file, e.g. "./util.js", which is what ` +
        `TypeScript's "module": "nodenext" requires.`,
    )
  }

  /**
   * Where a non-bundled build writes one source file, as a build-dir-relative
   * POSIX path. `outputPathFor` knows the extension mapping; only the
   * `.js`-class `outExtension` override has to be layered on top of it.
   *
   * @param {string} sourcePath - Service-relative POSIX source path
   * @param {object} buildProperties - The merged esbuild build properties
   * @returns {string}
   */
  _outputPathForSource(sourcePath, buildProperties) {
    const defaultOutput = outputPathFor(sourcePath)
    const configured = buildProperties.outExtension?.['.js']
    if (!configured || !defaultOutput.endsWith('.js')) {
      return defaultOutput
    }
    return `${defaultOutput.slice(0, -'.js'.length)}${configured}`
  }

  /**
   * Output paths claimed by more than one source once the partition plan (and
   * therefore any `outExtension` override) is known.
   *
   * @param {Map<string, {outputExtension: string, entryFiles: string[]}>} partitions
   * @param {string[]} copyFiles
   * @returns {Array<{ output: string, sources: string[] }>}
   */
  _detectPlannedOutputCollisions(partitions, copyFiles) {
    const sourcesByOutput = new Map()
    const record = (source, output) => {
      if (!sourcesByOutput.has(output)) sourcesByOutput.set(output, new Set())
      sourcesByOutput.get(output).add(source)
    }
    for (const partition of partitions.values()) {
      for (const file of partition.entryFiles) {
        const base = outputPathFor(file)
        record(
          file,
          base.endsWith('.js')
            ? `${base.slice(0, -'.js'.length)}${partition.outputExtension}`
            : base,
        )
      }
    }
    for (const file of copyFiles) record(file, outputPathFor(file))
    return [...sourcesByOutput.entries()]
      .filter(([, sources]) => sources.size > 1)
      .map(([output, sources]) => ({ output, sources: [...sources] }))
  }

  /**
   * Two sources writing one output means one of them silently disappears from
   * the artifact — a hand-written `util.js` next to a `util.ts`, most often
   * left behind by a half-finished TypeScript migration. Report both names
   * instead of shipping whichever esbuild happened to write last.
   *
   * @param {Array<{ output: string, sources: string[] }>} collisions
   */
  _assertNoOutputCollisions(collisions) {
    if (collisions.length === 0) {
      return
    }

    const details = collisions
      .map(
        (collision) =>
          `"${collision.output}" would be produced by both ${collision.sources
            .map((source) => `"${source}"`)
            .join(' and ')}`,
      )
      .join('; ')

    throw new ServerlessError(
      `Multiple source files map to the same build output: ${details}. ` +
        `With "bundle: false" every source file is emitted, so two of them ` +
        `cannot share a name. Delete the stale file, exclude one side with a ` +
        `"package.patterns" negation — for a handler file, negate the ` +
        `TypeScript side, because handlers always compile whatever the ` +
        `patterns say — point "build.esbuild.tsconfig" at a config that ` +
        `excludes it, or remove "build.esbuild" if you precompile.`,
      'ESBUILD_OUTPUT_COLLISION',
    )
  }

  /**
   * Report every function esbuild was asked to build that produced no
   * artifact — an unresolvable handler file, or a build configured not to
   * write one. Such functions used to be skipped in silence and shipped a zip
   * with no handler in it (#12970): the deploy succeeded and the function
   * failed at invocation time with `Cannot find module`.
   *
   * A handler does not always have to exist in the service directory though.
   * Layer-provided wrappers — Datadog's
   * `/opt/nodejs/node_modules/datadog-lambda-js/handler.datadog`, New Relic's
   * `newrelic-lambda-wrapper.handler` — resolve inside a Lambda layer at
   * runtime and are perfectly valid. So a function with layers in scope gets
   * a warning; only a function with no layers at all is the typo case and
   * fails the build.
   *
   * @param {Object} functionsToBuild - Functions approved by `_shouldBuildFunction`
   * @param {string} handlerPropertyName - The handler property these were resolved from
   */
  _assertAllHandlersBuilt(functionsToBuild, handlerPropertyName) {
    const missing = Object.keys(functionsToBuild).filter(
      (alias) => !this.builtArtifacts.has(alias),
    )

    if (missing.length === 0) {
      return
    }

    const providerLayers = this.serverless.service.provider?.layers
    const serviceHasLayers =
      Array.isArray(providerLayers) && providerLayers.length > 0

    const describe = (alias) =>
      `"${alias}" (handler: ${functionsToBuild[alias][handlerPropertyName]})`

    const layerProvided = []
    const unresolvable = []
    for (const alias of missing) {
      const functionLayers = functionsToBuild[alias].layers
      const hasLayers =
        serviceHasLayers ||
        (Array.isArray(functionLayers) && functionLayers.length > 0)
      ;(hasLayers ? layerProvided : unresolvable).push(alias)
    }

    // One aggregated warning, not one per function: a service wrapping every
    // function in an observability layer would otherwise print a wall of them.
    if (layerProvided.length > 0) {
      logger.warning(
        `Handler files for ${layerProvided
          .map(describe)
          .join(
            ', ',
          )} could not be found locally; assuming they are provided by a Lambda layer at runtime. ` +
          `If that is not the case, fix the handler path — the deployed function will fail to start.`,
      )
    }

    if (unresolvable.length > 0) {
      throw new ServerlessError(
        `The following functions are configured to be built by esbuild but their handler files could not be found: ${unresolvable
          .map(describe)
          .join(', ')}. Checked extensions: ${BUILDABLE_HANDLER_EXTENSIONS.join(
          ', ',
        )}. Fix the handler path, or set "build: false" on the function to exclude it from the build.`,
        'ESBUILD_HANDLER_NOT_BUILT',
      )
    }
  }

  /**
   * Every file the build directory holds, as archive entries ready to append.
   *
   * The build directory IS the artifact definition: `_resetBuildDir` clears it
   * before every deploy build, `_build` writes the outputs into it, and the
   * `esbuild-package` hook lets plugins add to it. Packaging therefore ships
   * all of it rather than re-deriving a handpicked list of handler files, which
   * is what dropped every plugin-emitted asset — templates, locale JSON, WASM,
   * prisma engines, `.node` binaries — from the artifact (#13163).
   *
   * Order and metadata are pinned, not incidental: `check-for-changes` hashes
   * the raw zip bytes, so identical content has to produce an identical
   * archive. Entries come out byte-wise sorted by their POSIX archive path, and
   * the caller stamps every one of them with `PINNED_ARTIFACT_DATE`. The mode
   * is normalized the same way classic packaging normalizes it (see
   * `lib/plugins/package/lib/zip-service.js`), so a file that differs only by a
   * group-writable bit — a different umask on a CI box — still hashes the same.
   *
   * The `fs.Stats` are carried along rather than discarded because archiver
   * needs them: see `_writeArchive`.
   *
   * @returns {Promise<Array<{ absPath: string, zipPath: string, mode: number, stats: import('fs').Stats }>>}
   */
  async _collectBuildDirEntries() {
    const serviceDir = this.serverless.config.serviceDir
    const entries = []
    const claimed = this.patternClaimedBuildPaths ?? new Set()
    const claimedUnder = (root) => {
      for (const claimedPath of claimed) {
        if (claimedPath.startsWith(`${root}/`)) return true
      }
      return false
    }

    // `onlyClaimed` is set while walking below one of the roots the artifact
    // skips by default: only what a positive pattern put there is kept, the
    // install residue beside it (a `.yarn/cache`, say) stays out.
    const walk = async (dir, onlyClaimed = false) => {
      for (const dirent of await readdir(dir, { withFileTypes: true })) {
        const absPath = path.join(dir, dirent.name)
        // Archive names are POSIX on every platform, and the sort, the pattern
        // filters and the handler assertion all compare against this form.
        const zipPath = path
          .relative(this.buildDirPath, absPath)
          .split(path.sep)
          .join('/')

        if (!onlyClaimed && BUILD_DIR_EXCLUDED_ROOT_ENTRIES.has(zipPath)) {
          if (dirent.isDirectory()) {
            if (claimedUnder(zipPath)) await walk(absPath, true)
            continue
          }
          if (!claimed.has(zipPath)) continue
        }
        // Only build metadata the service does not own itself. Under
        // `bundle: false` the project sweep copies the service's own files into
        // this directory, so a `meta.json` here can be the service's rather
        // than esbuild's.
        if (
          BUILD_METAFILE_RE.test(zipPath) &&
          !existsSync(path.join(serviceDir, zipPath))
        ) {
          continue
        }

        if (dirent.isDirectory()) {
          await walk(absPath, onlyClaimed)
          continue
        }
        // Only regular files. Nothing writes a symlink, socket or device into
        // the build directory — outputs are written by esbuild and assets are
        // copied with `copyFile`, which follows links — and handing archiver a
        // path it cannot stream would fail the deploy at finalize time.
        if (!dirent.isFile()) continue
        if (onlyClaimed && !claimed.has(zipPath)) continue

        // Same fail-fast contract as every other entry lookup: a file that
        // cannot be stat'ed fails packaging with a clean CANNOT_READ_FILE
        // rather than an unwrapped errno bubbling out of the walk.
        const stats = await statIncludeEntry(absPath)
        entries.push({
          absPath,
          zipPath,
          stats,
          mode: normalizedEntryMode(stats),
        })
      }
    }

    if (existsSync(this.buildDirPath)) {
      await walk(this.buildDirPath)
    }

    entries.sort((a, b) =>
      a.zipPath < b.zipPath ? -1 : a.zipPath > b.zipPath ? 1 : 0,
    )
    return entries
  }

  /**
   * Service-relative POSIX paths selected by a `package.patterns` list.
   *
   * Only the positive patterns are globbed — a negation removes, it never adds
   * — but the ORDERED list still decides what survives, so a later `!`
   * genuinely retracts an earlier match (`['assets/**', '!assets/secret.txt']`).
   *
   * The glob has already done the selecting, so the ordered pass runs with
   * everything it returned INCLUDED and only ever retracts. Starting from
   * excluded instead would re-test each path against the literal patterns and
   * silently drop whatever the glob expanded rather than matched: globby
   * resolves a bare directory (`patterns: ['assets']`) to the files beneath it,
   * and `assets/logo.png` does not match the literal `assets`. That dropped the
   * whole tree such a pattern is meant to ship — and counted every file as an
   * exclusion, so the artifact also reported entries it had never been asked to
   * remove.
   *
   * `excludedCount` is how many of the globbed paths a negation retracted, so
   * the caller can fold additive-include exclusions into the same counters the
   * node_modules entry filter reports through.
   *
   * @param {string[]} patterns - ordered `package.patterns` entries
   * @returns {Promise<{ matches: string[], excludedCount: number }>}
   */
  async _resolvePatternFiles(patterns) {
    const positives = patterns.filter(
      (pattern) => typeof pattern === 'string' && !pattern.startsWith('!'),
    )
    if (positives.length === 0) return { matches: [], excludedCount: 0 }

    const globbed = await globby(positives, {
      cwd: this.serverless.config.serviceDir,
      dot: true,
      onlyFiles: true,
      ignore: [...PATTERN_RESOLVE_IGNORE, ...this._packageDirectoryIgnores()],
    })
    const matches = filterPaths(compilePatterns(patterns), globbed, true)
    return { matches, excludedCount: globbed.length - matches.length }
  }

  /**
   * The configured package directory (`--package <dir>` or `package.path`) as
   * a glob to hard-ignore, or nothing when there is no such directory inside
   * the service.
   *
   * `serverless package --package ./dist` moves the whole of `.serverless/`
   * — the artifact AND the open build directory — into `dist/`. Left in the
   * sweep, the next run packages the previous zip plus a full copy of the
   * previous build, and the artifact doubles with every run; a broad pattern
   * (`**`) does the same on the bundled path. So the directory is treated
   * exactly like `.serverless/**`: never swept, never selectable by a pattern.
   *
   * Only a directory strictly inside the service directory qualifies. `.`
   * would exclude the whole service, and anything at or above it is not part
   * of the sweep in the first place. The precedence mirrors the framework's
   * own (`AwsDeploy.packagePath`): the flag wins over the config key.
   *
   * @returns {string[]} zero or one POSIX glob, service-relative
   */
  _packageDirectoryIgnores() {
    const configured =
      this.options.package || this.serverless.service.package?.path
    if (typeof configured !== 'string' || configured === '') return []
    const serviceDir = this.serverless.config.serviceDir
    const relative = path.relative(
      serviceDir,
      path.resolve(serviceDir, configured),
    )
    if (
      relative === '' ||
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      // Windows: a directory on another drive comes back absolute.
      path.isAbsolute(relative)
    ) {
      return []
    }
    const glob = `${relative.split(path.sep).join('/')}/**`
    logger.debug(
      `Package directory ${relative} is inside the service directory: ignoring ${glob} when building and packaging`,
    )
    return [glob]
  }

  /**
   * Remember which build-directory paths a positive pattern placed under a
   * root the artifact walk skips by default, so `_collectBuildDirEntries`
   * keeps them. Everything else is dropped here: the set only ever holds
   * paths the walk would otherwise lose, never the whole tree.
   *
   * @param {string[]} zipPaths - build-directory-relative POSIX paths
   */
  _claimBuildPaths(zipPaths) {
    for (const zipPath of zipPaths) {
      const root = zipPath.split('/', 1)[0]
      if (BUILD_DIR_EXCLUDED_ROOT_ENTRIES.has(root)) {
        this.patternClaimedBuildPaths.add(zipPath)
      }
    }
  }

  /**
   * Copy the files service-level `package.patterns` select into the build
   * directory, overwriting whatever the build emitted at the same path.
   *
   * Patterns used to be added straight into the zip at packaging time. Copying
   * them into the build directory instead is what keeps the artifact and the
   * build directory the same tree: `invoke local`, dev mode and the deployed
   * function then all load the identical file. It also settles who wins when
   * both produce the same path — the patterns do, which is the behavior the
   * zip-time add had, since it was appended last.
   *
   * Runs after `spawn('esbuild-package')` so a plugin's injections are in place
   * first and the user's patterns still get the final word.
   *
   * Matches landing on the installed dependency tree are NOT copied — that
   * would overwrite the install the pruned package.json produced, and
   * `_resetBuildDir` would preserve the damage into every later deploy. They
   * are handed back as archive entries instead, so the artifact still ships
   * them (a vendored or patched dependency is a normal thing to name in a
   * pattern) straight from the service directory.
   *
   * @returns {Promise<{ excludedCount: number, installedTreeEntries: Array<object> }>}
   *   how many globbed paths the patterns retracted, and the archive entries
   *   for the matches that may not be copied
   */
  async _copyPatternsIntoBuildDir() {
    const serviceDir = this.serverless.config.serviceDir
    const { matches, excludedCount } = await this._resolvePatternFiles(
      this.serverless.service.package?.patterns ?? [],
    )
    // Matches above the service directory are placed by `archivePathFor`, so
    // the installed-tree test and the copy destination both look at where the
    // file lands, not where it came from: `../node_modules/hoisted/**` in a
    // monorepo is an installed-tree match like any other.
    const installedTreeEntries = await this._patternEntriesForPaths(
      matches.filter((relativePath) =>
        isInstalledDependencyPath(archivePathFor(relativePath)),
      ),
    )
    const toCopy = matches.filter(
      (relativePath) =>
        !isInstalledDependencyPath(archivePathFor(relativePath)),
    )
    const relocated = matches.filter(
      (relativePath) => archivePathFor(relativePath) !== relativePath,
    )
    if (relocated.length > 0) {
      logger.debug(
        `${relocated.length} "package.patterns" match(es) reach above the service directory and are packaged at the path that remains: ${relocated
          .map(
            (relativePath) =>
              `${relativePath} -> ${archivePathFor(relativePath)}`,
          )
          .join(', ')}`,
      )
    }
    this._claimBuildPaths(toCopy.map(archivePathFor))
    if (toCopy.length === 0) return { excludedCount, installedTreeEntries }

    let replacedDiffering = 0
    const limit = pLimit(COPY_CONCURRENCY)

    await Promise.all(
      toCopy.map((relativePath) =>
        limit(async () => {
          const source = path.join(serviceDir, relativePath)
          const destination = path.join(
            this.buildDirPath,
            archivePathFor(relativePath),
          )

          // A file can vanish between glob expansion and the copy. Probing it
          // first turns that into the same clean CANNOT_READ_FILE the archive
          // append path raises, instead of an unwrapped ENOENT from copyFile.
          await statIncludeEntry(source)

          if (existsSync(destination)) {
            const [incoming, existing] = await Promise.all([
              readFile(source),
              readFile(destination),
            ])
            if (!incoming.equals(existing)) replacedDiffering += 1
          }

          await mkdir(path.dirname(destination), { recursive: true })
          await copyFile(source, destination)
        }),
      ),
    )

    // One aggregated warning, not one per file: a pattern that shadows a whole
    // generated directory would otherwise print a wall of them.
    if (replacedDiffering > 0) {
      logger.warning(
        `${replacedDiffering} file(s) matched by "package.patterns" replaced esbuild build outputs with different content. ` +
          `The copies from your source directory are what deploys.`,
      )
    }
    return { excludedCount, installedTreeEntries }
  }

  /**
   * Pattern-selected files as archive entries, for a zip that takes them
   * directly rather than through the build directory (per-function patterns,
   * which belong to one function's artifact only).
   *
   * @param {string[]} patterns - ordered `package.patterns` entries
   * @returns {Promise<{ entries: Array<{ absPath: string, zipPath: string, mode: number, stats: import('fs').Stats }>, excludedCount: number }>}
   */
  async _patternEntries(patterns) {
    const { matches, excludedCount } = await this._resolvePatternFiles(patterns)
    return {
      entries: await this._patternEntriesForPaths(matches),
      excludedCount,
    }
  }

  /**
   * Service-relative POSIX paths as archive entries, stamped with the same
   * normalized mode the build-directory walk stamps its own with. A path that
   * reaches above the service directory is read from where it is and named
   * by `archivePathFor`.
   *
   * @param {string[]} relativePaths
   * @returns {Promise<Array<{ absPath: string, zipPath: string, mode: number, stats: import('fs').Stats }>>}
   */
  async _patternEntriesForPaths(relativePaths) {
    const serviceDir = this.serverless.config.serviceDir
    const limit = pLimit(COPY_CONCURRENCY)

    return Promise.all(
      relativePaths.map((relativePath) =>
        limit(async () => {
          const absPath = path.join(serviceDir, relativePath)
          const stats = await statIncludeEntry(absPath)
          return {
            absPath,
            zipPath: archivePathFor(relativePath),
            stats,
            mode: normalizedEntryMode(stats),
          }
        }),
      ),
    )
  }

  /**
   * How many dependencies the package.json the artifact ships declares. Used to
   * tell a deliberately dependency-free service from one whose dependencies
   * were filtered out from under it.
   *
   * @returns {Promise<number>}
   */
  async _declaredDependencyCount() {
    try {
      const raw = await readFile(
        path.join(this.buildDirPath, 'package.json'),
        'utf8',
      )
      return Object.keys(JSON.parse(raw).dependencies ?? {}).length
    } catch {
      // No package.json, or one nothing can parse. Either way there is no
      // dependency declaration to contradict an empty `node_modules`.
      return 0
    }
  }

  /**
   * Report what `package.patterns` did to one artifact: an info line naming the
   * artifact when anything was excluded, an unconditional debug trace of the
   * patterns and the counters, and a once-per-invocation warning when the
   * patterns leave no dependencies behind for a build that needs them in the
   * artifact.
   *
   * Call this only after the artifact's zip promise settled — the counters are
   * incremented from the node_modules entry filter and are not final before
   * then.
   *
   * @param {object} params
   * @param {string} params.zipName - Artifact file name, e.g. `my-service-fn1.zip`.
   * @param {string} params.subject - What the debug trace is about: the function
   *   alias when packaging individually, the service zip name otherwise.
   * @param {Array<object>} params.compiledPatterns - Compiled ordered patterns.
   * @param {number} params.excludedEntryCount - Entries the patterns removed.
   * @param {number} params.excludedNodeModulesEntryCount - Of those, entries
   *   removed from the node_modules walk rather than from additive includes or
   *   the build-directory sweep.
   * @param {number} params.excludedNodeModulesFileCount - Of those, the ones
   *   that were files rather than directory entries. Only this can attest that
   *   a dependency was actually lost, so it is what arms the warning.
   * @param {number} params.includedNodeModulesFileCount - node_modules files kept.
   * @param {object} params.buildProperties - The merged esbuild build properties.
   * @param {number} [params.declaredDependencyCount] - Dependencies the
   *   generated package.json shipping in the artifact declares — the precise
   *   statement of what this artifact needs installed beside it at runtime.
   */
  _reportPatternFiltering({
    zipName,
    subject,
    compiledPatterns,
    excludedEntryCount,
    excludedNodeModulesEntryCount,
    excludedNodeModulesFileCount,
    includedNodeModulesFileCount,
    buildProperties,
    declaredDependencyCount = 0,
  }) {
    if (excludedEntryCount > 0) {
      logger.info(
        `Excluded ${excludedEntryCount} entries from ${zipName} via package.patterns`,
      )
    }
    logger.debug(
      `package.patterns for ${subject}: ${JSON.stringify(
        compiledPatterns,
      )} (excluded ${excludedEntryCount}, node_modules entries excluded ${excludedNodeModulesEntryCount}, node_modules files kept ${includedNodeModulesFileCount})`,
    )
    // Keyed on the generated manifest rather than the config shape. The pruned
    // `build/package.json` is the precise statement of "dependencies this
    // artifact needs installed beside it at runtime": it already accounts for
    // the aws-sdk exclusions and for bundling having inlined everything else,
    // so a non-empty `dependencies` there means an emptied node_modules is
    // MODULE_NOT_FOUND on the first invocation — whichever combination of
    // `bundle`, `packages` and `external` produced it. Inferring from the
    // config instead missed `bundle: true` with `external: [...]`, which ships
    // exactly that manifest and had no arm of its own.
    //
    // `packages: 'external'` stays as a second arm: it declares the intent
    // even when the manifest cannot (a service that declares no dependencies
    // of its own still asked for nothing to be bundled).
    const artifactNeedsDependencies =
      declaredDependencyCount > 0 || buildProperties.packages === 'external'
    // Scoped to node_modules FILES on purpose. Excluding only additive includes
    // says nothing about dependencies, and warning there would make a false
    // claim; so would counting the directory husks a pattern strips out of a
    // node_modules that never held a file. This cannot miss a real case -- if
    // node_modules held a file that the patterns stripped, the entry filter ran
    // and counted it.
    if (
      includedNodeModulesFileCount === 0 &&
      excludedNodeModulesFileCount > 0 &&
      artifactNeedsDependencies &&
      !this._nodeModulesExclusionWarned
    ) {
      this._nodeModulesExclusionWarned = true
      logger.warning(
        'package.patterns exclude everything under node_modules, but this build requires dependencies in the artifact ' +
          '(packages: external, or a non-bundled build with declared dependencies). ' +
          'If dependencies are provided another way (e.g. a Lambda layer) or this exclusion predates build.esbuild, review or remove these patterns.',
      )
    }
  }

  /**
   * Append the collected entries, then the installed dependencies, and settle
   * once the archive is on disk.
   *
   * The stream wiring is the delicate part. `zip.finalize()` resolving is not
   * the same as the file being complete, so the promise settles on the output
   * stream's `close`; both the stream and the archive get error listeners,
   * because an unlistened archiver `error` event throws out of an internal
   * callback where nothing can catch it, and every await inside the `open`
   * handler is wrapped so a throw there rejects rather than leaving the promise
   * pending forever.
   *
   * Each entry hands archiver the `fs.Stats` the walk already took. That is not
   * an optimization: an entry appended WITHOUT stats goes through archiver's
   * internal stat queue, which runs four at a time and re-injects each task as
   * its stat resolves — so the archive order becomes the order the filesystem
   * answered in, and identical content produces differently-ordered (and
   * therefore differently-hashed) zips from one run to the next. With stats
   * supplied, entries are queued synchronously, in the sorted order they were
   * appended in.
   *
   * @param {object} options
   * @param {string} options.zipPath - where to write the archive
   * @param {Array<{absPath: string, zipPath: string, mode: number}>} options.entries
   * @param {Array<object>} options.compiledPatterns - compiled ordered patterns
   *   governing `node_modules`
   * @returns {Promise<{ excludedEntryCount: number, excludedNodeModulesEntryCount: number, includedNodeModulesFileCount: number }>}
   *   the node_modules walk's pattern counters
   */
  async _writeArchive({ zipPath, entries, compiledPatterns }) {
    const nodeModulesPath = path.join(this.buildDirPath, 'node_modules')
    const { filter: patternEntryFilter, counters } =
      createNodeModulesEntryFilter(compiledPatterns)

    // A `package.patterns` match on the installed tree is appended above, from
    // the service directory, so the installed file at the same archive path
    // must not be appended too. The pattern copy is the one that wins: naming a
    // dependency file in a pattern means "ship MY copy". Without this dedup the
    // archive carries both entries and extractors take whichever was written
    // last — a race while entry order depended on archiver's stat queue, and
    // the installed copy once the order became deterministic, which silently
    // turned the pattern into a no-op.
    const claimedByPatterns = new Set(
      entries
        .map((entry) => entry.zipPath)
        .filter((entryZipPath) => isInstalledDependencyPath(entryZipPath)),
    )
    const nodeModulesEntryFilter =
      claimedByPatterns.size === 0
        ? patternEntryFilter
        : (entry, stats) => {
            if (!claimedByPatterns.has(`node_modules/${entry}`)) {
              return patternEntryFilter(entry, stats)
            }
            // Skipped, but NOT excluded: the archive still carries this path,
            // supplied by the pattern entry. It has to count as a dependency
            // file kept, or a node_modules the patterns fully re-supplied looks
            // emptied — `patterns: ['**', '!node_modules/**/*.md']` over a real
            // install claims every file, and leaving them uncounted fired the
            // emptied-node_modules warning on an artifact that ships every
            // dependency. Counting happens here rather than through the shared
            // filter so the pattern-exclusion counters stay untouched.
            if (!stats.isDirectory()) {
              counters.includedNodeModulesFileCount += 1
            }
            return false
          }

    const zip = new ZipArchive()
    const output = createWriteStream(zipPath)

    await new Promise((resolve, reject) => {
      output.on('close', () => resolve(zipPath))
      output.on('error', reject)
      zip.on('error', reject)

      output.on('open', async () => {
        try {
          zip.pipe(output)

          for (const entry of entries) {
            zip.file(entry.absPath, {
              name: entry.zipPath,
              date: PINNED_ARTIFACT_DATE,
              mode: entry.mode,
              stats: entry.stats,
            })
          }

          // Expanded and appended in sorted order rather than handed to
          // `zip.directory()`: archiver's own walk feeds entries in readdir
          // order, which differs per filesystem, so the same unchanged tree
          // hashed differently between machines. Skipped when absent — a
          // service with no dependencies at all never gets one installed.
          // Modes are normalized here because the tree comes from a package
          // manager install whose permissions follow the local umask.
          if (existsSync(nodeModulesPath)) {
            await appendDirectoryEntries(
              zip,
              nodeModulesPath,
              'node_modules',
              nodeModulesEntryFilter,
              true,
            )
          }

          await zip.finalize()
        } catch (err) {
          reject(err)
        }
      })
    })

    return counters
  }

  /**
   * The entry names a finished archive actually contains, read back out of its
   * central directory.
   *
   * The handler assertion is worth nothing if it checks the list packaging
   * MEANT to write: an entry archiver dropped, renamed while sanitizing, or
   * never flushed would sail straight through. So it is read off the file on
   * disk instead.
   *
   * Only the directory itself is read, never the archive body — a Lambda
   * artifact runs to hundreds of megabytes and loading it into a buffer to
   * answer "which names are in here" is not affordable. ZIP64 is handled
   * because it is genuinely reachable: archiver switches to it above 65535
   * entries, which a real `node_modules` passes easily.
   *
   * Returns `null` rather than throwing if the archive cannot be read as
   * expected. The caller then falls back to the intended list: this check
   * exists to catch a missing handler, and it must never be the thing that
   * invents one.
   *
   * @param {string} zipPath
   * @returns {Promise<Set<string>|null>}
   */
  async _readArchiveEntryNames(zipPath) {
    let handle
    try {
      handle = await open(zipPath, 'r')
      const { size } = await handle.stat()

      // The end-of-central-directory record is last, but a trailing comment
      // (up to 64KiB) can sit behind it, so scan back over that window.
      const tailLength = Math.min(size, 22 + 0xffff)
      const tail = Buffer.alloc(tailLength)
      await handle.read(tail, 0, tailLength, size - tailLength)

      let eocd = -1
      for (let i = tail.length - 22; i >= 0; i -= 1) {
        if (tail.readUInt32LE(i) === 0x06054b50) {
          eocd = i
          break
        }
      }
      if (eocd === -1) return null

      let entryCount = tail.readUInt16LE(eocd + 10)
      let directorySize = tail.readUInt32LE(eocd + 12)
      let directoryOffset = tail.readUInt32LE(eocd + 16)

      // Any of the three saturated means the real values live in the ZIP64
      // record, found through the locator that sits immediately before the
      // classic one.
      if (
        entryCount === 0xffff ||
        directorySize === 0xffffffff ||
        directoryOffset === 0xffffffff
      ) {
        const locator = eocd - 20
        if (locator < 0 || tail.readUInt32LE(locator) !== 0x07064b50)
          return null
        const zip64Offset = Number(tail.readBigUInt64LE(locator + 8))
        const zip64 = Buffer.alloc(56)
        await handle.read(zip64, 0, 56, zip64Offset)
        if (zip64.readUInt32LE(0) !== 0x06064b50) return null
        entryCount = Number(zip64.readBigUInt64LE(32))
        directorySize = Number(zip64.readBigUInt64LE(40))
        directoryOffset = Number(zip64.readBigUInt64LE(48))
      }

      // Every figure above comes off the file being read, so none of them can
      // be trusted to be sane. The central directory lives inside the archive
      // and each of its records is at least 46 bytes; anything else means the
      // record was misread, and allocating on it would abort the whole CLI
      // with an out-of-memory crash rather than fail this one check.
      if (
        directoryOffset < 0 ||
        directorySize < 0 ||
        directoryOffset + directorySize > size ||
        entryCount < 0 ||
        entryCount * 46 > directorySize
      ) {
        return null
      }

      const directory = Buffer.alloc(directorySize)
      await handle.read(directory, 0, directorySize, directoryOffset)

      const names = new Set()
      let offset = 0
      for (let i = 0; i < entryCount; i += 1) {
        if (offset + 46 > directory.length) return null
        if (directory.readUInt32LE(offset) !== 0x02014b50) return null
        const nameLength = directory.readUInt16LE(offset + 28)
        const extraLength = directory.readUInt16LE(offset + 30)
        const commentLength = directory.readUInt16LE(offset + 32)
        names.add(
          directory.toString('utf8', offset + 46, offset + 46 + nameLength),
        )
        offset += 46 + nameLength + extraLength + commentLength
      }
      return names
    } catch {
      return null
    } finally {
      await handle?.close()
    }
  }

  /**
   * Every function's handler has to be in the artifact that ships it.
   *
   * The build records where it wrote each handler; packaging appends the build
   * directory. If the two disagree the function is deployed with no handler in
   * it and only fails when it is first invoked, so the disagreement is fatal
   * here instead.
   *
   * Functions with no recorded artifact are exempt: `_assertAllHandlersBuilt`
   * has already decided about them, and the ones it let through are
   * layer-provided wrappers whose handler is not supposed to be in the zip.
   *
   * The names come from the finished archive's own central directory, so this
   * asserts what shipped rather than what packaging intended to ship. The
   * caller's intended list is only the fallback for an archive that cannot be
   * read back (see `_readArchiveEntryNames`).
   *
   * @param {Object} functions - the functions this archive was built for
   * @param {Set<string>} intendedZipPaths - archive paths packaging appended
   * @param {string} zipPath - the archive to read back
   */
  async _assertHandlersInArtifact(functions, intendedZipPaths, zipPath) {
    const builtArtifacts = this.builtArtifacts ?? new Map()
    const appendedZipPaths =
      (await this._readArchiveEntryNames(zipPath)) ?? intendedZipPaths
    const missing = []

    for (const alias of Object.keys(functions)) {
      const artifact = builtArtifacts.get(alias)
      if (!artifact) continue
      if (!appendedZipPaths.has(artifact.outfile)) {
        missing.push(`"${alias}" (${artifact.outfile})`)
      }
    }

    if (missing.length > 0) {
      throw new ServerlessError(
        `The handler files for ${missing.join(', ')} are missing from the deployment artifact ${zipPath}. ` +
          `A "package.patterns" exclusion, or something removing files from "${this.buildDirPath}" after the build, is the usual cause.`,
        'ESBUILD_HANDLER_MISSING_FROM_ARTIFACT',
      )
    }
  }

  /**
   * Take the current build context. Which could be service-wide or a given function and then package it.
   *
   * This function takes package.individually into account and will either create a single zip file to use for all functions or a zip file per function otherwise.
   *
   * @param {string} handlerPropertyName - The property name of the handler in the function object. In the case of dev mode this will be different, so we need to be able to set it.
   */
  async _package(handlerPropertyName = 'handler') {
    const functions = await this.functions(handlerPropertyName)
    const buildProperties = await this._buildProperties()

    if (Object.keys(functions).length === 0) {
      log.debug('No functions to package')
      return
    }

    // If not packaging individually then package all functions together into a single zip
    if (!this.serverless?.service?.package?.individually) {
      await this._packageAll(functions)
      return
    }

    const concurrency =
      buildProperties.buildConcurrency ?? Object.keys(functions).length

    const limit = pLimit(concurrency)

    await this.serverless.pluginManager.spawn('esbuild-package')
    const { excludedCount: excludedServiceIncludeCount, installedTreeEntries } =
      await this._copyPatternsIntoBuildDir()

    // Walked once and shared: every function's zip is a subset of the same
    // build directory, plus the service-level pattern matches that could not be
    // copied into it. Both are shared across the functions and both are
    // narrowable by a function-level negation, so they travel together.
    const buildDirEntries = [
      ...(await this._collectBuildDirEntries()),
      ...installedTreeEntries,
    ]
    const servicePatterns = this.serverless.service.package?.patterns ?? []
    // Read once for the whole run: every artifact ships the same build-dir
    // package.json, and it only gates the non-bundled arm of the warning.
    const declaredDependencyCount = await this._declaredDependencyCount()

    // Everything the build emitted for any function. With bundling on, each
    // bundle already contains every dependency its own handler needs, so
    // shipping the other functions' bundles in this function's zip is pure
    // weight — that is the whole point of `package.individually`. With bundling
    // off, the emitted files ARE the project and every function needs all of
    // them.
    const allArtifactPaths = new Set()
    for (const { outfile, mapfile } of (
      this.builtArtifacts ?? new Map()
    ).values()) {
      allArtifactPaths.add(outfile)
      if (mapfile) allArtifactPaths.add(mapfile)
    }

    const zipPromises = Object.entries(functions).map(
      ([functionAlias, functionObject]) => {
        return limit(async () => {
          const zipName = `${this.serverless.service.service}-${functionAlias}.zip`
          const zipPath = path.join(
            this.serverless.config.serviceDir,
            '.serverless',
            zipName,
          )

          const functionPatterns = functionObject.package?.patterns ?? []
          const compiledFunctionPatterns = compilePatterns(functionPatterns)
          // Service- and function-level patterns merge in that order so that
          // a function can re-include (or further exclude) what the service
          // level decided; `last match wins` then falls out of the ordering.
          const mergedPatterns = [...servicePatterns, ...functionPatterns]
          const compiledPatterns = compilePatterns(mergedPatterns)

          const own =
            (this.builtArtifacts ?? new Map()).get(functionAlias) ?? {}
          const excluded =
            buildProperties.bundle === false
              ? new Set()
              : new Set(
                  [...allArtifactPaths].filter(
                    (artifactPath) =>
                      artifactPath !== own.outfile &&
                      artifactPath !== own.mapfile,
                  ),
                )

          // Per-function patterns are additive to THIS zip only, so they are
          // appended here rather than copied into the shared build directory.
          // When one names a path the build directory also holds, the pattern
          // copy is the one that ships — the same precedence service-level
          // patterns get from overwriting the build directory — and the
          // build-dir entry is dropped so the archive never carries the name
          // twice.
          const {
            entries: patternEntries,
            excludedCount: excludedFunctionIncludeCount,
          } = await this._patternEntries(functionPatterns)
          const patternZipPaths = new Set(
            patternEntries.map((entry) => entry.zipPath),
          )

          // Build-directory entries a function-level negation retracted count
          // as pattern exclusions too, exactly like the ones the node_modules
          // filter and the include lists contribute.
          let excludedBuildDirEntryCount = 0
          const entries = [
            ...buildDirEntries.filter((entry) => {
              if (
                excluded.has(entry.zipPath) ||
                patternZipPaths.has(entry.zipPath)
              ) {
                return false
              }
              // Negations in the function's own pattern list are the classic
              // per-function slimming escape hatch — over project files. The
              // generated manifest and lockfile are not project files and
              // always ship (see `ARTIFACT_MANIFEST_ENTRIES`).
              if (
                !ARTIFACT_MANIFEST_ENTRIES.has(entry.zipPath) &&
                !isPathIncluded(compiledFunctionPatterns, entry.zipPath)
              ) {
                excludedBuildDirEntryCount += 1
                return false
              }
              return true
            }),
            ...patternEntries,
          ].sort((a, b) =>
            a.zipPath < b.zipPath ? -1 : a.zipPath > b.zipPath ? 1 : 0,
          )

          const patternCounters = await this._writeArchive({
            zipPath,
            entries,
            compiledPatterns,
          })
          patternCounters.excludedEntryCount +=
            excludedServiceIncludeCount +
            excludedFunctionIncludeCount +
            excludedBuildDirEntryCount

          await this._assertHandlersInArtifact(
            { [functionAlias]: functionObject },
            new Set(entries.map((entry) => entry.zipPath)),
            zipPath,
          )

          functionObject.package = {
            artifact: zipPath,
          }

          // Counters are only final once the output stream closed, which
          // `_writeArchive` already awaited.
          this._reportPatternFiltering({
            zipName,
            subject: functionAlias,
            compiledPatterns,
            ...patternCounters,
            buildProperties,
            declaredDependencyCount,
          })
        })
      },
    )

    try {
      await Promise.all(zipPromises)
    } catch (err) {
      if (err instanceof ServerlessError) throw err
      throw new ServerlessError(err.message, 'ESBULD_PACKAGE_ERROR')
    }
  }

  /**
   * Package every function into one archive: the whole build directory plus the
   * installed dependencies.
   *
   * @param {Object} functions - the functions this artifact ships
   */
  async _packageAll(functions) {
    const buildProperties = await this._buildProperties()
    const zipName = `${this.serverless.service.service}.zip`
    const zipPath = path.join(
      this.serverless.config.serviceDir,
      '.serverless',
      zipName,
    )

    await this.serverless.pluginManager.spawn('esbuild-package')
    const { excludedCount: excludedServiceIncludeCount, installedTreeEntries } =
      await this._copyPatternsIntoBuildDir()

    // Sorted together, so the pattern-supplied dependency files take their
    // place in the same byte-wise order the build-directory sweep produces.
    const entries = [
      ...(await this._collectBuildDirEntries()),
      ...installedTreeEntries,
    ].sort((a, b) =>
      a.zipPath < b.zipPath ? -1 : a.zipPath > b.zipPath ? 1 : 0,
    )
    // Only service-level patterns apply here: a single shared zip has no
    // per-function view to narrow, so function-level patterns are ignored
    // without `individually` — same as classic packaging.
    const patterns = this.serverless.service.package?.patterns ?? []
    const compiledPatterns = compilePatterns(patterns)

    let patternCounters
    try {
      patternCounters = await this._writeArchive({
        zipPath,
        entries,
        compiledPatterns,
      })
    } catch (err) {
      if (err instanceof ServerlessError) throw err
      throw new ServerlessError(err.message, 'ESBULD_PACKAGE_ALL_ERROR')
    }
    patternCounters.excludedEntryCount += excludedServiceIncludeCount

    this.serverless.service.package.artifact = zipPath

    // Counters are only final once the output stream closed, which
    // `_writeArchive` already awaited.
    this._reportPatternFiltering({
      zipName,
      subject: zipName,
      compiledPatterns,
      ...patternCounters,
      buildProperties,
      declaredDependencyCount: await this._declaredDependencyCount(),
    })

    await this._assertHandlersInArtifact(
      functions,
      new Set(entries.map((entry) => entry.zipPath)),
      zipPath,
    )
  }

  /**
   * Searches for the directory containing the compose file up to 5 levels up.
   * @param {string} startDir - The directory to start the search from.
   * @param {number} maxLevelsUp - The maximum number of parent directories to search, default is 5.
   * @returns {string|null} - The directory path containing the file, or null if not found.
   */
  async _getComposeDir(startDir = process.cwd(), maxLevelsUp = 5) {
    let currentDir = path.resolve(startDir)

    for (let i = 0; i <= maxLevelsUp; i++) {
      const composeYmlPath = path.join(currentDir, 'serverless-compose.yml')
      const composeYamlPath = path.join(currentDir, 'serverless-compose.yaml')

      if (existsSync(composeYmlPath) || existsSync(composeYamlPath)) {
        return currentDir
      }

      const parentDir = path.dirname(currentDir)

      if (parentDir === currentDir) {
        // Reached root directory
        break
      }

      currentDir = parentDir
    }

    return null
  }

  /**
   * Take the package.json and add an updated version with no dev dependencies and external and excluded node_modules taken care of, to the .serverless/build directory
   */
  async _preparePackageJson() {
    const runtime = this.serverless.service.provider.runtime || 'nodejs18.x'
    const { external, exclude } = await this._externals(runtime)

    const packageJson = await this._readPackageJson()

    let composePackageJson = {}

    if (this.serverless.compose.isWithinCompose) {
      const composeDir = await this._getComposeDir(
        this.serverless.config.serviceDir,
      )

      if (composeDir) {
        composePackageJson = await this._readPackageJson(
          path.join(composeDir, 'package.json'),
        )
      } else {
        logger.info(
          'Could not locate serverless-compose.yml file. ' +
            'Dependencies from the compose root package.json will not be included in the build. ' +
            'This may cause issues if your service relies on dependencies defined at the compose level.',
        )
      }
    }

    const packageJsonNoDevDeps = {
      ...packageJson,
    }

    delete packageJsonNoDevDeps.devDependencies

    const buildProperties = await this._buildProperties()

    if (packageJson.dependencies || composePackageJson.dependencies) {
      if (buildProperties.packages !== 'external') {
        packageJsonNoDevDeps.dependencies = {}

        for (const key of external) {
          if (packageJson.dependencies && packageJson.dependencies[key]) {
            packageJsonNoDevDeps.dependencies[key] =
              packageJson.dependencies[key]
          }

          if (
            composePackageJson.dependencies &&
            composePackageJson.dependencies[key] &&
            !packageJsonNoDevDeps.dependencies[key]
          ) {
            packageJsonNoDevDeps.dependencies[key] =
              composePackageJson.dependencies[key]
          }
        }
      } else {
        // packages: 'external' keeps the service's own dependencies — even an
        // explicitly empty `dependencies: {}` — exactly as declared: configs
        // that packaged successfully before must keep producing identical
        // artifacts. The compose-root fallback applies only to a service with
        // no dependencies declaration at all, which previously crashed here.
        packageJsonNoDevDeps.dependencies = packageJson.dependencies
          ? { ...packageJson.dependencies }
          : { ...composePackageJson.dependencies }
      }

      for (const key of exclude) {
        delete packageJsonNoDevDeps.dependencies[key]
      }
    }

    const buildDir = path.join(
      this.serverless.config.serviceDir,
      '.serverless',
      'build',
    )

    // The writer guarantees its own directory. `_build` creates it on every
    // path that reaches here, but a caller ordering that ever changed would
    // fail with a raw ENOENT from `writeFile` rather than anything actionable.
    await mkdir(buildDir, { recursive: true })

    // Copy package.json
    await writeFile(
      path.join(buildDir, 'package.json'),
      JSON.stringify(packageJsonNoDevDeps, null, 2),
    )

    // Copy appropriate lockfile if it exists
    const packager = this._determinePackager()
    const lockFiles = {
      npm: 'package-lock.json',
      yarn: 'yarn.lock',
      pnpm: 'pnpm-lock.yaml',
    }

    const lockFile = path.join(
      this.serverless.config.serviceDir,
      lockFiles[packager],
    )
    if (existsSync(lockFile)) {
      await copyFile(lockFile, path.join(buildDir, lockFiles[packager]))
    }

    /**
     * Make sure we copy over the pnpm-workspace.yml file if it exists so that
     * when we run pnpm install pnpm would know this is where to put node_modules.
     */
    if (packager === 'pnpm') {
      const workspaceFiles = ['pnpm-workspace.yaml', 'pnpm-workspace.yml']
      for (const workspaceFile of workspaceFiles) {
        const workspacePath = path.join(
          this.serverless.config.serviceDir,
          workspaceFile,
        )
        if (existsSync(workspacePath)) {
          await copyFile(workspacePath, path.join(buildDir, workspaceFile))
          break
        }
      }
    }

    // Install dependencies
    await new Promise((resolve, reject) => {
      let installArgs = ['install']

      if (packager === 'pnpm') {
        installArgs = ['install', '--no-frozen-lockfile']
      } else if (packager === 'yarn') {
        installArgs = ['install', '--no-immutable']
      }

      const p = spawnExt(
        packager,
        /**
         * In case of pnpm, we need to install with --no-frozen-lockfile
         * because pnpm fails to install by default if the lockfile is out of sync with the package.json file
         */
        installArgs,
        {
          cwd: buildDir,
        },
      )
      /**
       * Avoid unhandled rejections bubbling from spawnExt when the install exits non-zero.
       * Capture the error so we can append it if stdout/stderr stay empty.
       */
      let spawnError
      p.catch((error) => {
        spawnError = error
        logger.debug(
          `Failed to install dependencies with the "${packager}" packager: ${error.message}`,
        )
      })
      let stderr = ''
      let stdout = ''
      p.child.on('error', (error) => {
        logger.error('Error installing dependencies', error)
        reject(error)
      })
      p.child.stderr.on('data', (data) => {
        stderr += data
      })
      p.child.stdout.on('data', (data) => {
        stdout += data
      })
      p.child.on('close', (code) => {
        if (code !== 0) {
          let errorMessage = `Failed to install dependencies with the "${packager}" packager.`
          if (spawnError) errorMessage += ` ${spawnError.message}`
          if (stderr) errorMessage += `\n\n${stderr}`
          if (stdout) errorMessage += `\n\n${stdout}`
          return reject(new Error(errorMessage))
        }
        resolve()
      })
    })
  }

  _determinePackager() {
    if (existsSync(path.join(this.serverless.config.serviceDir, 'yarn.lock'))) {
      return 'yarn'
    } else if (
      existsSync(path.join(this.serverless.config.serviceDir, 'pnpm-lock.yaml'))
    ) {
      return 'pnpm'
    } else {
      return 'npm'
    }
  }

  /**
   * Clears previous build outputs so the packaging step can treat the build
   * directory as the complete artifact definition. `node_modules` and
   * lockfiles are preserved: they are not esbuild outputs, are regenerated
   * from package.json by the install step, and re-creating them cold on
   * every deploy is a measured multi-second regression.
   *
   * The wipe MUST stay in `_build`, before `spawn('esbuild-package')` runs.
   * `before:esbuild-package` is the supported injection point for plugins that
   * add files to the build directory, and the zip has to include what they
   * wrote -- moving the reset into `_package` would delete those files right
   * before packaging.
   */
  async _resetBuildDir() {
    const preserved = new Set([
      'node_modules',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
    ])
    try {
      if (existsSync(this.buildDirPath)) {
        for (const entry of await readdir(this.buildDirPath)) {
          if (preserved.has(entry)) continue
          await rm(path.join(this.buildDirPath, entry), {
            recursive: true,
            force: true,
          })
        }
      }
      await mkdir(this.buildDirPath, { recursive: true })
    } catch (err) {
      throw new ServerlessError(
        `Failed to reset the esbuild output directory "${this.buildDirPath}": ${err.message}`,
        'ESBUILD_BUILD_DIR_RESET_FAILED',
      )
    }
  }
}

export default Esbuild
