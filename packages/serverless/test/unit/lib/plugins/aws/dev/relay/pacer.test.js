import {
  BYTES_PER_SECOND,
  BYTE_BURST,
  MAX_IN_FLIGHT,
  MESSAGES_PER_SECOND,
  createPacer,
} from '../../../../../../../lib/plugins/aws/dev/relay/pacer.js'
import { manualClock } from './manual-clock.js'

describe('the publish pacer', () => {
  test('stays under the AWS IoT Core per-connection limits', () => {
    expect(MESSAGES_PER_SECOND).toBe(45)
    expect(BYTES_PER_SECOND).toBe(819_200)
    expect(BYTE_BURST).toBe(262_144)
    expect(MAX_IN_FLIGHT).toBe(50)
  })

  test('sends a burst of 45 at once, then paces messages, control frames first', async () => {
    const clock = manualClock()
    const sent = []
    const pacer = createPacer({
      send: async (item) => sent.push([clock.now(), item.topic]),
      now: clock.now,
      timers: clock.timers,
    })
    const all = []
    for (let i = 0; i < 100; i++) {
      all.push(pacer.publish({ topic: `d${i}`, payload: Buffer.alloc(10) }))
    }
    await clock.settle()
    await clock.settle()
    expect(sent).toHaveLength(45)
    all.push(
      pacer.publish({
        topic: 'ctl',
        payload: Buffer.alloc(10),
        priority: 'control',
      }),
    )
    await clock.advance(30)
    expect(sent[45][1]).toBe('ctl')
    await clock.advance(2000)
    expect(sent).toHaveLength(101)
    expect(sent[100][0]).toBeGreaterThanOrEqual(1200)
    expect(sent[100][0]).toBeLessThanOrEqual(1300)
    expect(await Promise.all(all)).toEqual(all.map(() => true))
    expect(clock.live()).toBe(0)
  })

  test('paces bytes at about 800 KB/s', async () => {
    const clock = manualClock()
    const sent = []
    const pacer = createPacer({
      send: async () => sent.push(clock.now()),
      now: clock.now,
      timers: clock.timers,
    })
    for (let i = 0; i < 20; i++) {
      pacer.publish({ topic: 'big', payload: Buffer.alloc(100 * 1024) })
    }
    await clock.advance(5000)
    expect(sent).toHaveLength(20)
    expect(sent[19]).toBeGreaterThanOrEqual(2000)
    expect(sent[19]).toBeLessThanOrEqual(2600)
    expect(clock.live()).toBe(0)
  })

  test('drops what waited past its deadline instead of sending it', async () => {
    const clock = manualClock()
    const dropped = []
    const sent = []
    const pacer = createPacer({
      send: async (item) => sent.push(item.topic),
      now: clock.now,
      timers: clock.timers,
      onDrop: (item) => dropped.push(item.topic),
      messagesPerSecond: 1,
    })
    const first = pacer.publish({ topic: 'a', payload: Buffer.alloc(1) })
    const late = pacer.publish({
      topic: 'b',
      payload: Buffer.alloc(1),
      deadline: 500,
    })
    await clock.advance(2000)
    expect(await first).toBe(true)
    expect(await late).toBe(false)
    expect(dropped).toEqual(['b'])
    expect(sent).toEqual(['a'])
    expect(clock.live()).toBe(0)
  })

  test('an acceptance goes ahead of every control frame and stream data already waiting', async () => {
    const clock = manualClock()
    const sent = []
    const pacer = createPacer({
      send: async (item) => sent.push(item.topic),
      now: clock.now,
      timers: clock.timers,
    })
    for (let i = 0; i < 60; i++) {
      pacer.publish({
        topic: `refused${i}`,
        payload: Buffer.alloc(10),
        priority: 'control',
      })
      pacer.publish({ topic: `data${i}`, payload: Buffer.alloc(10) })
    }
    await clock.settle()
    const accepted = pacer.publish({
      topic: 'accepted',
      payload: Buffer.alloc(10),
      priority: 'acceptance',
      deadline: clock.now() + 1_500,
    })
    await clock.advance(30)
    expect(sent.indexOf('accepted')).toBe(45)
    expect(await accepted).toBe(true)
    await clock.advance(5_000)
    expect(sent.filter((topic) => topic.startsWith('refused'))).toHaveLength(60)
    expect(clock.live()).toBe(0)
  })

  test('a dropped publish says why it waited: for the message rate, for acknowledgements, or not at all', async () => {
    const clock = manualClock()
    const why = {}
    let release
    const acknowledged = new Promise((resolve) => {
      release = resolve
    })
    const byRate = createPacer({
      send: async () => {},
      now: clock.now,
      timers: clock.timers,
      messagesPerSecond: 1,
    })
    byRate.publish({ topic: 'a', payload: Buffer.alloc(1) })
    const rate = byRate.publish({
      topic: 'b',
      payload: Buffer.alloc(1),
      deadline: 500,
      onDropped: (reason) => (why.rate = reason),
    })
    const byLink = createPacer({
      send: () => acknowledged,
      now: clock.now,
      timers: clock.timers,
      maxInFlight: 1,
    })
    byLink.publish({ topic: 'a', payload: Buffer.alloc(1) })
    const link = byLink.publish({
      topic: 'b',
      payload: Buffer.alloc(1),
      deadline: 500,
      onDropped: (reason) => (why.link = reason),
    })
    const late = byLink.publish({
      topic: 'c',
      payload: Buffer.alloc(1),
      deadline: 0,
      onDropped: (reason) => (why.late = reason),
    })
    await clock.advance(1000)
    release()
    await clock.advance(1000)
    expect([await rate, await link, await late]).toEqual([false, false, false])
    expect(why).toEqual({ rate: 'rate', link: 'link', late: 'late' })
    expect(clock.live()).toBe(0)
  })

  test('keeps at most 50 publishes waiting for their acknowledgement', async () => {
    const clock = manualClock()
    let release
    const acknowledged = new Promise((resolve) => {
      release = resolve
    })
    let started = 0
    const pacer = createPacer({
      send: async () => {
        started += 1
        await acknowledged
      },
      now: clock.now,
      timers: clock.timers,
      messagesPerSecond: 1000,
    })
    const all = []
    for (let i = 0; i < 60; i++) {
      all.push(pacer.publish({ topic: 'x', payload: Buffer.alloc(1) }))
    }
    await clock.advance(100)
    expect(started).toBe(50)
    release()
    await clock.advance(100)
    expect(started).toBe(60)
    expect(await Promise.all(all)).toEqual(all.map(() => true))
    expect(clock.live()).toBe(0)
  })

  test('a failed publish rejects that message only; close resolves the rest false and stops the timer', async () => {
    const clock = manualClock()
    const sent = []
    const pacer = createPacer({
      send: async (item) => {
        sent.push(item.topic)
        if (item.topic === 'bad') throw new Error('refused')
      },
      now: clock.now,
      timers: clock.timers,
      messagesPerSecond: 1,
    })
    const bad = pacer.publish({ topic: 'bad', payload: Buffer.alloc(1) })
    const waiting = pacer.publish({ topic: 'later', payload: Buffer.alloc(1) })
    await expect(bad).rejects.toThrow('refused')
    expect(clock.live()).toBe(1)
    pacer.close()
    expect(await waiting).toBe(false)
    expect(clock.live()).toBe(0)
    expect(
      await pacer.publish({ topic: 'after', payload: Buffer.alloc(1) }),
    ).toBe(false)
    await clock.advance(5000)
    expect(sent).toEqual(['bad'])
    expect(clock.live()).toBe(0)
  })
})
