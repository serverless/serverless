import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const WRAPPER = path.resolve(__dirname, 'wrappers/ruby/invoke.rb')
const ENVELOPE_KEY = '__offline_payload__'

/**
 * Ruby child-process Lambda runner — happy-path skeleton (M5c T4).
 *
 * Spawns a fresh `ruby wrappers/ruby/invoke.rb <module> <handler>` child for
 * every invocation, streams the event in over stdin as a single JSON line,
 * parses stdout line by line, and resolves on the first
 * `__offline_payload__` envelope. The child exits when the wrapper's
 * `loop do ... break if line.nil?` sees EOF after we close stdin.
 *
 * The wrapper is the same shape as the M5b Python wrapper (one JSON event
 * per line in, one JSON envelope per result line out) so subsequent tasks
 * can graduate this runner to a pool of long-lived children without the
 * wire protocol changing:
 *   - T5 will route non-envelope stdout/stderr lines through the offline
 *     logger.
 *   - T6 will introduce the per-functionKey pool + idle eviction (mirrors
 *     python.js).
 *   - T7 will plumb the user environment + AWS_LAMBDA_* runtime block.
 *   - T8 will enforce `timeoutMs` (and synthesise OFFLINE_HANDLER_TIMEOUT).
 *   - T9 will add the terminate-during-spawn / terminate-during-invoke
 *     contract (OFFLINE_WORKER_TERMINATED).
 *
 * Public shape mirrors createPythonRunner / createWorkerThreadRunner /
 * createInProcessRunner so the Lambda facade dispatches by runtime once
 * T10 lands.
 *
 * @returns {{
 *   invoke(args: object): Promise<unknown>,
 *   invalidate(functionKey: string): void,
 *   terminate(): Promise<void>,
 * }}
 */
export function createRubyRunner() {
  return {
    /**
     * @param {object} args
     * @param {string} args.functionKey
     * @param {string} args.handlerPath  Absolute path to the .rb file.
     * @param {string} args.handlerName  Either a bare method (`handler`) or
     *   `Module::Class.method` form — the wrapper resolves both.
     * @param {unknown} args.event
     * @param {object} args.context
     * @param {number} [args.timeoutMs]  Translated to seconds (`timeout`)
     *   for the wrapper's `get_remaining_time_in_millis`. T8 will add
     *   actual timeout enforcement on the JS side; today the value is only
     *   passed through so handlers reading it see something sensible.
     * @returns {Promise<unknown>}
     */
    invoke({ handlerPath, handlerName, event, context, timeoutMs }) {
      // The wrapper does `require("./#{handler_path}")` — Ruby's `require`
      // is relative to the current working directory, so spawn the child
      // with cwd = the handler's directory and pass just the basename
      // (no .rb extension). Mirrors the M5b Python cwd+basename pattern.
      const handlerDir = path.dirname(handlerPath)
      const handlerModule = path.basename(handlerPath).replace(/\.rb$/, '')

      const child = spawn('ruby', [WRAPPER, handlerModule, handlerName], {
        cwd: handlerDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      const rl = createInterface({ input: child.stdout })

      // Translate the JS-side context to the camelCase keys the wrapper's
      // FakeLambdaContext reads. The wrapper already accepts camelCase
      // verbatim, so the only field that needs adapting is the
      // user-facing `timeoutMs` (milliseconds) → wrapper-side `timeout`
      // (seconds, used by get_remaining_time_in_millis).
      const wrapperContext = {
        ...context,
        ...(timeoutMs != null ? { timeout: timeoutMs / 1000 } : {}),
      }

      return new Promise((resolve, reject) => {
        // `settled` guards against double-settling when more than one of
        // {envelope line, child error, child exit, stdin error} fires for
        // the same invocation.
        let settled = false

        const cleanup = () => {
          try {
            rl.close()
          } catch {
            // ignore
          }
          try {
            child.kill()
          } catch {
            // ignore — child may already be gone
          }
        }

        // Buffer stderr so the exit-without-envelope diagnostic can
        // surface whatever the Ruby wrapper printed before dying.
        const stderrChunks = []
        child.stderr.on('data', (d) => {
          stderrChunks.push(d)
        })

        rl.on('line', (line) => {
          if (settled) return
          let parsed
          try {
            parsed = JSON.parse(line)
          } catch {
            // Non-JSON line — handler `puts` / log output. T5 will route
            // these through the offline logger; for T4 we just drop them.
            return
          }
          if (
            parsed &&
            typeof parsed === 'object' &&
            Object.hasOwn(parsed, ENVELOPE_KEY)
          ) {
            settled = true
            resolve(parsed[ENVELOPE_KEY])
            cleanup()
            return
          }
          // JSON-but-not-our-envelope: also handler log output (e.g.
          // structured logger). T5 will forward; for T4 we drop.
        })

        child.once('error', (err) => {
          if (settled) return
          settled = true
          reject(err)
          cleanup()
        })

        child.once('exit', (code) => {
          if (settled) return
          settled = true
          const stderr = Buffer.concat(stderrChunks).toString().trim()
          reject(
            new Error(
              `Ruby handler process exited with code ${code} before returning a result.${
                stderr ? `\nstderr:\n${stderr}` : ''
              }`,
            ),
          )
          cleanup()
        })

        // Attach the stdin error listener BEFORE writing — otherwise an
        // EPIPE on a dead child becomes an unhandled 'error' event and
        // crashes the process (M5b T4 lesson).
        child.stdin.on('error', (err) => {
          if (settled) return
          settled = true
          reject(err)
          cleanup()
        })

        try {
          child.stdin.write(JSON.stringify({ event, context: wrapperContext }))
          child.stdin.write('\n')
        } catch (err) {
          if (settled) return
          settled = true
          reject(err)
          cleanup()
        }
      })
    },

    /**
     * No-op in T4 — there is no pool to invalidate (every invoke spawns
     * a fresh child). T6 wires this up symmetrically with python.js.
     *
     * @param {string} _functionKey
     */
    // eslint-disable-next-line no-unused-vars
    invalidate(_functionKey) {
      // T6 will add the per-functionKey pool entry kill here.
    },

    /**
     * No-op in T4 — children are short-lived (spawn per invoke) and exit
     * on their own once the wrapper sees EOF on stdin. T6 will track the
     * pool and kill any survivors; T9 will reject in-flight invokes with
     * ServerlessError(OFFLINE_WORKER_TERMINATED).
     *
     * @returns {Promise<void>}
     */
    async terminate() {
      // T6 will close the pool here.
    },
  }
}
