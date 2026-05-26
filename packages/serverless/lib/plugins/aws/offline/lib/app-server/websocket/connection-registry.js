/**
 * In-memory bidirectional registry of open WebSocket connections.
 *
 * Keys: `connectionId` (string) and the `ws` instance (object identity).
 * Both Maps mutate together — encapsulated here so callers can't drift.
 * The registry survives only for the lifetime of the offline process; no
 * persistence (D-M4b-5).
 *
 * Record shape:
 *   { connectionId, ws, sourceIp, userAgent, connectedAt, lastActiveAt }
 *
 * `connectedAt` is set on `add`; `lastActiveAt` starts equal to
 * `connectedAt` and is bumped by `touch(connectionId)` whenever the server
 * sees activity on that connection (incoming message OR outgoing post).
 */

export function createConnectionRegistry() {
  /** @type {Map<string, object>} */
  const byId = new Map()
  /** @type {Map<object, string>} */
  const byWs = new Map()

  return {
    add({ connectionId, ws, sourceIp, userAgent }) {
      const now = Date.now()
      const record = {
        connectionId,
        ws,
        sourceIp,
        userAgent,
        connectedAt: now,
        lastActiveAt: now,
      }
      byId.set(connectionId, record)
      byWs.set(ws, connectionId)
      return record
    },

    get(connectionId) {
      return byId.get(connectionId)
    },

    getByWs(ws) {
      const id = byWs.get(ws)
      return id === undefined ? undefined : byId.get(id)
    },

    remove(connectionId) {
      const record = byId.get(connectionId)
      if (!record) return
      byId.delete(connectionId)
      byWs.delete(record.ws)
    },

    all() {
      return byId.values()
    },

    touch(connectionId) {
      const record = byId.get(connectionId)
      if (record) record.lastActiveAt = Date.now()
    },
  }
}
