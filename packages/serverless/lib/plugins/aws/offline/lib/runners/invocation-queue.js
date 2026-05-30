import { randomUUID } from 'node:crypto'
import ServerlessError from '../../../../../serverless-error.js'

/**
 * @typedef {object} PendingEntry
 * @property {string} requestId
 * @property {unknown} payload
 * @property {number} deadlineMs  Absolute ms timestamp (Date.now() + timeoutMs).
 * @property {string} invokedFunctionArn
 * @property {(value: unknown) => void} resolve
 * @property {(err: unknown) => void} reject
 * @property {NodeJS.Timeout | null} timer
 */

/**
 * @typedef {object} Waiter
 * @property {(value: { requestId: string, payload: unknown, deadlineMs: number, invokedFunctionArn: string }) => void} resolveNext
 * @property {(err: unknown) => void} rejectNext
 * @property {(() => void) | null} onAbort  Listener registered on an AbortSignal; cleared on settle.
 * @property {AbortSignal | null} signal
 */

/**
 * @typedef {object} InFlightEntry
 * @property {(value: unknown) => void} resolve
 * @property {(err: unknown) => void} reject
 * @property {NodeJS.Timeout | null} timer
 */

/**
 * @typedef {object} QueueState
 * @property {PendingEntry[]} pending  FIFO of enqueued-but-not-yet-delivered invocations.
 * @property {Waiter[]} waiters       FIFO of long-pollers parked on awaitNext().
 * @property {Map<string, InFlightEntry>} inFlight  Delivered, awaiting resolve/reject.
 */

const ABORT_ERROR_NAME = 'AbortError'

function createAbortError() {
  const e = new Error('Aborted')
  e.name = ABORT_ERROR_NAME
  return e
}

/**
 * Per-functionKey invocation queue bridging in-process invoke() calls to
 * an external runtime polling the AWS Lambda Runtime API.
 *
 * Each functionKey has three FIFO collections:
 *  - `pending`   — enqueued payloads waiting for a `/next` consumer.
 *  - `waiters`   — `/next` consumers parked because `pending` was empty.
 *  - `inFlight`  — delivered to a consumer, awaiting matching response/error.
 *
 * `enqueue` either hands the invocation directly to a parked waiter (which
 * promotes it straight to `inFlight`) or pushes onto `pending`. `awaitNext`
 * either shifts from `pending` (and promotes to `inFlight`) or parks as a
 * waiter. Both `resolveInvocation` and `rejectInvocation` are lenient: they
 * no-op if the id is unknown, so late HTTP traffic from a crashed/timed-out
 * runtime never throws. Callers wanting a strict precheck (e.g. an HTTP
 * route returning 404 for unknown ids) use `has(functionKey, requestId)`.
 *
 * @returns {{
 *   enqueue(functionKey: string, args: { payload: unknown, timeoutMs: number, invokedFunctionArn?: string }): Promise<unknown>,
 *   awaitNext(functionKey: string, options: { signal?: AbortSignal }): Promise<{ requestId: string, payload: unknown, deadlineMs: number, invokedFunctionArn: string }>,
 *   resolveInvocation(functionKey: string, requestId: string, result: unknown): void,
 *   rejectInvocation(functionKey: string, requestId: string, errorBody: unknown): void,
 *   has(functionKey: string, requestId: string): boolean,
 *   rejectAll(functionKey: string, reason: unknown): void,
 *   clear(functionKey: string): void,
 * }}
 */
export function createInvocationQueue() {
  /** @type {Map<string, QueueState>} */
  const queues = new Map()

  /**
   * Get-or-create the per-key state.
   *
   * @param {string} functionKey
   * @returns {QueueState}
   */
  function _state(functionKey) {
    let s = queues.get(functionKey)
    if (!s) {
      s = { pending: [], waiters: [], inFlight: new Map() }
      queues.set(functionKey, s)
    }
    return s
  }

  // Defined as a closure rather than `this.rejectAll` so callers can safely
  // destructure the returned object (`const { clear } = createInvocationQueue()`)
  // without losing the binding.
  function rejectAllImpl(functionKey, reason) {
    const s = queues.get(functionKey)
    if (!s) return
    for (const p of s.pending) {
      if (p.timer !== null) clearTimeout(p.timer)
      p.reject(reason)
    }
    s.pending.length = 0
    for (const entry of s.inFlight.values()) {
      if (entry.timer !== null) clearTimeout(entry.timer)
      entry.reject(reason)
    }
    s.inFlight.clear()
    // Parked waiters are HTTP long-pollers — they expect AbortError when
    // their poll is cancelled, not the runner's terminate `reason`. The
    // runner-side `reason` is only meaningful to `pending` + `inFlight`
    // consumers (the original invoker).
    const abortErr = createAbortError()
    for (const w of s.waiters) {
      _detachAbort(w)
      w.rejectNext(abortErr)
    }
    s.waiters.length = 0
  }

  return {
    enqueue(functionKey, { payload, timeoutMs, invokedFunctionArn = '' }) {
      const s = _state(functionKey)
      const requestId = randomUUID()
      const deadlineMs = Date.now() + timeoutMs

      return new Promise((resolve, reject) => {
        // Arm the per-invocation timeout up front. The timer runs for the
        // full `timeoutMs` window starting now — spanning both the
        // pending-queue wait AND the in-flight handler execution. Cleared
        // by any settle path (resolveInvocation / rejectInvocation /
        // rejectAll / clear); fires here if none of those happen in time.
        const timer = setTimeout(() => {
          // Remove the entry from wherever it lives so the late
          // resolve/reject can't double-settle. The id is unique enough
          // that splicing by identity here is cheap in practice.
          const idx = s.pending.findIndex((p) => p.requestId === requestId)
          if (idx !== -1) s.pending.splice(idx, 1)
          s.inFlight.delete(requestId)
          reject(
            new ServerlessError(
              `Task timed out after ${(timeoutMs / 1000).toFixed(2)} seconds`,
              'OFFLINE_HANDLER_TIMEOUT',
            ),
          )
        }, timeoutMs)

        const waiter = s.waiters.shift()
        if (waiter) {
          // Direct hand-off: the invocation never sits in `pending`; it
          // moves straight to inFlight, and the waiter is resolved with
          // the delivery envelope.
          _detachAbort(waiter)
          s.inFlight.set(requestId, { resolve, reject, timer })
          waiter.resolveNext({
            requestId,
            payload,
            deadlineMs,
            invokedFunctionArn,
          })
          return
        }

        s.pending.push({
          requestId,
          payload,
          deadlineMs,
          invokedFunctionArn,
          resolve,
          reject,
          timer,
        })
      })
    },

    awaitNext(functionKey, { signal } = {}) {
      const s = _state(functionKey)

      if (signal && signal.aborted) {
        return Promise.reject(createAbortError())
      }

      // Drain pending first.
      const head = s.pending.shift()
      if (head) {
        s.inFlight.set(head.requestId, {
          resolve: head.resolve,
          reject: head.reject,
          timer: head.timer,
        })
        return Promise.resolve({
          requestId: head.requestId,
          payload: head.payload,
          deadlineMs: head.deadlineMs,
          invokedFunctionArn: head.invokedFunctionArn,
        })
      }

      // Park as a waiter and wire up the abort listener (if any) so a
      // later signal abort removes the waiter from the FIFO before
      // rejecting the parked promise — otherwise a stale slot could be
      // resolved by a much later enqueue, leaking the invocation.
      return new Promise((resolveNext, rejectNext) => {
        /** @type {Waiter} */
        const waiter = {
          resolveNext,
          rejectNext,
          onAbort: null,
          signal: signal ?? null,
        }
        if (signal) {
          const onAbort = () => {
            const idx = s.waiters.indexOf(waiter)
            if (idx !== -1) s.waiters.splice(idx, 1)
            _detachAbort(waiter)
            rejectNext(createAbortError())
          }
          waiter.onAbort = onAbort
          signal.addEventListener('abort', onAbort, { once: true })
        }
        s.waiters.push(waiter)
      })
    },

    resolveInvocation(functionKey, requestId, result) {
      const s = queues.get(functionKey)
      if (!s) return
      const entry = s.inFlight.get(requestId)
      if (!entry) return
      if (entry.timer !== null) clearTimeout(entry.timer)
      s.inFlight.delete(requestId)
      entry.resolve(result)
    },

    rejectInvocation(functionKey, requestId, errorBody) {
      const s = queues.get(functionKey)
      if (!s) return
      const entry = s.inFlight.get(requestId)
      if (!entry) return
      if (entry.timer !== null) clearTimeout(entry.timer)
      s.inFlight.delete(requestId)
      entry.reject(errorBody)
    },

    // Strict precheck against the `inFlight` map only — returns false for
    // an id that's still in `pending` (the runtime hasn't polled /next for
    // it yet), which is exactly what callers want for /response and /error
    // routes: the runtime can only know an id it received from /next.
    has(functionKey, requestId) {
      const s = queues.get(functionKey)
      if (!s) return false
      return s.inFlight.has(requestId)
    },

    rejectAll: rejectAllImpl,

    clear(functionKey) {
      rejectAllImpl(functionKey, new Error('Queue cleared'))
      queues.delete(functionKey)
    },
  }
}

/**
 * Remove the abort listener (if any) from a waiter's signal. Safe to call
 * multiple times — each call clears the reference so a re-call is a no-op.
 *
 * @param {Waiter} waiter
 */
function _detachAbort(waiter) {
  if (waiter.onAbort && waiter.signal) {
    waiter.signal.removeEventListener('abort', waiter.onAbort)
  }
  waiter.onAbort = null
  waiter.signal = null
}
