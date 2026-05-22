import { createQueueStore } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/sqs/queue-store.js'

const Q = 'http://localhost:4566/000000000000/MyQueue'
const OTHER = 'http://localhost:4566/000000000000/OtherQueue'

// ---------------------------------------------------------------------------
// 1. ensureQueue is idempotent
// ---------------------------------------------------------------------------

it('1. ensureQueue is idempotent', () => {
  const store = createQueueStore()
  store.ensureQueue(Q)
  store.ensureQueue(Q)
  expect(store.size(Q)).toBe(0)
})

// ---------------------------------------------------------------------------
// 2. send returns { messageId } with a non-empty string ID
// ---------------------------------------------------------------------------

it('2. send returns a { messageId } with a non-empty string ID', () => {
  const store = createQueueStore()
  store.ensureQueue(Q)
  const result = store.send(Q, 'hello', {})
  expect(result).toHaveProperty('messageId')
  expect(typeof result.messageId).toBe('string')
  expect(result.messageId.length).toBeGreaterThan(0)
})

// ---------------------------------------------------------------------------
// 3. receive returns up to n previously-sent messages in FIFO order
// ---------------------------------------------------------------------------

it('3. receive returns up to n messages in FIFO order', () => {
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

// ---------------------------------------------------------------------------
// 4. receive removes the messages from the queue
// ---------------------------------------------------------------------------

it('4. receive removes the messages (subsequent size reflects)', () => {
  const store = createQueueStore()
  store.ensureQueue(Q)
  store.send(Q, 'a', {})
  store.send(Q, 'b', {})
  store.send(Q, 'c', {})

  store.receive(Q, 2)
  expect(store.size(Q)).toBe(1)
})

// ---------------------------------------------------------------------------
// 5. receive returns [] when the queue is empty
// ---------------------------------------------------------------------------

it('5. receive returns [] when the queue is empty', () => {
  const store = createQueueStore()
  store.ensureQueue(Q)
  expect(store.receive(Q, 5)).toEqual([])
})

// ---------------------------------------------------------------------------
// 6. subscribe callback fires synchronously on send
// ---------------------------------------------------------------------------

it('6. subscribe callback fires synchronously on send', () => {
  const store = createQueueStore()
  store.ensureQueue(Q)

  const calls = []
  store.subscribe(Q, (msg) => calls.push(msg))

  store.send(Q, 'sync-test', {})

  // If synchronous, the callback ran before this assertion.
  expect(calls).toHaveLength(1)
  expect(calls[0].body).toBe('sync-test')
})

// ---------------------------------------------------------------------------
// 7. unsubscribe() stops further callbacks
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 8. size(unknownQueueUrl) returns 0
// ---------------------------------------------------------------------------

it('8. size(unknownQueueUrl) returns 0', () => {
  const store = createQueueStore()
  expect(store.size(OTHER)).toBe(0)
})
