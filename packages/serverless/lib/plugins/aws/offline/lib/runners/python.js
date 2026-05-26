import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const WRAPPER = path.resolve(__dirname, 'wrappers/python/invoke.py')
const ENVELOPE_KEY = '__offline_payload__'

/**
 * Python child-process Lambda runner. Spawns a fresh `python3` process
 * per invocation (M5b T4 — pooling lands in T6). The wrapper
 * (lib/runners/wrappers/python/invoke.py) reads one JSON event per
 * line from stdin and writes one JSON envelope per result line to
 * stdout. Non-envelope stdout lines are handler print()/log output
 * (T5 will forward those to the offline logger; T4 drops them silently).
 *
 * Public shape mirrors createWorkerThreadRunner / createInProcessRunner
 * so the Lambda facade picks between runners without further changes.
 *
 * @returns {{
 *   invoke(args: object): Promise<unknown>,
 *   invalidate(functionKey: string): void,
 *   terminate(): Promise<void>,
 * }}
 */
export function createPythonRunner() {
  return {
    /**
     * @param {object} args
     * @param {string} args.functionKey
     * @param {string} args.handlerPath  Absolute path to the .py file.
     * @param {string} args.handlerName
     * @param {unknown} args.event
     * @param {object} args.context
     * @returns {Promise<unknown>}
     */
    async invoke({ handlerPath, handlerName, event, context }) {
      // Wrapper takes a module path WITHOUT the .py extension and does
      // `import_module(arg.replace(os.sep, '.'))` after appending '.' to
      // sys.path. Passing an absolute path verbatim produces a leading-dot
      // name (".Users.foo.bar") that Python treats as a relative import.
      // Spawn the child with cwd = the handler's directory and pass the
      // bare module basename so the wrapper's `sys.path.append('.')` finds it.
      const handlerDir = path.dirname(handlerPath)
      const handlerModule = path.basename(handlerPath).replace(/\.py$/, '')

      const child = spawn(
        'python3',
        ['-u', WRAPPER, handlerModule, handlerName],
        { cwd: handlerDir, stdio: ['pipe', 'pipe', 'pipe'] },
      )

      return new Promise((resolve, reject) => {
        const rl = createInterface({ input: child.stdout })
        const stderrChunks = []
        let settled = false

        const cleanup = () => {
          rl.close()
          try {
            child.kill()
          } catch {
            // ignore — child may already be gone
          }
        }

        rl.on('line', (line) => {
          if (settled) return
          let parsed
          try {
            parsed = JSON.parse(line)
          } catch {
            // print()/log — not an envelope. Forwarding to logger
            // is T5's job; for now drop silently.
            return
          }
          if (
            parsed &&
            typeof parsed === 'object' &&
            Object.hasOwn(parsed, ENVELOPE_KEY)
          ) {
            settled = true
            cleanup()
            resolve(parsed[ENVELOPE_KEY])
          }
        })

        child.stderr.on('data', (d) => stderrChunks.push(d))

        child.once('error', (err) => {
          if (settled) return
          settled = true
          cleanup()
          reject(err)
        })

        child.once('exit', (code) => {
          if (settled) return
          settled = true
          const stderr = Buffer.concat(stderrChunks).toString().trim()
          reject(
            new Error(
              `Python handler process exited with code ${code} before returning a result.${
                stderr ? `\nstderr:\n${stderr}` : ''
              }`,
            ),
          )
        })

        child.stdin.on('error', (err) => {
          if (settled) return
          settled = true
          cleanup()
          reject(err)
        })

        child.stdin.write(JSON.stringify({ event, context }))
        child.stdin.write('\n')
      })
    },

    /**
     * No-op (T4 spawns a fresh child per invoke; T6 will move to a
     * pool and implement real invalidation).
     */
    invalidate(_functionKey) {},

    /**
     * No-op until pooling lands in T6.
     */
    async terminate() {},
  }
}
