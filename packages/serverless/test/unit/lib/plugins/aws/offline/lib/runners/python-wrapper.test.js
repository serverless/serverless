import { spawn } from 'node:child_process'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// REPO_ROOT = packages/serverless/ (8 levels up from this test file)
const REPO_ROOT = path.resolve(__dirname, '../../../../../../../../')
const WRAPPER = path.join(
  REPO_ROOT,
  'lib/plugins/aws/offline/lib/runners/wrappers/python/invoke.py',
)
const FIXTURES_DIR = path.resolve(
  __dirname,
  '../../__fixtures__/handlers/python',
)

function invokeWrapper({ handlerFile, handlerName, event, context }) {
  return new Promise((resolve, reject) => {
    // The wrapper appends '.' to sys.path and import_module()s the handler_path
    // arg (with os.sep -> '.'). Running with cwd = directory-containing-the-
    // handler lets us pass just the bare module name (no package layout needed).
    const cwd = path.dirname(handlerFile)
    const moduleArg = path.basename(handlerFile).replace(/\.py$/, '')
    const child = spawn('python3', ['-u', WRAPPER, moduleArg, handlerName], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const stdoutLines = []
    const stderrChunks = []
    let envelope = null

    const rl = readline.createInterface({ input: child.stdout })

    rl.on('line', (line) => {
      if (envelope !== null) return
      let parsed
      try {
        parsed = JSON.parse(line)
      } catch {
        stdoutLines.push(line)
        return
      }
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        Object.prototype.hasOwnProperty.call(parsed, '__offline_payload__')
      ) {
        envelope = parsed
        child.kill()
        return
      }
      stdoutLines.push(line)
    })

    child.stderr.on('data', (chunk) => {
      stderrChunks.push(chunk)
    })

    child.on('error', (err) => {
      reject(err)
    })

    child.on('close', () => {
      rl.close()
      const stderr = Buffer.concat(
        stderrChunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c))),
      ).toString('utf8')
      if (envelope === null) {
        reject(
          new Error(
            `Python wrapper exited without emitting an __offline_payload__ envelope.\n` +
              `stdout lines:\n${stdoutLines.join('\n')}\n` +
              `stderr:\n${stderr}`,
          ),
        )
        return
      }
      resolve({ envelope, lines: stdoutLines, stderr })
    })

    child.stdin.write(`${JSON.stringify({ event, context })}\n`)
  })
}

describe('python wrapper protocol', () => {
  it('returns the handler result inside the __offline_payload__ envelope', async () => {
    const { envelope } = await invokeWrapper({
      handlerFile: path.join(FIXTURES_DIR, 'sync_echo.py'),
      handlerName: 'handler',
      event: { hello: 'world' },
      context: { name: 'echoFn' },
    })

    expect(envelope).toEqual({
      __offline_payload__: {
        ok: true,
        echo: { hello: 'world' },
        fn: 'echoFn',
      },
    })
  })

  it('emits print() output as separate stdout lines, not as envelopes', async () => {
    const { envelope, lines } = await invokeWrapper({
      handlerFile: path.join(FIXTURES_DIR, 'with_print.py'),
      handlerName: 'handler',
      event: { x: 1 },
      context: { name: 'printFn' },
    })

    expect(envelope.__offline_payload__).toEqual({ got: { x: 1 } })
    expect(lines).toEqual(expect.arrayContaining(['log line A', 'log line B']))
  })
})
