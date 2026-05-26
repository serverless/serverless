import { jest } from '@jest/globals'
import { normalizeWebsocketEvents } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/websocket/lifecycle-routes.js'

function makeServerless(functions = {}) {
  return { service: { functions } }
}

describe('normalizeWebsocketEvents', () => {
  it('returns an empty Map when no functions declare websocket events', () => {
    const result = normalizeWebsocketEvents(makeServerless())
    expect(result.size).toBe(0)
  })

  it('walks events[].websocket as a short-form string', () => {
    const result = normalizeWebsocketEvents(
      makeServerless({
        onConnect: { events: [{ websocket: '$connect' }] },
      }),
    )
    expect(result.get('$connect')).toEqual({ functionKey: 'onConnect' })
  })

  it('walks events[].websocket as an object with route', () => {
    const result = normalizeWebsocketEvents(
      makeServerless({
        onConnect: { events: [{ websocket: { route: '$connect' } }] },
      }),
    )
    expect(result.get('$connect')).toEqual({ functionKey: 'onConnect' })
  })

  it('captures custom-action routes', () => {
    const result = normalizeWebsocketEvents(
      makeServerless({
        broadcast: { events: [{ websocket: { route: 'broadcast' } }] },
      }),
    )
    expect(result.get('broadcast')).toEqual({ functionKey: 'broadcast' })
  })

  it('captures authorizer reference (string)', () => {
    const result = normalizeWebsocketEvents(
      makeServerless({
        onConnect: {
          events: [
            {
              websocket: {
                route: '$connect',
                authorizer: 'authFn',
              },
            },
          ],
        },
      }),
    )
    expect(result.get('$connect')).toEqual({
      functionKey: 'onConnect',
      authorizer: { name: 'authFn' },
    })
  })

  it('captures authorizer reference (object with name)', () => {
    const result = normalizeWebsocketEvents(
      makeServerless({
        onConnect: {
          events: [
            {
              websocket: {
                route: '$connect',
                authorizer: {
                  name: 'authFn',
                  identitySource: '$request.header.Authorization',
                },
              },
            },
          ],
        },
      }),
    )
    expect(result.get('$connect').authorizer).toEqual({
      name: 'authFn',
      identitySource: '$request.header.Authorization',
    })
  })

  it('warns and skips duplicate route declarations (first-wins)', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const result = normalizeWebsocketEvents(
        makeServerless({
          first: { events: [{ websocket: '$connect' }] },
          second: { events: [{ websocket: '$connect' }] },
        }),
      )
      expect(result.get('$connect').functionKey).toBe('first')
      expect(warnSpy).toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('ignores non-websocket events', () => {
    const result = normalizeWebsocketEvents(
      makeServerless({
        mixed: {
          events: [
            { http: 'GET /api' },
            { websocket: '$connect' },
            { httpApi: { method: 'GET', path: '/v2' } },
          ],
        },
      }),
    )
    expect(result.size).toBe(1)
    expect(result.get('$connect').functionKey).toBe('mixed')
  })

  it('ignores malformed websocket entries (no route)', () => {
    const result = normalizeWebsocketEvents(
      makeServerless({
        bad: { events: [{ websocket: { foo: 'bar' } }] },
      }),
    )
    expect(result.size).toBe(0)
  })

  it('ignores websocket entries with non-string route', () => {
    const result = normalizeWebsocketEvents(
      makeServerless({
        bad: { events: [{ websocket: { route: 42 } }] },
      }),
    )
    expect(result.size).toBe(0)
  })
})
