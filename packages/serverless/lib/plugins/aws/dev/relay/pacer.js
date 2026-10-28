/**
 * Paces what this machine publishes on its one AWS IoT Core connection. AWS IoT Core allows 100
 * messages per second (in and out together) and 512 KB/s per connection, drops what goes over
 * the message rate, and slows a connection that bursts until it stalls; it also refuses more than
 * 100 unacknowledged QoS 1 messages. So: a token bucket for messages and one for bytes, at most
 * MAX_IN_FLIGHT publishes waiting for their acknowledgement, acceptances (whose window is the
 * shortest) ahead of every other control frame (ends, refusals), control frames always ahead of
 * stream data, and anything whose invocation's deadline passed while it
 * waited is dropped instead of sent. A dropped publish's `onDropped(reason)` says what it waited
 * for: 'rate' (the message or byte rate), 'link' (acknowledgements of earlier publishes) or
 * 'late' (nothing: its deadline had passed when it was queued).
 */
export const MESSAGES_PER_SECOND = 45
export const BYTES_PER_SECOND = 800 * 1024
export const BYTE_BURST = 256 * 1024
export const MAX_IN_FLIGHT = 50
/**
 * The pacing of a web app's relay on each end: a page load is many responses of up to 64 KiB
 * frames at once, and AWS IoT Core lost frames of such loads at the functions' rate while it
 * delivered them all at this one.
 */
export const WEB_PACING = Object.freeze({
  messagesPerSecond: 45,
  bytesPerSecond: 400 * 1024,
  byteBurst: 128 * 1024,
})

export const createPacer = ({
  send, // (item) => Promise<void>: publishes one message
  now = Date.now,
  timers,
  onDrop = () => {},
  messagesPerSecond = MESSAGES_PER_SECOND,
  bytesPerSecond = BYTES_PER_SECOND,
  byteBurst = BYTE_BURST,
  maxInFlight = MAX_IN_FLIGHT,
}) => {
  // One queue per priority, in the order they are served.
  const queues = { acceptance: [], control: [], data: [] }
  const ordered = Object.values(queues)
  const waitingCount = () => ordered.reduce((n, queue) => n + queue.length, 0)
  let messageTokens = messagesPerSecond
  let byteTokens = byteBurst
  let refilledAt = now()
  let inFlight = 0
  let timer = null
  let closed = false

  const refill = () => {
    const at = now()
    const seconds = Math.max(0, at - refilledAt) / 1000
    refilledAt = at
    messageTokens = Math.min(
      messagesPerSecond,
      messageTokens + seconds * messagesPerSecond,
    )
    byteTokens = Math.min(byteBurst, byteTokens + seconds * bytesPerSecond)
  }

  // Every queued message waits for what holds up the head of the queue.
  const waiting = (reason) => {
    for (const queue of ordered) {
      for (const item of queue) item.waited = reason
    }
  }
  const drop = (item) => {
    item.resolve(false)
    onDrop(item)
    try {
      item.onDropped?.(item.waited ?? 'late')
    } catch {
      // A listener's failure never stops the queue.
    }
  }

  const schedule = (ms) => {
    if (timer || closed) return
    timer = timers.setTimeout(() => {
      timer = null
      pump()
    }, ms)
  }

  const pump = () => {
    if (closed) return
    refill()
    while (inFlight < maxInFlight) {
      const queue = ordered.find((items) => items.length) ?? queues.data
      const item = queue[0]
      if (!item) return
      if (item.deadline !== undefined && item.deadline <= now()) {
        queue.shift()
        drop(item)
        continue
      }
      const bytes = item.payload.length
      const needBytes = Math.min(bytes, byteBurst)
      if (messageTokens < 1 || byteTokens < needBytes) {
        const waitMessages =
          messageTokens < 1
            ? ((1 - messageTokens) / messagesPerSecond) * 1000
            : 0
        const waitBytes =
          byteTokens < needBytes
            ? ((needBytes - byteTokens) / bytesPerSecond) * 1000
            : 0
        waiting('rate')
        schedule(Math.max(1, Math.ceil(Math.max(waitMessages, waitBytes))))
        return
      }
      queue.shift()
      messageTokens -= 1
      byteTokens -= bytes
      inFlight += 1
      Promise.resolve()
        .then(() => send(item))
        .then(
          () => item.resolve(true),
          (error) => item.reject(error),
        )
        .finally(() => {
          inFlight -= 1
          pump()
        })
    }
    if (waitingCount()) waiting('link')
  }

  return {
    /**
     * Queues one message; resolves true once published, false when it was dropped because its
     * deadline passed first (`onDropped(reason)` says why) or the pacer closed; rejects when the
     * publish failed. `priority: 'acceptance'` goes first, then `'control'`, then `'data'` (the
     * default). `deadline` is a time on the `now` clock.
     */
    publish({
      topic,
      payload,
      priority = 'data',
      deadline,
      expirySeconds,
      onDropped,
    }) {
      if (closed) return Promise.resolve(false)
      return new Promise((resolve, reject) => {
        const item = {
          topic,
          payload,
          priority,
          deadline,
          expirySeconds,
          onDropped,
          resolve,
          reject,
        }
        if (deadline !== undefined && deadline <= now()) {
          drop(item)
          return
        }
        ;(Object.hasOwn(queues, priority)
          ? queues[priority]
          : queues.data
        ).push(item)
        pump()
      })
    },
    /** Stops sending: what still waits resolves false; publishes already sent settle as they do. */
    close() {
      closed = true
      if (timer) timers.clearTimeout(timer)
      timer = null
      for (const item of ordered.flatMap((queue) => queue.splice(0))) {
        item.resolve(false)
      }
    },
  }
}
