/**
 * Does the non-bundled build dir actually run?
 *
 * Every other test in this directory reads the build dir: which files exist,
 * what syntax they contain, which package.json sits beside them. None of that
 * is the contract. The contract is that Node -- the Node inside Lambda, with
 * nothing but the artifact and its own resolver -- loads the handler and calls
 * it. A build dir can satisfy every structural assertion and still fail there,
 * because the resolver is the arbiter of `.js` vs `.mjs`, of `"type": "module"`
 * in the *nearest* package.json, and of whether `./util` names anything at all.
 *
 * So these tests spawn a real `node` with `cwd` set to the build dir and a
 * runner file that requires or imports the built handler and prints its result.
 *
 * They may not do it in process. An `import()` evaluated inside jest goes
 * through jest's module registry, not Node's ESM resolver, and that registry
 * applies CommonJS-style extension probing: an emitted `import { x } from
 * './util'` resolves happily under jest and fails with ERR_MODULE_NOT_FOUND on
 * the deployed function. That divergence is measured, not assumed -- the same
 * build dir that makes the negative control below exit non-zero was loaded
 * in-process under this suite's own jest config and returned `{ statusCode:
 * 200 }`. An in-process check here would therefore certify exactly the bug it
 * exists to catch, which is why every assertion in this file goes through
 * `spawnSync`.
 *
 * The runner is written into the build dir *after* `_build` has finished, so it
 * never reaches the sweep and cannot influence what was compiled, and it is
 * unlinked as soon as the child has been waited on -- including when the child
 * times out or the assertions throw. The build directory IS the artifact
 * definition (`_collectBuildDirEntries`), so leaving a runner behind would put
 * it in the zip of any packaging run over the same tree; deleting it means
 * these tests hand back a build dir byte-identical to the one `_build` wrote.
 * The `__runner__.(c|m)js` name is the belt to that braces: unmistakably not a
 * user file, and outside every fixture's own naming.
 */

import { jest } from '@jest/globals'
import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { log } from '@serverless/util'

const Esbuild = (await import('../../../../../lib/plugins/esbuild/index.js'))
  .default

const esbuildLogger = log.get('esbuild')

const createdServiceDirs = []

afterAll(() => {
  for (const dir of createdServiceDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

/**
 * `realpathSync` because macOS resolves the temp dir through a symlink, and
 * esbuild reports real paths -- an unresolved prefix makes `outbase` fail to
 * match the entry points and collapses the whole layout into the build root.
 */
function makeServiceDir(files) {
  const serviceDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'sls-esbuild-runtime-')),
  )
  createdServiceDirs.push(serviceDir)
  for (const [name, contents] of Object.entries(files)) {
    const filePath = path.join(serviceDir, name)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, contents)
  }
  return serviceDir
}

function makePlugin(serviceDir, functions) {
  const serverless = {
    serviceDir,
    config: { serviceDir },
    service: {
      service: 'my-service',
      provider: { runtime: 'nodejs20.x' },
      package: {},
      build: { esbuild: { bundle: false } },
      functions,
      getFunction: (alias) => functions[alias],
      getAllFunctions: () => Object.keys(functions),
      getAllLayers: () => [],
      getLayer: () => undefined,
    },
    pluginManager: {
      spawn: async () => {},
      parsePluginsObject: () => ({ localPath: null }),
    },
  }
  const plugin = new Esbuild(serverless, {})
  // Target `_build` directly: what is under test is the build dir it leaves
  // behind, not the introspection in `functions()`.
  plugin.functions = async () => functions
  return plugin
}

const functions = { hello: { handler: 'src/handler.hello' } }

const buildDirOf = (serviceDir) => path.join(serviceDir, '.serverless', 'build')

/** Build a fixture service and hand back its build directory. */
async function build(files) {
  const serviceDir = makeServiceDir(files)
  await makePlugin(serviceDir, functions)._build()
  return buildDirOf(serviceDir)
}

/**
 * Run `source` as a Node program whose working directory is the build dir.
 *
 * The child gets a scrubbed `NODE_OPTIONS`, and this is load-bearing rather
 * than tidiness. A spawn inherits the jest worker's environment, and this
 * suite's whole claim is that the child uses *Node's* resolver on *this*
 * artifact:
 *
 *   - `NODE_OPTIONS` can carry `--experimental-loader` / `--import`. A resolve
 *     hook in the ambient environment can make the negative control's
 *     extensionless specifier resolve, so the artifact loads cleanly and the
 *     test passes while asserting the opposite of the truth -- the identical
 *     failure mode as running in process under jest, arriving by a different
 *     door. It also carries this repo's own `--experimental-vm-modules`, which
 *     the child has no use for.
 *   - `NODE_NO_WARNINGS` is pinned on because the success cases assert an empty
 *     stderr. Left to the ambient environment, an unrelated node warning turns
 *     a correct artifact red, and an option that *emits* warnings turns most of
 *     the file red at once.
 *
 * The timeout is a bounded wait well inside the suite budget: a child that
 * never exits would otherwise hang the jest worker until the whole run is
 * killed, with nothing to show for it. `SIGKILL` because a wedged loader will
 * not honor anything gentler. Whatever the child said is carried back verbatim
 * -- the assertions below put it in the failure message, since the child's own
 * output is the only thing that explains a runtime load failure.
 *
 * The runner is removed as soon as the child has been waited on, so the build
 * dir is left exactly as `_build` wrote it.
 */
function runNode(buildDir, runnerName, source) {
  const runnerPath = path.join(buildDir, runnerName)
  fs.writeFileSync(runnerPath, source)
  let result
  try {
    result = spawnSync(process.execPath, [runnerName], {
      cwd: buildDir,
      encoding: 'utf8',
      timeout: 45_000,
      killSignal: 'SIGKILL',
      env: { ...process.env, NODE_OPTIONS: '', NODE_NO_WARNINGS: '1' },
    })
  } finally {
    fs.rmSync(runnerPath, { force: true })
  }
  return {
    // `error` is the only account of a spawn that produced no status at all
    // (timeout, SIGKILL, a missing binary), so it is folded into the reported
    // stderr rather than dropped.
    status: result.status,
    signal: result.signal,
    stdout: (result.stdout ?? '').trim(),
    stderr: (
      (result.stderr ?? '') + (result.error ? `\n${result.error.message}` : '')
    ).trim(),
  }
}

/**
 * A clean load: exit 0, no diagnostics. Asserting the outcome and stderr
 * together is what puts the child's stack trace in the jest diff -- a bare
 * `expect(status).toBe(0)` would report `1 !== 0` and throw away the only
 * information that identifies which module failed to resolve.
 */
const outcomeOf = ({ status, signal, stderr }) => ({ status, signal, stderr })
const CLEAN_EXIT = { status: 0, signal: null, stderr: '' }

const CJS_RUNNER = '__runner__.cjs'
const ESM_RUNNER = '__runner__.mjs'

/** Require the built handler from CommonJS and print what it returns. */
const requireRunner = (target) =>
  `const { hello } = require(${JSON.stringify(target)})\n` +
  `hello().then((r) => console.log(JSON.stringify(r)))\n`

/** Import the built handler as ESM and print what it returns. */
const importRunner = (target) =>
  `const { hello } = await import(${JSON.stringify(target)})\n` +
  `console.log(JSON.stringify(await hello()))\n`

describe('non-bundled build output loads in a real node process', () => {
  jest.setTimeout(120_000)

  it('loads a CommonJS service whose TS handler reaches a TS helper and a JS helper', async () => {
    // The shape reported in #12744: a plain CommonJS service where the handler
    // is TypeScript and pulls in both a compiled sibling and a hand-written
    // one. Bundling made all three a single file; not bundling means the two
    // helpers have to be in the artifact, at those paths, in a module format
    // the CommonJS loader accepts.
    const buildDir = await build({
      'package.json': '{"name":"svc"}',
      'src/handler.ts':
        "import { helper } from './util'\n" +
        "import { legacy } from './legacy.js'\n" +
        'export const hello = async () => ({\n' +
        '  statusCode: 200,\n' +
        '  body: `${helper()}+${legacy()}`,\n' +
        '})\n',
      'src/util.ts': "export const helper = () => 'helped'\n",
      'src/legacy.js': 'exports.legacy = () => "legacy"\n',
    })

    const result = runNode(
      buildDir,
      CJS_RUNNER,
      requireRunner('./src/handler.js'),
    )

    expect(outcomeOf(result)).toEqual(CLEAN_EXIT)
    expect(JSON.parse(result.stdout)).toEqual({
      statusCode: 200,
      body: 'helped+legacy',
    })
  })

  it('loads a "type": "module" service whose sources name the emitted files', async () => {
    // Extensioned specifiers written in the TypeScript source -- `./util.js`,
    // naming the file esbuild will emit, which is what `"module": "nodenext"`
    // requires. Nothing rewrites them, so this is the only spelling Node's ESM
    // resolver accepts; the negative control below is the same fixture without
    // the extension.
    const buildDir = await build({
      'package.json': '{"name":"svc","type":"module"}',
      'src/handler.ts':
        "import { helper } from './util.js'\n" +
        'export const hello = async () => ({ statusCode: 200, body: helper() })\n',
      'src/util.ts': "export const helper = () => 'helped'\n",
    })

    const result = runNode(
      buildDir,
      ESM_RUNNER,
      importRunner('./src/handler.js'),
    )

    expect(outcomeOf(result)).toEqual(CLEAN_EXIT)
    expect(JSON.parse(result.stdout)).toEqual({
      statusCode: 200,
      body: 'helped',
    })
  })

  it('loads a handler under a nested "type": "module" that the service root never mentions', async () => {
    // The root says CommonJS and `src/` says module, so the emitted format is
    // decided by a file two levels away from the service manifest. Reading the
    // root instead would emit `module.exports` into a directory Node parses as
    // ESM, and the failure would be a ReferenceError at load time in Lambda.
    // Shipping `src/package.json` is half of it; the other half is that the
    // hand-written ESM `util.js` beside it is copied, not re-emitted.
    const buildDir = await build({
      'package.json': '{"name":"svc"}',
      'src/package.json': '{"type":"module"}',
      'src/handler.ts':
        "import { helper } from './util.js'\n" +
        'export const hello = async () => ({ statusCode: 200, body: helper() })\n',
      'src/util.js': "export const helper = () => 'nested'\n",
    })

    const result = runNode(
      buildDir,
      ESM_RUNNER,
      importRunner('./src/handler.js'),
    )

    expect(outcomeOf(result)).toEqual(CLEAN_EXIT)
    expect(JSON.parse(result.stdout)).toEqual({
      statusCode: 200,
      body: 'nested',
    })
  })

  it('loads an .mts handler from the .mjs it is emitted as, inside a CommonJS service', async () => {
    // `.mts` is ESM by definition and keeps that identity through the extension
    // mapping, so this handler is ESM in a service whose root package.json says
    // nothing of the sort -- and Node agrees only because the emitted name ends
    // in `.mjs`. Emitting `src/handler.js` here would be loaded as CommonJS and
    // reject the `import` on its first line.
    const buildDir = await build({
      'package.json': '{"name":"svc"}',
      'src/handler.mts':
        "import { helper } from './util.mjs'\n" +
        'export const hello = async () => ({ statusCode: 200, body: helper() })\n',
      'src/util.mts': "export const helper = () => 'from-mts'\n",
    })

    const result = runNode(
      buildDir,
      ESM_RUNNER,
      importRunner('./src/handler.mjs'),
    )

    expect(outcomeOf(result)).toEqual(CLEAN_EXIT)
    expect(JSON.parse(result.stdout)).toEqual({
      statusCode: 200,
      body: 'from-mts',
    })
  })

  it('loads a .cjs handler and its .cjs helper inside a "type": "module" service', async () => {
    // The mirror image: CommonJS files that have to stay CommonJS under a root
    // that declares the opposite. `require` between them is only legal because
    // both names end in `.cjs` after the build.
    const buildDir = await build({
      'package.json': '{"name":"svc","type":"module"}',
      'src/handler.cjs':
        "const { helper } = require('./util.cjs')\n" +
        'module.exports.hello = async () => ({ statusCode: 200, body: helper() })\n',
      'src/util.cjs': "module.exports.helper = () => 'from-cjs'\n",
    })

    const result = runNode(
      buildDir,
      CJS_RUNNER,
      requireRunner('./src/handler.cjs'),
    )

    expect(outcomeOf(result)).toEqual(CLEAN_EXIT)
    expect(JSON.parse(result.stdout)).toEqual({
      statusCode: 200,
      body: 'from-cjs',
    })
  })
})

/**
 * The honesty test for the extensionless-import warning.
 *
 * The build does not fail on an extensionless ESM specifier -- it warns and
 * ships. That is only defensible if the warning describes something real, and
 * "real" here means the artifact is genuinely unloadable. This runs the exact
 * build the warning was emitted for and requires Node to refuse it. If the
 * warning ever fires on output that loads, it is noise and should be deleted;
 * if it stops firing on output that does not load, the diagnostic is gone. The
 * two assertions are deliberately in one test so neither can drift alone.
 */
describe('the extensionless-import warning names a real runtime failure', () => {
  jest.setTimeout(120_000)

  it('warns at build time and then fails to load with ERR_MODULE_NOT_FOUND', async () => {
    const warnSpy = jest
      .spyOn(esbuildLogger, 'warning')
      .mockImplementation(() => {})
    let buildDir
    try {
      // Identical to the passing ESM case above, except the specifier omits the
      // extension -- the one difference that decides whether this artifact
      // works.
      buildDir = await build({
        'package.json': '{"name":"svc","type":"module"}',
        'src/handler.ts':
          "import { helper } from './util'\n" +
          'export const hello = async () => ({ statusCode: 200, body: helper() })\n',
        'src/util.ts': "export const helper = () => 'helped'\n",
      })

      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy.mock.calls[0][0]).toContain('src/handler.js → ./util')
    } finally {
      warnSpy.mockRestore()
    }

    // The build succeeded: the file the warning is about is on disk, and every
    // file it needs is there too. Only the specifier is wrong.
    expect(fs.existsSync(path.join(buildDir, 'src/handler.js'))).toBe(true)
    expect(fs.existsSync(path.join(buildDir, 'src/util.js'))).toBe(true)

    const result = runNode(
      buildDir,
      ESM_RUNNER,
      importRunner('./src/handler.js'),
    )

    // Loud, not silent, and never reaching the handler body.
    expect(result.status).not.toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('ERR_MODULE_NOT_FOUND')
    // Named precisely: the file the warned-about specifier resolves to and
    // fails on -- `src/util`, extensionless, which is the whole complaint.
    // Node renders it as an absolute path, hence the separator-agnostic tail
    // match rather than a bare substring that `src/util.js` would satisfy too.
    expect(result.stderr).toMatch(/Cannot find module '.*[/\\]src[/\\]util'/)
  })
})
