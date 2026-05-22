/**
 * In-memory SQS queue store for sls offline.
 *
 * Provides a minimal FIFO queue per URL with subscriber notifications.
 * The spike surface is limited to SendMessage and ReceiveMessage (D-5).
 */

import { randomUUID } from 'node:crypto'

/**
 * @typedef {{
 *   messageId:     string,
 *   body:          string,
 *   attributes:    object,
 *   receiptHandle: string,
 * }} MessageRecord
 */

/**
 * Creates and returns a fresh, empty in-memory queue store.
 *
 * Each queue is keyed by its URL and holds an ordered list of messages.
 * Subscribers registered via `subscribe` are notified synchronously
 * after each successful `send`, enabling the SQS poller (T10) to
 * trigger Lambda invocations without any event-loop delay.
 *
 * @returns {{
 *   ensureQueue: (queueUrl: string) => void,
 *   send:        (queueUrl: string, body: string, attributes: object) => { messageId: string },
 *   receive:     (queueUrl: string, maxMessages: number) => MessageRecord[],
 *   size:        (queueUrl: string) => number,
 *   subscribe:   (queueUrl: string, callback: (msg: MessageRecord) => void) => () => void,
 * }}
 */
export function createQueueStore() {
  /**
   * Map<queueUrl, { messages: MessageRecord[], subscribers: Set<Function> }>
   *
   * @type {Map<string, { messages: MessageRecord[], subscribers: Set<Function> }>}
   */
  const queues = new Map()

  /**
   * Returns the queue bucket for `queueUrl`, creating it if absent.
   *
   * @param {string} queueUrl
   * @returns {{ messages: MessageRecord[], subscribers: Set<Function> }}
   */
  function _getOrCreate(queueUrl) {
    if (!queues.has(queueUrl)) {
      queues.set(queueUrl, { messages: [], subscribers: new Set() })
    }
    return queues.get(queueUrl)
  }

  /**
   * Ensures a queue exists for `queueUrl`. Idempotent — calling it multiple
   * times for the same URL is safe.
   *
   * @param {string} queueUrl
   * @returns {void}
   */
  function ensureQueue(queueUrl) {
    _getOrCreate(queueUrl)
  }

  /**
   * Appends a message to the queue identified by `queueUrl`, then synchronously
   * notifies all registered subscribers.
   *
   * @param {string} queueUrl    - The target queue URL.
   * @param {string} body        - The serialised message body.
   * @param {object} attributes  - Message attributes object (passed through as-is).
   * @returns {{ messageId: string }} An object containing the assigned message ID.
   */
  function send(queueUrl, body, attributes) {
    const bucket = _getOrCreate(queueUrl)

    /** @type {MessageRecord} */
    const record = {
      messageId: randomUUID(),
      body,
      attributes,
      receiptHandle: randomUUID(),
    }

    bucket.messages.push(record)

    // Fire subscribers synchronously so the poller can act immediately.
    for (const cb of bucket.subscribers) {
      cb(record)
    }

    return { messageId: record.messageId }
  }

  /**
   * Dequeues and returns up to `maxMessages` messages from the front of the
   * queue in FIFO order. The returned messages are permanently removed from
   * the queue — the spike does not track in-flight messages or visibility
   * timeouts, so no delete step is required.
   *
   * @param {string} queueUrl   - The source queue URL.
   * @param {number} maxMessages - Maximum number of messages to return (≥ 1).
   * @returns {MessageRecord[]} The dequeued messages (may be an empty array).
   */
  function receive(queueUrl, maxMessages) {
    if (!queues.has(queueUrl)) {
      return []
    }

    const bucket = queues.get(queueUrl)
    const count = Math.min(maxMessages, bucket.messages.length)
    return bucket.messages.splice(0, count)
  }

  /**
   * Returns the number of messages currently held in the queue.
   *
   * @param {string} queueUrl
   * @returns {number} 0 when the queue does not exist or is empty.
   */
  function size(queueUrl) {
    return queues.get(queueUrl)?.messages.length ?? 0
  }

  /**
   * Registers `callback` to be called synchronously after each successful
   * `send` to `queueUrl`.
   *
   * @param {string} queueUrl
   * @param {(msg: MessageRecord) => void} callback
   * @returns {() => void} An unsubscribe function — call it to stop receiving notifications.
   */
  function subscribe(queueUrl, callback) {
    const bucket = _getOrCreate(queueUrl)
    bucket.subscribers.add(callback)

    return function unsubscribe() {
      bucket.subscribers.delete(callback)
    }
  }

  return { ensureQueue, send, receive, size, subscribe }
}
