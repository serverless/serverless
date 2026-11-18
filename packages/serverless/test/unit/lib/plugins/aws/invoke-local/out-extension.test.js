/**
 * `invoke local` resolves the handler module by importing the extensionless
 * handler path and falling back to `<path>.js` when the module is not found.
 * When esbuild's `outExtension` emits `.mjs`/`.cjs` bundles (or a service
 * simply uses those extensions directly), that fallback must probe them too —
 * the Lambda Node.js runtime resolves all three extensions, so local
 * invocation has to match.
 *
 * These tests spawn a real `node` child process instead of calling
 * `invokeLocalNodeJs` in-process: jest's module resolver resolves
 * extensionless dynamic imports (node-style), which Node's own ESM loader
 * does NOT — an in-process test goes green even when the real CLI fails.
 */

import { jest } from '@jest/globals'
import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const pluginPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../../lib/plugins/aws/invoke-local/index.js',
)
// A `file://` URL, not a bare path: Node's ESM loader rejects a raw
// drive-letter path (e.g. C:\...) as an import specifier on Windows.
const pluginUrl = pathToFileURL(pluginPath).href

// Driver executed by the child process. It receives the plugin URL and the
// service dir + handler path as argv, builds the minimal plugin context
// invokeLocalNodeJs touches, and invokes the handler. The dynamic import runs
// inside the try so any startup failure prints a diagnostic instead of exiting
// with empty stdout.
const driverSource = `
const [pluginUrl, serviceDir, handlerPath] = process.argv.slice(2)

const context = {
  serverless: { serviceDir, service: { provider: {} } },
  options: {
    extraServicePath: '',
    functionObj: { name: 'hello', timeout: 6 },
  },
  provider: { naming: { getLogGroupName: () => '/aws/lambda/hello' } },
  logger: { blankLine: () => {} },
}

try {
  const { default: AwsInvokeLocal } = await import(pluginUrl)
  await AwsInvokeLocal.prototype.invokeLocalNodeJs.call(
    context,
    handlerPath,
    'hello',
    {},
  )
  console.log(process.exitCode ? 'HANDLER_ERROR' : 'INVOKED')
} catch (error) {
  console.log('LOAD_FAILED ' + error.code)
  process.exitCode = 1
}
`

const createdServiceDirs = []

function makeServiceDir(files) {
  const serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-invoke-'))
  createdServiceDirs.push(serviceDir)
  fs.writeFileSync(path.join(serviceDir, 'driver.mjs'), driverSource)
  for (const [name, contents] of Object.entries(files)) {
    fs.writeFileSync(path.join(serviceDir, name), contents)
  }
  return serviceDir
}

async function invoke(serviceDir, handlerPath) {
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [path.join(serviceDir, 'driver.mjs'), pluginUrl, serviceDir, handlerPath],
      { env: { ...process.env, NODE_NO_WARNINGS: '1' } },
    )
    return stdout.trim()
  } catch (error) {
    return (error.stdout ?? '').trim()
  }
}

describe('invoke local handler extension probing', () => {
  jest.setTimeout(60_000)

  afterEach(() => {
    while (createdServiceDirs.length > 0) {
      fs.rmSync(createdServiceDirs.pop(), { recursive: true, force: true })
    }
  })

  test('resolves an .mjs handler from an extensionless handler path', async () => {
    const serviceDir = makeServiceDir({
      'handler.mjs': 'export const hello = async () => ({ statusCode: 200 })\n',
    })

    await expect(invoke(serviceDir, 'handler')).resolves.toContain('INVOKED')
  })

  test('resolves a .cjs handler from an extensionless handler path', async () => {
    const serviceDir = makeServiceDir({
      'handler.cjs':
        'module.exports.hello = async () => ({ statusCode: 200 })\n',
    })

    await expect(invoke(serviceDir, 'handler')).resolves.toContain('INVOKED')
  })

  test('still resolves a .js handler from an extensionless handler path', async () => {
    const serviceDir = makeServiceDir({
      'handler.js': 'export const hello = async () => ({ statusCode: 200 })\n',
      'package.json': '{ "type": "module" }\n',
    })

    await expect(invoke(serviceDir, 'handler')).resolves.toContain('INVOKED')
  })

  test('a missing handler still fails with the initialization error', async () => {
    const serviceDir = makeServiceDir({})

    await expect(invoke(serviceDir, 'handler')).resolves.toContain(
      'LOAD_FAILED INVOKE_LOCAL_LAMBDA_INITIALIZATION_FAILED',
    )
  })
})

describe('invoke local handler completion', () => {
  jest.setTimeout(60_000)

  afterEach(() => {
    while (createdServiceDirs.length > 0) {
      fs.rmSync(createdServiceDirs.pop(), { recursive: true, force: true })
    }
  })

  test('finishes a handler that never calls back once the event loop is empty', async () => {
    const serviceDir = makeServiceDir({
      'handler.cjs':
        "module.exports.hello = () => { setTimeout(() => console.log('RAN'), 50) }\n",
    })

    // Lambda responds with null, so nothing besides the handler's own log
    await expect(invoke(serviceDir, 'handler')).resolves.toBe('RAN\nINVOKED')
  })

  test('prints the result of a handler that calls back later exactly once', async () => {
    const serviceDir = makeServiceDir({
      'handler.cjs':
        "module.exports.hello = (event, context, callback) => { setTimeout(() => callback(null, 'CALLED_BACK'), 50) }\n",
    })

    const output = await invoke(serviceDir, 'handler')
    expect(output.match(/CALLED_BACK/g)).toHaveLength(1)
    expect(output).toContain('INVOKED')
  })

  test('finishes a non-async handler whose promise never settles, as Lambda does', async () => {
    const serviceDir = makeServiceDir({
      'handler.cjs':
        "module.exports.hello = () => new Promise(() => { setTimeout(() => console.log('RAN'), 50) })\n",
    })

    await expect(invoke(serviceDir, 'handler')).resolves.toBe('RAN\nINVOKED')
  })

  test('fails an async handler whose promise never settles, as Lambda does', async () => {
    const serviceDir = makeServiceDir({
      'handler.cjs':
        'module.exports.hello = async () => { await new Promise(() => {}) }\n',
    })

    const output = await invoke(serviceDir, 'handler')
    expect(output).toContain('"errorType": "NodeJsExit"')
    expect(output).toContain('a Promise that was never settled')
    expect(output).toContain('HANDLER_ERROR')
  })
})
