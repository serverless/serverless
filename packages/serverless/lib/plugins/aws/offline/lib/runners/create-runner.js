import { createInProcessRunner } from './in-process.js'
import { createPythonRunner } from './python.js'
import { createWorkerThreadRunner } from './worker-thread.js'

/**
 * Resolve a function's runtime + the global `useInProcess` flag to the
 * kind of sub-runner that should service the invoke.
 *
 * `runtime ?? ''` so a missing/undefined runtime falls through to the
 * Node default path — matches the pre-M5b behaviour of branching purely
 * on `useInProcess` when no runtime is supplied.
 *
 * The Python regex matches `/^python\d+\.\d+$/` strictly (same shape as
 * `runtime-guard.js` from T1) — a hypothetical `python` (no version) is
 * rejected upstream by the guard, so keep the dispatch surface tight.
 *
 * Pure function; exported only for direct unit testing if needed.
 *
 * @param {string | undefined | null} runtime  AWS runtime identifier
 *   (e.g. `nodejs20.x`, `python3.11`).
 * @param {boolean} useInProcess
 * @returns {'python' | 'in-process' | 'worker-thread'}
 */
function _resolveRunnerKind(runtime, useInProcess) {
  if (/^python\d+\.\d+$/.test(runtime ?? '')) return 'python'
  return useInProcess ? 'in-process' : 'worker-thread'
}

/**
 * Build a runtime-aware composite runner.
 *
 * The composite holds up to three live sub-runners (in-process,
 * worker-thread, python), each created lazily on the first invoke that
 * needs them. `invoke()` reads `args.runtime`, resolves a kind, and
 * routes to (or lazily creates) the matching sub-runner. `invalidate()`
 * fans out to every live sub-runner; `terminate()` shuts them all down
 * and waits.
 *
 * After `terminate()` returns the composite still accepts new invokes —
 * a fresh sub-runner is spawned on demand. This matches the existing
 * worker-thread runner's contract and keeps the boot-time wiring point
 * (a single `createRunner` call) independent of process lifecycle.
 *
 * The in-process runner trades isolation + hot-reload for lower per-
 * invocation overhead and direct stack traces, and is opt-in via the
 * `--useInProcess` CLI flag (or `offline.useInProcess: true` in YAML).
 * The Python runner is selected purely by the function's runtime — the
 * `useInProcess` flag has no effect for Python functions. Future M5c
 * runtimes (ruby, go, java) drop in as single-line additions to
 * `_resolveRunnerKind` plus their `createXRunner`.
 *
 * @param {object} params
 * @param {boolean} params.useInProcess  Selects the Node sub-runner.
 *   `true` → in-process; `false` → worker-thread. Ignored for Python.
 * @param {number} params.terminateIdleLambdaTime  Forwarded to the
 *   worker-thread and Python sub-runners; the in-process runner has no
 *   idle workers to terminate.
 * @returns {{
 *   invoke(args: object): Promise<unknown>,
 *   invalidate(functionKey: string): void,
 *   terminate(): Promise<void>,
 * }}
 */
export function createRunner({ useInProcess, terminateIdleLambdaTime }) {
  /** @type {Map<'in-process' | 'worker-thread' | 'python', { invoke: Function, invalidate: Function, terminate: Function }>} */
  const subs = new Map()

  function _get(kind) {
    let r = subs.get(kind)
    if (r) return r
    if (kind === 'in-process') {
      r = createInProcessRunner()
    } else if (kind === 'python') {
      r = createPythonRunner({ terminateIdleLambdaTime })
    } else {
      r = createWorkerThreadRunner({
        servicePath: '',
        terminateIdleLambdaTime,
      })
    }
    subs.set(kind, r)
    return r
  }

  return {
    async invoke(args) {
      const kind = _resolveRunnerKind(args?.runtime, useInProcess)
      return _get(kind).invoke(args)
    },
    invalidate(functionKey) {
      for (const sub of subs.values()) sub.invalidate(functionKey)
    },
    async terminate() {
      const promises = []
      for (const sub of subs.values()) promises.push(sub.terminate())
      subs.clear()
      await Promise.all(promises)
    },
  }
}
