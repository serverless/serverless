import { createQueueStore } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/sqs/queue-store.js'

const Q = 'http://localhost:4566/000000000000/MyQueue'
const OTHER = 'http://localhost:4566/000000000000/OtherQueue'
const DLQ = 'http://localhost:4566/000000000000/DeadLetterQueue'

/**
 * Build a mutable clock for injection. `tick(ms)` advances simulated time so
 * tests never depend on real timers.
 */
function makeClock(start = 1_000_000) {
  let t = start
  return {
    now: () => t,
    tick(ms) {
      t += ms
    },
    set(ms) {
      t = ms
    },
  }
}

// ===========================================================================
// Backward-compatible positional API (still used by handlers + poller)
// ===========================================================================

it('1. ensureQueue is idempotent', () => {
  const store = createQueueStore()
  store.ensureQueue(Q)
  store.ensureQueue(Q)
  expect(store.size(Q)).toBe(0)
})

it('2. send (positional) returns a { messageId } with a non-empty string ID', () => {
  const store = createQueueStore()
  store.ensureQueue(Q)
  const result = store.send(Q, 'hello', {})
  expect(typeof result.messageId).toBe('string')
  expect(result.messageId.length).toBeGreaterThan(0)
})

it('3. receive (positional) returns up to n available messages in FIFO order', () => {
  const store = createQueueStore()
  store.ensureQueue(Q)
  store.send(Q, 'first', {})
  store.send(Q, 'second', {})
  store.send(Q, 'third', {})

  const msgs = store.receive(Q, 2)
  expect(msgs).toHaveLength(2)
  expect(msgs[0].body).toBe('first')
  expect(msgs[1].body).toBe('second')
})

it('4. receive marks messages inflight (NOT removed) so size still counts them', () => {
  const store = createQueueStore()
  store.ensureQueue(Q)
  store.send(Q, 'a', {})
  store.send(Q, 'b', {})
  store.send(Q, 'c', {})

  store.receive(Q, 2)
  // All three still live; size counts every non-deleted message.
  expect(store.size(Q)).toBe(3)
})

it('5. receive returns [] when the queue is empty', () => {
  const store = createQueueStore()
  store.ensureQueue(Q)
  expect(store.receive(Q, 5)).toEqual([])
})

it('6. subscribe callback fires synchronously on send', () => {
  const store = createQueueStore()
  store.ensureQueue(Q)
  const calls = []
  store.subscribe(Q, (msg) => calls.push(msg))
  store.send(Q, 'sync-test', {})
  expect(calls).toHaveLength(1)
  expect(calls[0].body).toBe('sync-test')
})

it('7. unsubscribe stops further callbacks', () => {
  const store = createQueueStore()
  store.ensureQueue(Q)
  const calls = []
  const unsub = store.subscribe(Q, (msg) => calls.push(msg))
  store.send(Q, 'before-unsub', {})
  unsub()
  store.send(Q, 'after-unsub', {})
  expect(calls).toHaveLength(1)
  expect(calls[0].body).toBe('before-unsub')
})

it('8. size(unknownQueueUrl) returns 0', () => {
  const store = createQueueStore()
  expect(store.size(OTHER)).toBe(0)
})

it('9. receive returns records exposing .attributes as the message-attribute map', () => {
  const store = createQueueStore()
  store.ensureQueue(Q)
  const attrs = { Author: { DataType: 'String', StringValue: 'alice' } }
  store.send(Q, 'with-attrs', attrs)
  const [rec] = store.receive(Q, 1)
  expect(rec.attributes).toEqual(attrs)
  expect(rec.messageAttributes).toEqual(attrs)
})

// ===========================================================================
// Visibility-timeout state machine
// ===========================================================================

it('10. a received message is invisible to a second receive within the visibility window', () => {
  const clock = makeClock()
  const store = createQueueStore({ now: clock.now })
  store.ensureQueue(Q, { visibilityTimeout: 30 })
  store.send(Q, 'msg', {})

  const first = store.receive(Q, 10)
  expect(first).toHaveLength(1)

  // Still inside the 30s window → nothing returned.
  clock.tick(10_000)
  expect(store.receive(Q, 10)).toEqual([])
})

it('11. after sweeping past visibleAt the message becomes available again with receiveCount=2', () => {
  const clock = makeClock()
  const store = createQueueStore({ now: clock.now })
  store.ensureQueue(Q, { visibilityTimeout: 30 })
  store.send(Q, 'msg', {})

  const [r1] = store.receive(Q, 1)
  expect(r1.systemAttributes.ApproximateReceiveCount).toBe('1')

  // Advance past the visibility window and sweep.
  clock.tick(31_000)
  store.sweep()

  const [r2] = store.receive(Q, 1)
  expect(r2).toBeTruthy()
  expect(r2.systemAttributes.ApproximateReceiveCount).toBe('2')
})

it('12. changeMessageVisibility extends the window so the message is not swept back early', () => {
  const clock = makeClock()
  const store = createQueueStore({ now: clock.now })
  store.ensureQueue(Q, { visibilityTimeout: 10 })
  store.send(Q, 'msg', {})

  const [r] = store.receive(Q, 1)
  store.changeMessageVisibility(Q, r.receiptHandle, 60)

  // 30s in: original 10s window would have lapsed, the extended 60s has not.
  clock.tick(30_000)
  store.sweep()
  expect(store.receive(Q, 1)).toEqual([])
})

it('13. deleteMessage removes the inflight message permanently', () => {
  const clock = makeClock()
  const store = createQueueStore({ now: clock.now })
  store.ensureQueue(Q, { visibilityTimeout: 5 })
  store.send(Q, 'msg', {})

  const [r] = store.receive(Q, 1)
  store.deleteMessage(Q, r.receiptHandle)
  expect(store.size(Q)).toBe(0)

  // Even after the window lapses there is nothing to redeliver.
  clock.tick(10_000)
  store.sweep()
  expect(store.receive(Q, 1)).toEqual([])
})

it('14. deleteMessage with an unknown receipt handle is a no-op', () => {
  const store = createQueueStore()
  store.ensureQueue(Q)
  store.send(Q, 'msg', {})
  expect(() => store.deleteMessage(Q, 'bogus-handle')).not.toThrow()
  expect(store.size(Q)).toBe(1)
})

// ===========================================================================
// DelaySeconds
// ===========================================================================

it('15. delaySeconds hides a message until time advances past delayUntil', () => {
  const clock = makeClock()
  const store = createQueueStore({ now: clock.now })
  store.ensureQueue(Q)
  store.send(Q, { body: 'delayed', delaySeconds: 5 })

  expect(store.receive(Q, 1)).toEqual([])

  clock.tick(5_000)
  const [r] = store.receive(Q, 1)
  expect(r.body).toBe('delayed')
})

it('16. queue-level delaySeconds applies when no per-message delay is given', () => {
  const clock = makeClock()
  const store = createQueueStore({ now: clock.now })
  store.ensureQueue(Q, { delaySeconds: 3 })
  store.send(Q, 'queue-delayed', {})

  expect(store.receive(Q, 1)).toEqual([])
  clock.tick(3_000)
  expect(store.receive(Q, 1)).toHaveLength(1)
})

// ===========================================================================
// Redrive / dead-letter routing
// ===========================================================================

it('17. a message received maxReceiveCount times is routed to the DLQ on sweep', () => {
  const clock = makeClock()
  const store = createQueueStore({ now: clock.now })
  store.ensureQueue(DLQ)
  store.ensureQueue(Q, {
    visibilityTimeout: 1,
    redrive: { dlqUrl: DLQ, maxReceiveCount: 2 },
  })
  store.send(Q, 'poison', {})

  // Receive #1, lapse, sweep → back to available (receiveCount 1, below max).
  store.receive(Q, 1)
  clock.tick(2_000)
  store.sweep()
  expect(store.size(DLQ)).toBe(0)

  // Receive #2 (receiveCount now == max). AWS delivers at most maxReceiveCount
  // times, so the next reclaim dead-letters instead of redelivering.
  store.receive(Q, 1)
  clock.tick(2_000)
  const woken = store.sweep()

  expect(store.size(Q)).toBe(0)
  expect(store.size(DLQ)).toBe(1)
  expect(woken.has(DLQ)).toBe(true)

  // The DLQ message is a fresh available one carrying the original body.
  const [dead] = store.receive(DLQ, 1)
  expect(dead.body).toBe('poison')
})

// ---------------------------------------------------------------------------
// L1 — DLQ identity: the dead-lettered message keeps its original identity.
// ---------------------------------------------------------------------------

it('17b. dead-lettering preserves the original messageId and sentAt', () => {
  const clock = makeClock()
  const store = createQueueStore({ now: clock.now })
  store.ensureQueue(DLQ)
  store.ensureQueue(Q, {
    visibilityTimeout: 1,
    redrive: { dlqUrl: DLQ, maxReceiveCount: 1 },
  })
  const { messageId } = store.send(Q, 'poison', {})

  // Receive once (receiveCount == max 1); the next reclaim dead-letters it.
  store.receive(Q, 1)
  clock.tick(2_000)
  store.sweep()

  const [dead] = store.receive(DLQ, 1)
  expect(dead.messageId).toBe(messageId)
  // SentTimestamp on the DLQ copy is the source message's original sentAt.
  expect(dead.systemAttributes.SentTimestamp).toBe('1000000')
})

// ---------------------------------------------------------------------------
// M1 — lazy reclaim: receive reclaims expired-inflight messages inline.
// ---------------------------------------------------------------------------

it('17c. receive reclaims an expired-inflight message inline (no sweep needed)', () => {
  const clock = makeClock()
  const store = createQueueStore({ now: clock.now })
  store.ensureQueue(Q, { visibilityTimeout: 30 })
  store.send(Q, 'msg', {})

  const [r1] = store.receive(Q, 1)
  expect(r1.systemAttributes.ApproximateReceiveCount).toBe('1')

  // ChangeMessageVisibility → 0 makes the message immediately receivable.
  store.changeMessageVisibility(Q, r1.receiptHandle, 0)

  // No sweep: receive itself must reclaim and redeliver it.
  const [r2] = store.receive(Q, 1)
  expect(r2).toBeTruthy()
  expect(r2.body).toBe('msg')
  expect(r2.systemAttributes.ApproximateReceiveCount).toBe('2')
})

it('17d. inline reclaim applies the dead-letter gate before redelivering', () => {
  const clock = makeClock()
  const store = createQueueStore({ now: clock.now })
  store.ensureQueue(DLQ)
  store.ensureQueue(Q, {
    visibilityTimeout: 30,
    redrive: { dlqUrl: DLQ, maxReceiveCount: 1 },
  })
  store.send(Q, 'poison', {})

  const [r1] = store.receive(Q, 1)
  // receiveCount == max 1; expire the inflight window via ChangeMessageVisibility.
  store.changeMessageVisibility(Q, r1.receiptHandle, 0)

  // Inline reclaim on the next receive must dead-letter (no redelivery), so the
  // source queue yields nothing and the DLQ gains the message.
  expect(store.receive(Q, 1)).toEqual([])
  expect(store.size(Q)).toBe(0)
  expect(store.size(DLQ)).toBe(1)
})

it('17e. inline reclaim frees the FIFO group so the reclaimed message redelivers', () => {
  const clock = makeClock()
  const store = createQueueStore({ now: clock.now })
  store.ensureQueue(Q, { fifo: true, visibilityTimeout: 30 })
  store.send(Q, { body: 'g1-a', groupId: 'g1', dedupId: 'd1' })

  const [r1] = store.receive(Q, 1)
  store.changeMessageVisibility(Q, r1.receiptHandle, 0)

  const [r2] = store.receive(Q, 1)
  expect(r2).toBeTruthy()
  expect(r2.body).toBe('g1-a')
  expect(r2.systemAttributes.ApproximateReceiveCount).toBe('2')
})

it('18. sweep returns the set of queue urls that gained newly-available messages', () => {
  const clock = makeClock()
  const store = createQueueStore({ now: clock.now })
  store.ensureQueue(Q, { visibilityTimeout: 1 })
  store.send(Q, 'msg', {})
  store.receive(Q, 1)

  clock.tick(2_000)
  const woken = store.sweep()
  expect(woken.has(Q)).toBe(true)
})

// ===========================================================================
// Retention
// ===========================================================================

it('19. available messages older than messageRetentionPeriod are dropped on sweep', () => {
  const clock = makeClock()
  const store = createQueueStore({ now: clock.now })
  store.ensureQueue(Q, { messageRetentionPeriod: 60 })
  store.send(Q, 'stale', {})

  clock.tick(61_000)
  store.sweep()
  expect(store.size(Q)).toBe(0)
  expect(store.receive(Q, 1)).toEqual([])
})

// ===========================================================================
// FIFO
// ===========================================================================

it('20. FIFO preserves per-group order and delivers at most one in-flight per group', () => {
  const clock = makeClock()
  const store = createQueueStore({ now: clock.now })
  store.ensureQueue(Q, { fifo: true, visibilityTimeout: 30 })
  store.send(Q, { body: 'g1-a', groupId: 'g1', dedupId: 'd1' })
  store.send(Q, { body: 'g1-b', groupId: 'g1', dedupId: 'd2' })
  store.send(Q, { body: 'g2-a', groupId: 'g2', dedupId: 'd3' })

  // One receive can take the head of each distinct group, not two from g1.
  const batch = store.receive(Q, 10)
  const bodies = batch.map((m) => m.body).sort()
  expect(bodies).toEqual(['g1-a', 'g2-a'])

  // g1 is in-flight, so a second receive yields only nothing new for g1.
  expect(store.receive(Q, 10)).toEqual([])
})

it('21. FIFO releases the group after deleteMessage so the next message is delivered in order', () => {
  const store = createQueueStore()
  store.ensureQueue(Q, { fifo: true, visibilityTimeout: 30 })
  store.send(Q, { body: 'g1-a', groupId: 'g1', dedupId: 'd1' })
  store.send(Q, { body: 'g1-b', groupId: 'g1', dedupId: 'd2' })

  const [first] = store.receive(Q, 10)
  expect(first.body).toBe('g1-a')

  store.deleteMessage(Q, first.receiptHandle)

  const [second] = store.receive(Q, 10)
  expect(second.body).toBe('g1-b')
})

it('22. FIFO receive records carry MessageGroupId / SequenceNumber / DeduplicationId', () => {
  const store = createQueueStore()
  store.ensureQueue(Q, { fifo: true })
  const { sequenceNumber } = store.send(Q, {
    body: 'g1-a',
    groupId: 'g1',
    dedupId: 'd1',
  })
  expect(typeof sequenceNumber).toBe('string')

  const [r] = store.receive(Q, 1)
  expect(r.systemAttributes.MessageGroupId).toBe('g1')
  expect(r.systemAttributes.MessageDeduplicationId).toBe('d1')
  expect(r.systemAttributes.SequenceNumber).toBe(sequenceNumber)
})

// ===========================================================================
// Deduplication
// ===========================================================================

it('23. FIFO dedup within the 5-min window does NOT enqueue and returns the original id', () => {
  const clock = makeClock()
  const store = createQueueStore({ now: clock.now })
  store.ensureQueue(Q, { fifo: true })

  const first = store.send(Q, { body: 'dup', groupId: 'g1', dedupId: 'same' })
  const second = store.send(Q, { body: 'dup', groupId: 'g1', dedupId: 'same' })

  expect(second.messageId).toBe(first.messageId)
  expect(store.size(Q)).toBe(1)
})

it('24. FIFO content-based dedup uses the body hash when no dedupId is given', () => {
  const store = createQueueStore()
  store.ensureQueue(Q, { fifo: true, contentBasedDedup: true })
  const a = store.send(Q, { body: 'identical', groupId: 'g1' })
  const b = store.send(Q, { body: 'identical', groupId: 'g1' })
  expect(b.messageId).toBe(a.messageId)
  expect(store.size(Q)).toBe(1)
})

it('24b. dedup-suppressed send returns the original messageId even after the original was deleted', () => {
  const clock = makeClock()
  const store = createQueueStore({ now: clock.now })
  store.ensureQueue(Q, { fifo: true })

  const first = store.send(Q, { body: 'dup', groupId: 'g1', dedupId: 'same' })

  // Receive and delete the original so it no longer lives in the queue.
  const [r] = store.receive(Q, 1)
  store.deleteMessage(Q, r.receiptHandle)
  expect(store.size(Q)).toBe(0)

  // A duplicate within the window is still suppressed and echoes the ORIGINAL
  // messageId, even though the source message is gone.
  const second = store.send(Q, { body: 'dup', groupId: 'g1', dedupId: 'same' })
  expect(second.messageId).toBe(first.messageId)
  expect(store.size(Q)).toBe(0)
})

it('25. dedup entries expire after the 5-min window, allowing re-enqueue', () => {
  const clock = makeClock()
  const store = createQueueStore({ now: clock.now })
  store.ensureQueue(Q, { fifo: true })

  store.send(Q, { body: 'dup', groupId: 'g1', dedupId: 'same' })
  clock.tick(5 * 60 * 1000 + 1)
  store.send(Q, { body: 'dup', groupId: 'g1', dedupId: 'same' })
  expect(store.size(Q)).toBe(2)
})

// ===========================================================================
// purge / attributes / listings
// ===========================================================================

it('26. purgeQueue empties the queue including inflight messages', () => {
  const store = createQueueStore()
  store.ensureQueue(Q)
  store.send(Q, 'a', {})
  store.send(Q, 'b', {})
  store.receive(Q, 1)
  store.purgeQueue(Q)
  expect(store.size(Q)).toBe(0)
})

it('27. getQueueUrl resolves a queue by its name', () => {
  const store = createQueueStore()
  store.ensureQueue(Q)
  expect(store.getQueueUrl('MyQueue')).toBe(Q)
  expect(store.getQueueUrl('Nope')).toBeUndefined()
})

it('28. listQueues returns all urls, optionally filtered by prefix', () => {
  const store = createQueueStore()
  store.ensureQueue(Q)
  store.ensureQueue(OTHER)
  const all = store.listQueues()
  expect(all).toEqual(expect.arrayContaining([Q, OTHER]))

  const filtered = store.listQueues('http://localhost:4566/000000000000/My')
  expect(filtered).toEqual([Q])
})

it('29. deleteQueue removes the queue entirely', () => {
  const store = createQueueStore()
  store.ensureQueue(Q)
  store.deleteQueue(Q)
  expect(store.getQueueUrl('MyQueue')).toBeUndefined()
  expect(store.size(Q)).toBe(0)
})

it('30. getQueueAttributes reports counts and config-derived values', () => {
  const store = createQueueStore()
  store.ensureQueue(Q, {
    visibilityTimeout: 45,
    fifo: true,
    redrive: { dlqUrl: DLQ, maxReceiveCount: 3 },
  })
  store.send(Q, 'a', {})
  store.send(Q, 'b', {})
  store.receive(Q, 1)

  const attrs = store.getQueueAttributes(Q)
  expect(attrs.ApproximateNumberOfMessages).toBe('1')
  expect(attrs.ApproximateNumberOfMessagesNotVisible).toBe('1')
  expect(attrs.VisibilityTimeout).toBe('45')
  expect(attrs.FifoQueue).toBe('true')
  expect(JSON.parse(attrs.RedrivePolicy).maxReceiveCount).toBe(3)
})

it('30b. getQueueAttributes counts delayed messages separately from not-visible', () => {
  const clock = makeClock()
  const store = createQueueStore({ now: clock.now })
  store.ensureQueue(Q)
  // One immediately-available, one still inside its delay window.
  store.send(Q, 'ready', {})
  store.send(Q, { body: 'delayed', delaySeconds: 10 })

  const attrs = store.getQueueAttributes(Q)
  expect(attrs.ApproximateNumberOfMessages).toBe('1')
  expect(attrs.ApproximateNumberOfMessagesDelayed).toBe('1')
  // The delayed message must NOT be counted as not-visible.
  expect(attrs.ApproximateNumberOfMessagesNotVisible).toBe('0')

  // Once the delay lapses it becomes available and is no longer delayed.
  clock.tick(10_000)
  const after = store.getQueueAttributes(Q)
  expect(after.ApproximateNumberOfMessages).toBe('2')
  expect(after.ApproximateNumberOfMessagesDelayed).toBe('0')
})

it('31. setQueueAttributes mutates the live queue config', () => {
  const store = createQueueStore()
  store.ensureQueue(Q, { visibilityTimeout: 30 })
  store.setQueueAttributes(Q, { visibilityTimeout: 90 })
  expect(store.getQueueAttributes(Q).VisibilityTimeout).toBe('90')
})

it('32. ensureQueue is idempotent and does not reset config on re-ensure', () => {
  const store = createQueueStore()
  store.ensureQueue(Q, { visibilityTimeout: 30 })
  store.send(Q, 'a', {})
  store.ensureQueue(Q, { visibilityTimeout: 99 })
  // Existing messages survive; first config wins (idempotent create).
  expect(store.size(Q)).toBe(1)
  expect(store.getQueueAttributes(Q).VisibilityTimeout).toBe('30')
})

it('33. getConfig returns the normalised live config; undefined for an unknown queue', () => {
  const store = createQueueStore()
  store.ensureQueue(Q, {
    visibilityTimeout: 45,
    redrive: { dlqUrl: DLQ, maxReceiveCount: 3 },
  })

  const config = store.getConfig(Q)
  expect(config.visibilityTimeout).toBe(45)
  // Normalised defaults are filled in for omitted fields.
  expect(config.delaySeconds).toBe(0)
  expect(config.redrive).toEqual({ dlqUrl: DLQ, maxReceiveCount: 3 })

  expect(store.getConfig(OTHER)).toBeUndefined()
})
