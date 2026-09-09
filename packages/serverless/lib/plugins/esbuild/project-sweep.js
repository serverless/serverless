import fs from 'fs'
import path from 'path'
import { globby } from 'globby'
import { createFilesMatcher, getTsconfig } from 'get-tsconfig'
import ServerlessError from '../../serverless-error.js'
import { compilePatterns, filterPaths } from '../../utils/package-patterns.js'

/**
 * File selection for non-bundled (`bundle: false`) esbuild builds.
 *
 * With bundling off, the artifact is no longer "one file per handler": every
 * source file the service ships has to be selected, transpiled or copied, and
 * placed in the build directory. The selection has to match what classic
 * packaging would have shipped for the same service, or turning bundling off
 * silently changes the contents of the deployment package.
 *
 * Everything here is pure -- no `this`, no serverless instance -- so the
 * selection rules can be pinned directly. Paths are POSIX throughout: globby
 * returns POSIX-separated relative paths on every platform, and micromatch
 * patterns are POSIX by definition, so no separator conversion happens (nor
 * may be introduced) between the sweep and the pattern filters.
 */

/** Extensions esbuild has to transpile; everything else is copied verbatim. */
export const COMPILE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.jsx',
])

/**
 * The extensions a tsconfig has any authority over. A tsconfig describes a
 * TypeScript program, so it decides which TypeScript files belong to the
 * build and nothing else: `.jsx`, `.js`, and every copied asset are outside
 * its remit even when `allowJs` would pull them into `tsc`.
 */
const TS_FAMILY_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts'])

/**
 * The file name a source file ends up under in the build directory. The
 * module-system-carrying extensions have to survive transpilation -- `.mts`
 * must stay ESM and `.cts` must stay CommonJS once Node resolves them -- while
 * the rest collapse onto `.js`. Files that are copied rather than compiled keep
 * their own name, which is why `.js`/`.mjs`/`.cjs` map to themselves: it is
 * exactly that identity which makes a hand-written `util.js` and a compiled
 * `util.ts` meet on the same output path.
 */
const OUTPUT_EXTENSION_BY_SOURCE = {
  '.ts': '.js',
  '.tsx': '.js',
  '.jsx': '.js',
  '.js': '.js',
  '.mts': '.mjs',
  '.mjs': '.mjs',
  '.cts': '.cjs',
  '.cjs': '.cjs',
}

/**
 * Bring a caller-supplied path onto the same footing as globby's output:
 * POSIX separators, no `./` prefix. Handler paths come from user configuration
 * (`handler: ./src/handler.ts`) and from Windows path joins, and a path that
 * only *looks* different from the swept one silently duplicates it in the
 * compile set and hides genuine output collisions.
 */
export const toSweptPath = (filePath) =>
  filePath.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '')

/**
 * A path input worth turning into a glob. Bare names can be handed to
 * `compilePatterns` blank and it drops them, but a blank name that has already
 * been suffixed (`'' + '/**'`) is no longer empty and would survive as `/**`.
 * That glob happens to match nothing today, so this guard is belt-and-braces
 * rather than load-bearing -- it keeps a blank layer path from ever reaching
 * micromatch as a pattern in the first place.
 */
const isUsablePathInput = (value) =>
  typeof value === 'string' && value.trim() !== ''

export function outputPathFor(sourcePath) {
  const ext = path.posix.extname(sourcePath)
  const mapped = OUTPUT_EXTENSION_BY_SOURCE[ext]
  if (!mapped) return sourcePath
  return sourcePath.slice(0, -ext.length) + mapped
}

/**
 * The module system a file's own directory declares, resolved the way Node
 * resolves it: the `type` of the nearest package.json at or above the file,
 * defaulting to CommonJS when nothing declares one.
 *
 * A non-bundled build emits one output per source file, and Node decides how to
 * load each of those outputs from exactly this rule. Compiling the whole
 * project to a single service-wide format would drop `export` statements into a
 * directory Node loads as CommonJS -- a monorepo package with its own
 * `"type": "module"`, or a `legacy/` folder pinned back to CommonJS -- and the
 * mistake only surfaces as a runtime `SyntaxError` on the deployed function.
 *
 * The walk stops at `serviceDir`: anything above it is the developer's machine,
 * not the service, and its `type` has no say over what gets deployed.
 *
 * @param {string} serviceDir absolute path to the service directory
 * @param {string} fileRelPath service-relative POSIX path of the source file
 * @param {Map<string, 'module'|'commonjs'>} [cache] per-directory memo, shared
 *   across the files of one build so each directory is stat'ed once
 * @returns {'module'|'commonjs'}
 */
export function nearestPackageJsonType(
  serviceDir,
  fileRelPath,
  cache = new Map(),
) {
  const resolveDir = (dir) => {
    const cached = cache.get(dir)
    if (cached !== undefined) return cached

    let result
    const pkgPath = path.join(
      serviceDir,
      ...(dir === '.' ? [] : dir.split('/')),
      'package.json',
    )
    if (fs.existsSync(pkgPath)) {
      try {
        result =
          JSON.parse(fs.readFileSync(pkgPath, 'utf8')).type === 'module'
            ? 'module'
            : 'commonjs'
      } catch {
        // A package.json the service cannot parse is the package manager's
        // problem to report, not a reason to abort the build here. Node itself
        // would throw on it at load time; assuming CommonJS keeps the build
        // going and leaves the real error where it belongs.
        result = 'commonjs'
      }
    } else if (dir === '.' || dir === '/' || dir === '') {
      result = 'commonjs'
    } else {
      result = resolveDir(path.posix.dirname(dir))
    }

    cache.set(dir, result)
    return result
  }

  return resolveDir(path.posix.dirname(fileRelPath))
}

/**
 * Sweep the service directory the way classic packaging does: take everything,
 * then run one ordered pattern pass in which the built-in exclusions come first
 * as negations and the user's `package.patterns` come last.
 *
 * The ordering is the contract, not an implementation detail. Classic builds
 * exactly this list in `resolveFilePathsFromPatterns()` (see
 * `lib/plugins/package/lib/package-service.js`): its excludes are turned into
 * leading `!` patterns and the user's includes are appended after them, so
 * last-match-wins lets a service opt back into anything the defaults dropped --
 * `patterns: ['serverless.yml']` really does ship the config file. Applying the
 * exclusions as a pre-filter instead would make them unconditional and quietly
 * break services that rely on re-inclusion.
 *
 * @param {object} options
 * @param {string} options.serviceDir absolute path to the service directory
 * @param {string[]} [options.patterns] ordered `package.patterns` entries
 * @param {string[]} [options.configFileNames] resolved service-config file names
 * @param {string[]} [options.layerPaths] layer source directories, service-relative
 * @param {string|null} [options.localPluginPath] `plugins.localPath`, service-relative
 * @param {string[]} [options.additionalExclusions] further globs to negate ahead
 *   of the user patterns -- classic's `defaultExcludes` and the `useDotenv`
 *   `.env*` rule, which are decided from the serverless instance and so cannot
 *   be hard-coded here
 * @param {string[]} [options.additionalIgnores] further globs that are never
 *   swept and that no pattern can re-include -- the `--package` directory,
 *   which holds the previous run's artifact and build directory the same way
 *   `.serverless` does, and is likewise decided from the serverless instance
 * @returns {Promise<string[]>} POSIX-relative file paths, in globby order
 */
export async function sweepProjectFiles({
  serviceDir,
  patterns = [],
  configFileNames = [],
  layerPaths = [],
  localPluginPath = null,
  additionalExclusions = [],
  additionalIgnores = [],
}) {
  const all = await globby(['**'], {
    cwd: serviceDir,
    dot: true,
    followSymbolicLinks: true,
    onlyFiles: true,
    // Dependencies are installed into the build directory separately, the build
    // directory itself must never sweep itself back in, and `.git` is never
    // part of a deployment artifact. globby evaluates these against the path it
    // traversed, so a `node_modules` reached through a symlinked directory is
    // matched here as well.
    ignore: [
      '**/node_modules/**',
      '.serverless/**',
      '.git/**',
      ...additionalIgnores,
    ],
  })

  const exclusionGlobs = [
    // The service configuration is consumed by the CLI, not by the function.
    // Blank names are left in deliberately: `compilePatterns` drops them, which
    // is the one place that decision belongs.
    ...configFileNames,
    // Layer sources are packaged into their own layer artifacts.
    ...layerPaths
      .filter(isUsablePathInput)
      .map((layerPath) => `${layerPath}/**`),
    // Local plugins run on the developer machine, never in Lambda.
    //
    // This deliberately diverges from classic, which excludes the bare
    // `localPath` with no `/**` suffix. Against a file list that carries no
    // directory entries, that bare path matches nothing, so classic ships the
    // plugin sources; the `/**` suffix here is the intended behavior rather
    // than a bug worth reproducing.
    ...(isUsablePathInput(localPluginPath) ? [`${localPluginPath}/**`] : []),
    '.serverless_plugins/**',
    // Type declarations carry no runtime code and cannot be transpiled into
    // any, so shipping them only inflates the artifact.
    '**/*.d.ts',
    '**/*.d.mts',
    '**/*.d.cts',
    // Yarn PnP's runtime and cache belong to the developer's resolution setup.
    '.yarn/**',
    '.pnp.cjs',
    '.pnp.loader.mjs',
    // pnpm's workspace manifest describes the developer's monorepo layout, not
    // the function; `_preparePackageJson` copies it into the build directory
    // for the install, and the artifact walk skips that copy for the same
    // reason.
    'pnpm-workspace.yaml',
    'pnpm-workspace.yml',
    // Caller-supplied, and last so a caller can never be shadowed by a rule
    // above -- they still precede `patterns`, so user patterns keep the final
    // word.
    ...additionalExclusions,
  ]
  // One batched pass over the whole sweep: `filterPaths` matches each pattern
  // against the full list once, rather than matching every file against every
  // pattern. On a 50k-file service that is the difference between ~840ms and
  // ~110ms.
  //
  // An exclusion already carrying a `!` prefix is inverted into a re-include
  // rather than negated again, exactly as classic does with its exclude list
  // (`resolveFilePathsFromPatterns`). Double negation is not a no-op here:
  // `!!keep.js` compiles to the negated micromatch pattern `!keep.js`, which
  // matches every path EXCEPT `keep.js` and would empty the whole sweep.
  return filterPaths(
    compilePatterns([
      ...exclusionGlobs.map((glob) =>
        glob.startsWith('!') ? glob.slice(1) : `!${glob}`,
      ),
      ...patterns,
    ]),
    all,
  )
}

/**
 * Partition swept files into the ones esbuild transpiles and the ones copied
 * as-is.
 *
 * Handler paths are normalized onto the swept form (POSIX separators, no `./`
 * prefix) before anything else happens, so `./src/handler.ts` and the swept
 * `src/handler.ts` are recognized as one file rather than two.
 *
 * @param {string[]} files swept, service-relative POSIX paths
 * @param {string[]} [handlerFiles] resolved handler source files
 * @returns {{ compile: string[], copy: string[] }}
 */
export function splitCompileAndCopy(files, handlerFiles = []) {
  const handlers = new Set(handlerFiles.map(toSweptPath))
  const compile = []
  const copy = []
  for (const file of files) {
    if (handlers.has(file)) continue // handlers are appended below, exactly once
    if (COMPILE_EXTENSIONS.has(path.posix.extname(file))) compile.push(file)
    else copy.push(file)
  }
  // Handlers always compile, whatever their extension and whether or not the
  // sweep (or its negations) selected them -- a bad tsconfig or pattern must
  // never be able to drop a handler.
  for (const handler of handlers) compile.push(handler)
  return { compile, copy }
}

/**
 * Narrow the compile set to the TypeScript a tsconfig actually claims.
 *
 * The sweep selects everything the artifact ships, which is the right rule for
 * assets and for JavaScript but too broad for TypeScript: a service routinely
 * carries `.ts` files that are not part of the deployed program at all --
 * test suites, CDK or Pulumi stacks, codegen scripts, a half-migrated
 * `legacy/` tree -- and compiling them is at best wasted work and at worst a
 * hard failure when one of them collides with a hand-written `.js` sibling.
 * The project already states which TypeScript belongs to it, in its tsconfig,
 * so that is what decides.
 *
 * The narrowing only ever removes. A file the sweep dropped (a
 * `package.patterns` negation, a classic exclusion) stays dropped however
 * enthusiastically the tsconfig includes it, and handlers are retained
 * unconditionally -- a tsconfig that forgets one must not be able to ship an
 * artifact with no handler in it.
 *
 * @param {object} options
 * @param {string} options.serviceDir absolute path to the service directory
 * @param {string} [options.tsconfigPath] `build.esbuild.tsconfig`, resolved
 *   relative to `serviceDir`; when absent the service's own `tsconfig.json` is
 *   used, if it has one
 * @param {string[]} options.compileFiles service-relative POSIX paths, as
 *   produced by `splitCompileAndCopy`
 * @param {string[]} [options.handlerFiles] resolved handler source files
 * @returns {{ compile: string[], warning: string|null }} the narrowed set, and
 *   a message the caller logs once when the tsconfig turned out to select no
 *   TypeScript at all
 */
export function applyTsconfigCompileFilter({
  serviceDir,
  tsconfigPath,
  compileFiles,
  handlerFiles = [],
}) {
  const explicit = Boolean(tsconfigPath)
  const anchor = explicit
    ? path.resolve(serviceDir, tsconfigPath)
    : path.join(serviceDir, 'tsconfig.json')

  // The anchor has to be a readable file at exactly that path, and it is
  // checked here rather than left to `getTsconfig` for two reasons.
  //
  // Containment: `getTsconfig` searches by walking UP from where it starts, so
  // without this it would happily answer with an ancestor's tsconfig -- a
  // monorepo root's solution-style `files: []`, most often -- which was
  // written for a different program and would drop this service's sources
  // with nothing but a warning to show for it. Auto-discovery is the service's
  // own `tsconfig.json` or nothing; anything else is named explicitly. It is
  // anchored at the service directory and never at `process.cwd()`, because
  // Compose runs every service in-process from the compose root.
  //
  // And `statSync` is what tells a file from a directory: `existsSync` is true
  // for `tsconfig.json/`, which then dies inside the JSON parser instead of
  // producing the error the user can act on.
  let anchorIsFile = false
  try {
    anchorIsFile = fs.statSync(anchor).isFile()
  } catch {
    anchorIsFile = false
  }

  if (!anchorIsFile) {
    if (explicit) {
      throw new ServerlessError(
        `The tsconfig specified at "build.esbuild.tsconfig" was not found: ${anchor}`,
        'ESBUILD_TSCONFIG_NOT_FOUND',
      )
    }
    // No tsconfig means no opinion, and the sweep governs on its own.
    return { compile: compileFiles, warning: null }
  }

  // With the anchor pinned to an existing file, `getTsconfig` finds it on its
  // first probe and the walk-up never happens; it is still the entry point
  // because it is what resolves the `extends` chain.
  let found
  try {
    found = getTsconfig(path.dirname(anchor), path.basename(anchor))
  } catch (error) {
    // An `extends` target that cannot be resolved. The overwhelmingly common
    // cause is a shared base config (`@tsconfig/node20`, an internal preset)
    // that lives in devDependencies and is simply not installed -- a CI box
    // running `npm ci --omit=dev`, a Docker build stage. A config the user
    // never asked us to read must not take the deploy down over that, so the
    // discovered case says so once and compiles everything the sweep chose.
    // A config the user DID name is theirs, and a broken one is an error.
    if (explicit) {
      throw new ServerlessError(
        `The tsconfig specified at "build.esbuild.tsconfig" could not be read: ${anchor} (${error.message})`,
        'ESBUILD_TSCONFIG_INVALID',
      )
    }
    return {
      compile: compileFiles,
      warning:
        `Your tsconfig at ${anchor} could not be resolved (${error.message}), so it is not narrowing what gets compiled: ` +
        `every TypeScript file in the package will be. Install the missing config, or point "build.esbuild.tsconfig" at a build-specific config.`,
    }
  }

  // A tsconfig that declares nothing at all narrows nothing at all -- its
  // implicit `include` is `**/*`. Worth saying out loud, because this is also
  // what an unparseable tsconfig looks like: the JSONC parser does not throw
  // on malformed input, it returns an empty object, and the build would
  // silently ignore the config the user believes is in charge.
  const declaresNothing =
    Object.keys(found.config).every((key) => key === 'compilerOptions') &&
    Object.keys(found.config.compilerOptions ?? {}).length === 0
  if (declaresNothing) {
    return {
      compile: compileFiles,
      warning:
        `Your tsconfig at ${found.path} declares no settings -- it is empty, or it could not be parsed -- so it is not narrowing ` +
        `what gets compiled: every TypeScript file in the package will be. Check the file, or point "build.esbuild.tsconfig" at a build-specific config.`,
    }
  }

  // The case sensitivity is stated rather than detected: left to itself
  // `createFilesMatcher` probes the filesystem by writing a temp file into the
  // current working directory, which is not ours to write to. Matching
  // case-sensitively is also what Lambda does, so a selection that works
  // locally on a case-insensitive macOS volume is the one that works deployed.
  const matcher = createFilesMatcher(found, true)
  const handlers = new Set(handlerFiles.map(toSweptPath))

  let candidates = 0
  let matched = 0
  const compile = compileFiles.filter((file) => {
    if (!TS_FAMILY_EXTENSIONS.has(path.posix.extname(file))) return true
    candidates += 1
    // `createFilesMatcher` requires an absolute path and compares it against
    // patterns already resolved against the tsconfig's own directory, which is
    // what makes an `extends` chain resolve the way `tsc` resolves it.
    //
    // Handlers are matched but never dropped. Exempting them from the match
    // as well would make a service whose only in-scope TypeScript IS its
    // handler look like a tsconfig that selects nothing.
    if (matcher(path.resolve(serviceDir, file))) {
      matched += 1
      return true
    }
    return handlers.has(file)
  })

  // A tsconfig that claims none of the project's TypeScript is nearly always a
  // solution-style root (`files: []` plus `references`) that was never meant
  // to describe a program. The build still succeeds -- handlers compile
  // regardless -- so silence here would ship an artifact missing every helper
  // the handler imports. Say so once, and name the way out.
  //
  // A project with no TypeScript to select in the first place is not that
  // case, and gets no warning.
  const warning =
    candidates > 0 && matched === 0
      ? `Your tsconfig at ${found.path} selects no source files; only handler files will be compiled. ` +
        `Point "build.esbuild.tsconfig" at a build-specific config to control compilation.`
      : null

  return { compile, warning }
}

/**
 * Every relative specifier an ES module hands to the runtime: the static
 * `import`/`export ... from` forms, the bare side-effect `import './x'`, and
 * dynamic `import()`.
 *
 * `from` and `import` are the only tokens that can introduce one, and the
 * quoted string has to follow immediately -- which is what keeps `const from =
 * './util'` and `xs.from('./util')` out. The dynamic form is listed ahead of
 * the bare one so `import('./x')` is consumed by it rather than failing on the
 * parenthesis.
 */
const RELATIVE_SPECIFIER_RE =
  /(?:\bfrom|\bimport\s*\(|\bimport)\s*['"](\.\.?\/[^'"]+)['"]/g

/**
 * Only the dynamic form. This is what CommonJS output is scanned with: esbuild
 * rewrites every static `import` into `require()` on the way out, but it
 * leaves `import()` exactly as written -- and Node routes `import()` through
 * the ES module resolver even from inside a CommonJS file, so the dynamic form
 * is unsafe in every output format while the static forms are only unsafe
 * where they survive as imports.
 *
 * Both patterns anchor the specifier to a quote, so a template literal
 * (`import(\`./p/${n}\`)`, which esbuild also preserves verbatim) matches
 * neither and is silently left alone -- correctly, since its value is not
 * knowable from the text.
 */
const DYNAMIC_RELATIVE_SPECIFIER_RE = /\bimport\s*\(\s*['"](\.\.?\/[^'"]+)['"]/g

/**
 * Sort a file's relative specifiers into the two ways a non-bundled build
 * makes them unresolvable. One pass, because the caller runs this over every
 * emitted file and both answers come from the same matches.
 *
 * @param {string} fileContent
 * @param {boolean} dynamicOnly restrict to `import()`, for CommonJS output
 * @returns {{ extensionless: string[], sourceExtension: string[] }}
 */
function classifyRelativeSpecifiers(fileContent, dynamicOnly) {
  const extensionless = new Set()
  const sourceExtension = new Set()
  const pattern = dynamicOnly
    ? DYNAMIC_RELATIVE_SPECIFIER_RE
    : RELATIVE_SPECIFIER_RE

  for (const match of fileContent.matchAll(pattern)) {
    const specifier = match[1]
    if (!specifier.split('/').pop().includes('.')) {
      extensionless.add(specifier)
    } else if (COMPILE_EXTENSIONS.has(path.posix.extname(specifier))) {
      sourceExtension.add(specifier)
    }
  }

  return {
    extensionless: [...extensionless],
    sourceExtension: [...sourceExtension],
  }
}

/**
 * Relative specifiers in emitted output that Node will not resolve.
 *
 * With bundling off the emitted file keeps whatever specifiers the source
 * wrote, and there are two distinct ways that goes wrong:
 *
 * - **`extensionless`** -- Node's ES module resolver, unlike CommonJS's, adds
 *   no extensions and probes no `index.js`: `./util` means a file named
 *   exactly `util`. This is the single most common way a service that ran fine
 *   bundled fails once it is not.
 * - **`sourceExtension`** -- `./util.ts` names a file the build does not emit:
 *   `util.ts` is compiled to `util.js`, so the specifier points at something
 *   that is not in the artifact under that name. It looks extensioned, so the
 *   dot heuristic below would otherwise wave it through, and it is guaranteed
 *   broken rather than merely suspicious.
 *
 * Either way the failure is invisible until the function is invoked, so the
 * build says it out loud.
 *
 * A specifier counts as extensionless when its LAST path segment carries no
 * dot. That is a heuristic, and deliberately a cheap one:
 *
 * - It is a regex over text, not a parse, so a specifier inside a string
 *   literal (or a comment, in the rare output that keeps one) is reported as
 *   though it were live code.
 * - A directory whose own name has a dot (`./lib.v2`) reads as extensioned and
 *   is missed. Telling that from a file named `config.local` needs the
 *   filesystem, which this never touches.
 *
 * Both are survivable in the sense that matters: the output is advice printed
 * once, never a build failure, so a wrong line costs a reader ten seconds.
 * These functions are pure and take text rather than a path precisely so the
 * caller controls how much gets read into memory.
 *
 * @param {string} fileContent the emitted file's contents
 * @param {object} [options]
 * @param {boolean} [options.dynamicOnly] scan only `import()`, which is what
 *   CommonJS output warrants -- see `DYNAMIC_RELATIVE_SPECIFIER_RE`
 * @returns {{ extensionless: string[], sourceExtension: string[] }} distinct
 *   specifiers, in order of first appearance
 */
export function scanUnresolvableRelativeImports(
  fileContent,
  { dynamicOnly = false } = {},
) {
  return classifyRelativeSpecifiers(fileContent, dynamicOnly)
}

/**
 * The extensionless half of `scanUnresolvableRelativeImports`, on its own.
 *
 * Kept as its own export because it is the narrow question -- "which
 * specifiers has Node no way to resolve" -- that the diagnostic was specified
 * against, and it is the shape every rule of the heuristic is pinned by. The
 * build itself calls the combined function so each emitted file is scanned
 * once.
 *
 * @param {string} fileContent
 * @param {object} [options]
 * @param {boolean} [options.dynamicOnly]
 * @returns {string[]}
 */
export function scanExtensionlessEsmImports(fileContent, options) {
  return scanUnresolvableRelativeImports(fileContent, options).extensionless
}

/**
 * Find output paths claimed by more than one source file. Two sources writing
 * the same output means one silently overwrites the other in the build
 * directory, so the caller can report it instead of shipping whichever won.
 *
 * A file that is both compiled and copied from the *same* source path (a
 * handler that the sweep also selected) is not a collision: it is one file
 * written once. Sources are therefore deduplicated per output before counting.
 *
 * @param {string[]} compileFiles
 * @param {string[]} copyFiles
 * @returns {Array<{ output: string, sources: string[] }>}
 */
export function detectOutputCollisions(compileFiles, copyFiles) {
  const sourcesByOutput = new Map()
  const record = (rawSource) => {
    // Normalized here too: this function is also reachable directly, and an
    // un-normalized source would compare unequal to its swept twin and hide
    // the very clash it exists to find.
    const source = toSweptPath(rawSource)
    const output = outputPathFor(source)
    if (!sourcesByOutput.has(output)) sourcesByOutput.set(output, new Set())
    sourcesByOutput.get(output).add(source)
  }
  compileFiles.forEach(record)
  copyFiles.forEach(record)
  return [...sourcesByOutput.entries()]
    .filter(([, sources]) => sources.size > 1)
    .map(([output, sources]) => ({ output, sources: [...sources] }))
}
