import { createConnectionRegistry } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/websocket/connection-registry.js'

function makeWs() {
  // Minimal ws-shape stub: just an object identity is enough for the
  // registry's bidirectional Map.
  return { id: Math.random() }
}

describe('createConnectionRegistry', () => {
  it('add returns the connection record', () => {
    const registry = createConnectionRegistry()
    const ws = makeWs()
    const record = registry.add({
      connectionId: 'c-1',
      ws,
      sourceIp: '127.0.0.1',
      userAgent: 'wscat/1.0',
    })
    expect(record.connectionId).toBe('c-1')
    expect(record.ws).toBe(ws)
    expect(record.sourceIp).toBe('127.0.0.1')
    expect(record.userAgent).toBe('wscat/1.0')
    expect(typeof record.connectedAt).toBe('number')
    expect(record.lastActiveAt).toBe(record.connectedAt)
  })

  it('get by connectionId returns the record', () => {
    const registry = createConnectionRegistry()
    registry.add({
      connectionId: 'c-1',
      ws: makeWs(),
      sourceIp: '1.1.1.1',
      userAgent: 'x',
    })
    expect(registry.get('c-1').connectionId).toBe('c-1')
  })

  it('get returns undefined for unknown connectionId', () => {
    const registry = createConnectionRegistry()
    expect(registry.get('missing')).toBeUndefined()
  })

  it('getByWs returns the record by ws instance', () => {
    const registry = createConnectionRegistry()
    const ws = makeWs()
    registry.add({
      connectionId: 'c-1',
      ws,
      sourceIp: '1.1.1.1',
      userAgent: 'x',
    })
    expect(registry.getByWs(ws).connectionId).toBe('c-1')
  })

  it('remove(connectionId) deletes both forward + reverse mappings', () => {
    const registry = createConnectionRegistry()
    const ws = makeWs()
    registry.add({
      connectionId: 'c-1',
      ws,
      sourceIp: '1.1.1.1',
      userAgent: 'x',
    })
    registry.remove('c-1')
    expect(registry.get('c-1')).toBeUndefined()
    expect(registry.getByWs(ws)).toBeUndefined()
  })

  it('remove is a no-op for unknown connectionId', () => {
    const registry = createConnectionRegistry()
    expect(() => registry.remove('missing')).not.toThrow()
  })

  it('all returns an iterator over current records', () => {
    const registry = createConnectionRegistry()
    registry.add({
      connectionId: 'a',
      ws: makeWs(),
      sourceIp: '',
      userAgent: '',
    })
    registry.add({
      connectionId: 'b',
      ws: makeWs(),
      sourceIp: '',
      userAgent: '',
    })
    const ids = Array.from(registry.all()).map((r) => r.connectionId)
    expect(ids.sort()).toEqual(['a', 'b'])
  })

  it('touch(connectionId) updates lastActiveAt', async () => {
    const registry = createConnectionRegistry()
    const ws = makeWs()
    const record = registry.add({
      connectionId: 'c-1',
      ws,
      sourceIp: '',
      userAgent: '',
    })
    const t0 = record.lastActiveAt
    await new Promise((r) => setTimeout(r, 5))
    registry.touch('c-1')
    expect(record.lastActiveAt).toBeGreaterThan(t0)
  })
})
