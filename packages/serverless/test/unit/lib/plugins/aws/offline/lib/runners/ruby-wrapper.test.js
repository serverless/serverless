import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const REPO_ROOT = path.resolve(__dirname, '../../../../../../../../')

const WRAPPER = path.resolve(
  REPO_ROOT,
  'lib/plugins/aws/offline/lib/runners/wrappers/ruby/invoke.rb',
)

const FIXTURES = path.resolve(__dirname, '../../__fixtures__/handlers/ruby')

/**
 * Spawn ruby with the wrapper, write one event line, return the FIRST
 * `__offline_payload__` envelope parsed from stdout.
 */
function runOnce({ handlerFile, handlerName, event, context = {} }) {
  return new Promise((resolve, reject) => {
    const handlerDir = path.dirname(handlerFile)
    const handlerModule = path.basename(handlerFile).replace(/\.rb$/, '')

    const child = spawn('ruby', [WRAPPER, handlerModule, handlerName], {
      cwd: handlerDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const stdoutLines = []
    const stderrChunks = []
    const rl = createInterface({ input: child.stdout })
    let envelope

    rl.on('line', (line) => {
      stdoutLines.push(line)
      try {
        const parsed = JSON.parse(line)
        if (
          parsed &&
          typeof parsed === 'object' &&
          Object.hasOwn(parsed, '__offline_payload__')
        ) {
          envelope = parsed
          child.kill()
        }
      } catch {
        // not JSON — it's puts()/log output
      }
    })

    child.stderr.on('data', (d) => stderrChunks.push(d))

    child.on('close', () => {
      if (!envelope) {
        reject(
          new Error(
            `No envelope received.\nstdout:\n${stdoutLines.join(
              '\n',
            )}\nstderr:\n${Buffer.concat(stderrChunks).toString()}`,
          ),
        )
        return
      }
      resolve({
        envelope,
        lines: stdoutLines,
        stderr: Buffer.concat(stderrChunks).toString(),
      })
    })

    child.stdin.write(JSON.stringify({ event, context }))
    child.stdin.write('\n')
  })
}

describe('ruby wrapper protocol', () => {
  it('returns the handler result inside the __offline_payload__ envelope', async () => {
    const { envelope } = await runOnce({
      handlerFile: path.join(FIXTURES, 'sync_echo.rb'),
      handlerName: 'handler',
      event: { hello: 'world' },
      context: { functionName: 'echoFn', timeout: 6 },
    })
    expect(envelope).toEqual({
      __offline_payload__: { ok: true, echo: { hello: 'world' }, fn: 'echoFn' },
    })
  })

  it('emits puts() output as separate stdout lines, not as envelopes', async () => {
    const { envelope, lines } = await runOnce({
      handlerFile: path.join(FIXTURES, 'with_puts.rb'),
      handlerName: 'handler',
      event: { x: 1 },
      context: { functionName: 'putsFn', timeout: 6 },
    })
    expect(envelope.__offline_payload__).toEqual({ got: { x: 1 } })
    expect(lines).toEqual(expect.arrayContaining(['log line A', 'log line B']))
  })
})
