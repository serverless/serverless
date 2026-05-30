/**
 * In-memory SQS queue store for sls offline.
 *
 * Models the SQS visibility-timeout state machine: messages move between
 * `available` and `inflight`, become visible again when their visibility
 * window lapses, are dropped after the retention period, and — when a redrive
 * policy is configured — are routed to a dead-letter queue once they have been
 * received more times than `maxReceiveCount`. FIFO group ordering, group
 * exclusivity (one in-flight message per group), and a 5-minute deduplication
 * window are also modelled.
 *
 * All time reads go through an injectable `now()` so behaviour is fully
 * deterministic under test (no reliance on real timers).
 */

import { createHash, randomUUID } from 'node:crypto'

/** Default per-queue configuration values (seconds, except booleans). */
const DEFAULT_VISIBILITY_TIMEOUT = 30
const DEFAULT_DELAY_SECONDS = 0
const DEFAULT_MESSAGE_RETENTION_PERIOD = 345_600
const DEFAULT_RECEIVE_WAIT_TIME = 0

/** FIFO deduplication window: a duplicate id within 5 minutes is suppressed. */
const DEDUP_WINDOW_MS = 5 * 60 * 1000

/** SenderId reported on every received message. */
const SENDER_ID = 'AIDAOFFLINE'

/**
 * @typedef {{
 *   messageId:         string,
 *   body:              string,
 *   messageAttributes: object,
 *   systemAttributes:  object,
 *   receiptHandle:     string | null,
 *   state:             'available' | 'inflight',
 *   receiveCount:      number,
 *   visibleAt:         number,
 *   delayUntil:        number,
 *   sentAt:            number,
 *   firstReceivedAt:   number | null,
 *   groupId?:          string,
 *   dedupId?:          string,
 *   sequenceNumber?:   string,
 * }} Message
 */

/**
 * Derive a stable queue name from its URL (the path's final segment).
 *
 * @param {string} url
 * @returns {string}
 */
function queueNameFromUrl(url) {
  const parts = String(url).split('/')
  return parts[parts.length - 1]
}

/**
 * Creates and returns a fresh, empty in-memory queue store.
 *
 * @param {{ now?: () => number }} [options]
 *   `now` returns the current epoch-millis; inject a mutable clock under test.
 * @returns {object} The store API (see method JSDoc below).
 */
export function createQueueStore({ now = () => Date.now() } = {}) {
  /**
   * Map<queueUrl, {
   *   config: object,
   *   messages: Message[],
   *   groupsInFlight: Set<string>,
   *   dedup: Map<string, number>,
   *   seq: number,
   *   subscribers: Set<Function>,
   * }>
   */
  const queues = new Map()

  /**
   * Normalise a partial config object against the documented defaults.
   *
   * @param {object} [config]
   * @returns {object}
   */
  function normaliseConfig(config = {}) {
    return {
      visibilityTimeout: config.visibilityTimeout ?? DEFAULT_VISIBILITY_TIMEOUT,
      delaySeconds: config.delaySeconds ?? DEFAULT_DELAY_SECONDS,
      messageRetentionPeriod:
        config.messageRetentionPeriod ?? DEFAULT_MESSAGE_RETENTION_PERIOD,
      receiveWaitTime: config.receiveWaitTime ?? DEFAULT_RECEIVE_WAIT_TIME,
      fifo: config.fifo ?? false,
      contentBasedDedup: config.contentBasedDedup ?? false,
      redrive: config.redrive ?? null,
    }
  }

  /**
   * Ensure a queue exists for `url`. Idempotent — re-ensuring keeps the
   * existing config and messages untouched (first create wins).
   *
   * @param {string} url
   * @param {object} [config]
   * @returns {void}
   */
  function ensureQueue(url, config = {}) {
    if (queues.has(url)) return
    queues.set(url, {
      config: normaliseConfig(config),
      messages: [],
      groupsInFlight: new Set(),
      dedup: new Map(),
      seq: 0,
      subscribers: new Set(),
    })
  }

  /**
   * Return the queue bucket, creating it with defaults if absent.
   *
   * @param {string} url
   * @returns {object}
   */
  function getOrCreate(url) {
    ensureQueue(url)
    return queues.get(url)
  }

  /**
   * Notify every subscriber of `url` with `record`.
   *
   * @param {object} bucket
   * @param {object} record
   */
  function notify(bucket, record) {
    for (const cb of bucket.subscribers) cb(record)
  }

  /**
   * Send a message. Accepts both the modern object form
   * `send(url, { body, messageAttributes, delaySeconds, groupId, dedupId })`
   * and the legacy positional form `send(url, bodyString, attributesObject)`.
   *
   * FIFO: resolves the deduplication id (explicit, else SHA-256 of the body
   * when content-based dedup is on); a duplicate seen within the 5-minute
   * window is accepted but NOT enqueued and returns the original messageId.
   *
   * @param {string} url
   * @param {object|string} payload
   * @param {object} [legacyAttributes]
   * @returns {{ messageId: string, sequenceNumber?: string }}
   */
  function send(url, payload, legacyAttributes) {
    const opts =
      typeof payload === 'string'
        ? { body: payload, messageAttributes: legacyAttributes ?? {} }
        : (payload ?? {})

    const bucket = getOrCreate(url)
    const { config } = bucket

    const body = opts.body ?? ''
    const messageAttributes = opts.messageAttributes ?? {}
    const ts = now()

    let dedupId
    let sequenceNumber
    if (config.fifo) {
      dedupId =
        opts.dedupId ??
        (config.contentBasedDedup
          ? createHash('sha256').update(body, 'utf8').digest('hex')
          : undefined)

      if (dedupId !== undefined) {
        const seenAt = bucket.dedup.get(dedupId)
        if (seenAt !== undefined && ts - seenAt < DEDUP_WINDOW_MS) {
          // Duplicate within the window: accept but do not enqueue.
          const existing = bucket.messages.find((m) => m.dedupId === dedupId)
          return {
            messageId: existing ? existing.messageId : randomUUID(),
            sequenceNumber: existing ? existing.sequenceNumber : undefined,
          }
        }
        bucket.dedup.set(dedupId, ts)
      }

      bucket.seq += 1
      sequenceNumber = String(bucket.seq)
    }

    const delaySeconds = opts.delaySeconds ?? config.delaySeconds
    const messageId = randomUUID()

    /** @type {Message} */
    const message = {
      messageId,
      body,
      messageAttributes,
      systemAttributes: {},
      receiptHandle: null,
      state: 'available',
      receiveCount: 0,
      visibleAt: ts,
      delayUntil: ts + delaySeconds * 1000,
      sentAt: ts,
      firstReceivedAt: null,
      groupId: opts.groupId,
      dedupId,
      sequenceNumber,
    }

    bucket.messages.push(message)

    notify(bucket, toRecord(message))

    return config.fifo ? { messageId, sequenceNumber } : { messageId }
  }

  /**
   * Whether a message is currently receivable.
   *
   * @param {Message} m
   * @param {number} ts
   * @returns {boolean}
   */
  function isAvailable(m, ts) {
    return m.state === 'available' && m.delayUntil <= ts && m.visibleAt <= ts
  }

  /**
   * Build the outward-facing record for a message. Carries both the modern
   * (`messageAttributes` / `systemAttributes`) and legacy (`attributes`) shapes.
   *
   * @param {Message} m
   * @returns {object}
   */
  function toRecord(m) {
    const systemAttributes = {
      ApproximateReceiveCount: String(m.receiveCount),
      SentTimestamp: String(m.sentAt),
      SenderId: SENDER_ID,
      ApproximateFirstReceiveTimestamp: String(m.firstReceivedAt ?? m.sentAt),
    }
    if (m.groupId !== undefined) {
      systemAttributes.MessageGroupId = m.groupId
    }
    if (m.sequenceNumber !== undefined) {
      systemAttributes.SequenceNumber = m.sequenceNumber
    }
    if (m.dedupId !== undefined) {
      systemAttributes.MessageDeduplicationId = m.dedupId
    }

    return {
      messageId: m.messageId,
      body: m.body,
      receiptHandle: m.receiptHandle,
      messageAttributes: m.messageAttributes,
      // Legacy alias read by the current handlers + poller.
      attributes: m.messageAttributes,
      systemAttributes,
    }
  }

  /**
   * Receive up to `max` messages. Accepts both the modern object form
   * `receive(url, { max, visibilityTimeout })` and the legacy positional form
   * `receive(url, maxNumber)`.
   *
   * FIFO queues skip groups already in flight, preserve per-group order, and
   * deliver at most one in-flight message per group.
   *
   * @param {string} url
   * @param {object|number} [arg]
   * @returns {object[]}
   */
  function receive(url, arg) {
    const bucket = queues.get(url)
    if (!bucket) return []

    const opts = typeof arg === 'number' ? { max: arg } : (arg ?? {})
    const max = opts.max ?? 1
    const visibilityTimeout =
      opts.visibilityTimeout ?? bucket.config.visibilityTimeout
    const ts = now()

    const out = []
    // Track groups claimed within this single receive so we never hand out
    // two messages from the same FIFO group in one batch.
    const claimedGroups = new Set()

    for (const m of bucket.messages) {
      if (out.length >= max) break
      if (!isAvailable(m, ts)) continue

      if (bucket.config.fifo) {
        const group = m.groupId
        if (bucket.groupsInFlight.has(group) || claimedGroups.has(group)) {
          continue
        }
        claimedGroups.add(group)
        bucket.groupsInFlight.add(group)
      }

      m.state = 'inflight'
      m.receiptHandle = randomUUID()
      m.receiveCount += 1
      if (m.firstReceivedAt === null) m.firstReceivedAt = ts
      m.visibleAt = ts + visibilityTimeout * 1000

      out.push(toRecord(m))
    }

    return out
  }

  /**
   * Locate an inflight message by its receipt handle.
   *
   * @param {object} bucket
   * @param {string} receiptHandle
   * @returns {{ index: number, message: Message } | null}
   */
  function findByReceipt(bucket, receiptHandle) {
    const index = bucket.messages.findIndex(
      (m) => m.receiptHandle === receiptHandle,
    )
    if (index === -1) return null
    return { index, message: bucket.messages[index] }
  }

  /**
   * Free the FIFO group of `m` so its next message can be delivered.
   *
   * @param {object} bucket
   * @param {Message} m
   */
  function freeGroup(bucket, m) {
    if (m.groupId !== undefined) bucket.groupsInFlight.delete(m.groupId)
  }

  /**
   * Delete an inflight message. Unknown handles are tolerated (no-op), matching
   * AWS. Frees the message's FIFO group.
   *
   * @param {string} url
   * @param {string} receiptHandle
   * @returns {void}
   */
  function deleteMessage(url, receiptHandle) {
    const bucket = queues.get(url)
    if (!bucket) return
    const found = findByReceipt(bucket, receiptHandle)
    if (!found) return
    bucket.messages.splice(found.index, 1)
    freeGroup(bucket, found.message)
  }

  /**
   * Adjust the visibility window of an inflight message.
   *
   * @param {string} url
   * @param {string} receiptHandle
   * @param {number} timeout - seconds from now until the message is visible.
   * @returns {void}
   */
  function changeMessageVisibility(url, receiptHandle, timeout) {
    const bucket = queues.get(url)
    if (!bucket) return
    const found = findByReceipt(bucket, receiptHandle)
    if (!found) return
    found.message.visibleAt = now() + timeout * 1000
  }

  /**
   * Return a message to the available state and free its FIFO group.
   *
   * @param {object} bucket
   * @param {Message} m
   */
  function returnToAvailable(bucket, m) {
    m.state = 'available'
    m.receiptHandle = null
    m.visibleAt = now()
    freeGroup(bucket, m)
  }

  /**
   * Periodic + opportunistic maintenance pass.
   *
   * For each inflight message whose visibility window has lapsed: route it to
   * the dead-letter queue when a redrive policy is configured and its
   * receiveCount exceeds `maxReceiveCount`, otherwise return it to the available
   * state. Also drops available messages older than the retention period.
   *
   * @param {number} [nowTs] - the reference time; defaults to `now()`.
   * @returns {Set<string>} urls that gained newly-available messages.
   */
  function sweep(nowTs = now()) {
    const woken = new Set()

    for (const [url, bucket] of queues) {
      const { config } = bucket
      const survivors = []

      for (const m of bucket.messages) {
        // Drop available messages past the retention period.
        if (
          m.state === 'available' &&
          nowTs - m.sentAt >= config.messageRetentionPeriod * 1000
        ) {
          freeGroup(bucket, m)
          continue
        }

        if (m.state === 'inflight' && m.visibleAt <= nowTs) {
          if (
            config.redrive &&
            m.receiveCount > config.redrive.maxReceiveCount
          ) {
            // Route to the dead-letter queue as a fresh available message.
            freeGroup(bucket, m)
            send(config.redrive.dlqUrl, {
              body: m.body,
              messageAttributes: m.messageAttributes,
            })
            woken.add(config.redrive.dlqUrl)
            continue // drop from this queue
          }
          returnToAvailable(bucket, m)
          woken.add(url)
        }

        survivors.push(m)
      }

      bucket.messages = survivors
    }

    // Notify subscribers of queues that gained availability so pollers wake.
    for (const url of woken) {
      const bucket = queues.get(url)
      if (bucket) notify(bucket, { queueUrl: url })
    }

    return woken
  }

  /**
   * Count of non-deleted messages in a queue (available + inflight).
   *
   * @param {string} url
   * @returns {number}
   */
  function size(url) {
    return queues.get(url)?.messages.length ?? 0
  }

  /**
   * Return the live (normalised) config for a queue, or `undefined` when the
   * queue does not exist. Read by the poller to learn a queue's visibility
   * timeout without coupling it to the boot-time config object.
   *
   * @param {string} url
   * @returns {object | undefined}
   */
  function getConfig(url) {
    return queues.get(url)?.config
  }

  /**
   * Resolve a queue url by its name.
   *
   * @param {string} name
   * @returns {string | undefined}
   */
  function getQueueUrl(name) {
    for (const url of queues.keys()) {
      if (queueNameFromUrl(url) === name) return url
    }
    return undefined
  }

  /**
   * List queue urls, optionally filtered by a url prefix.
   *
   * @param {string} [prefix]
   * @returns {string[]}
   */
  function listQueues(prefix) {
    const urls = [...queues.keys()]
    return prefix ? urls.filter((u) => u.startsWith(prefix)) : urls
  }

  /**
   * Remove a queue entirely.
   *
   * @param {string} url
   * @returns {void}
   */
  function deleteQueue(url) {
    queues.delete(url)
  }

  /**
   * Empty a queue, including inflight messages and FIFO group state.
   *
   * @param {string} url
   * @returns {void}
   */
  function purgeQueue(url) {
    const bucket = queues.get(url)
    if (!bucket) return
    bucket.messages = []
    bucket.groupsInFlight.clear()
  }

  /**
   * Compute SQS-style queue attributes. When `names` is given, only the
   * requested names (plus `All`) are returned.
   *
   * @param {string} url
   * @param {string[]} [names]
   * @returns {object}
   */
  function getQueueAttributes(url, names) {
    const bucket = queues.get(url)
    if (!bucket) return {}
    const { config } = bucket

    let available = 0
    let notVisible = 0
    const ts = now()
    for (const m of bucket.messages) {
      if (isAvailable(m, ts)) available += 1
      else notVisible += 1
    }

    const all = {
      ApproximateNumberOfMessages: String(available),
      ApproximateNumberOfMessagesNotVisible: String(notVisible),
      ApproximateNumberOfMessagesDelayed: '0',
      VisibilityTimeout: String(config.visibilityTimeout),
      DelaySeconds: String(config.delaySeconds),
      MessageRetentionPeriod: String(config.messageRetentionPeriod),
      ReceiveMessageWaitTimeSeconds: String(config.receiveWaitTime),
    }
    if (config.fifo) {
      all.FifoQueue = 'true'
      all.ContentBasedDeduplication = config.contentBasedDedup
        ? 'true'
        : 'false'
    }
    if (config.redrive) {
      all.RedrivePolicy = JSON.stringify({
        deadLetterTargetArn: config.redrive.dlqArn,
        maxReceiveCount: config.redrive.maxReceiveCount,
      })
    }

    if (!names || names.length === 0 || names.includes('All')) return all

    const subset = {}
    for (const name of names) {
      if (name in all) subset[name] = all[name]
    }
    return subset
  }

  /**
   * Mutate the live queue config from an attribute map. Numeric values may
   * arrive as strings and are coerced.
   *
   * @param {string} url
   * @param {object} attrs
   * @returns {void}
   */
  function setQueueAttributes(url, attrs = {}) {
    const bucket = queues.get(url)
    if (!bucket) return
    const { config } = bucket
    if (attrs.visibilityTimeout !== undefined) {
      config.visibilityTimeout = Number(attrs.visibilityTimeout)
    }
    if (attrs.delaySeconds !== undefined) {
      config.delaySeconds = Number(attrs.delaySeconds)
    }
    if (attrs.messageRetentionPeriod !== undefined) {
      config.messageRetentionPeriod = Number(attrs.messageRetentionPeriod)
    }
    if (attrs.receiveWaitTime !== undefined) {
      config.receiveWaitTime = Number(attrs.receiveWaitTime)
    }
    if (attrs.contentBasedDedup !== undefined) {
      config.contentBasedDedup = Boolean(attrs.contentBasedDedup)
    }
    if (attrs.redrive !== undefined) {
      config.redrive = attrs.redrive
    }
  }

  /**
   * Register a subscriber notified synchronously when `url` gains a message
   * (on `send`, and on `sweep` when a queue becomes newly available).
   *
   * @param {string} url
   * @param {(record: object) => void} callback
   * @returns {() => void} unsubscribe
   */
  function subscribe(url, callback) {
    const bucket = getOrCreate(url)
    bucket.subscribers.add(callback)
    return function unsubscribe() {
      bucket.subscribers.delete(callback)
    }
  }

  return {
    ensureQueue,
    send,
    receive,
    deleteMessage,
    changeMessageVisibility,
    sweep,
    size,
    getConfig,
    getQueueUrl,
    listQueues,
    deleteQueue,
    purgeQueue,
    getQueueAttributes,
    setQueueAttributes,
    subscribe,
  }
}
