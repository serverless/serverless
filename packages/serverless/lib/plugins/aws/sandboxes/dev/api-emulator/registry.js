'use strict'

import crypto from 'crypto'

// Fallback token lifetime when a request omits expirationInMinutes, so a token is
// never valid for the whole instance lifetime.
const DEFAULT_TOKEN_TTL_MINUTES = 60

export class EmulatorRegistry {
  constructor({
    sandboxName,
    minimumMemoryInMiB,
    imageArn,
    idFactory,
    now,
  } = {}) {
    this.sandboxName = sandboxName
    this.minimumMemoryInMiB = minimumMemoryInMiB
    this.imageArn = imageArn
    this._idFactory = idFactory || (() => `microvm-${crypto.randomUUID()}`)
    this._now = now || Date.now
    this._instances = new Map()
  }

  // Real API field names: imageArn, name, state, latestActiveImageVersion: "1.0".
  getImage(imageIdentifier) {
    return {
      imageArn: imageIdentifier || this.imageArn,
      name: this.sandboxName,
      state: 'CREATED',
      latestActiveImageVersion: '1.0',
    }
  }

  getImageVersion(imageIdentifier, imageVersion) {
    return {
      imageArn: imageIdentifier || this.imageArn,
      imageVersion: imageVersion || '1.0',
      resources: [{ minimumMemoryInMiB: this.minimumMemoryInMiB }],
      baseImageVersion: '0.0',
    }
  }

  createInstance({
    portMap,
    stopFn,
    pauseFn,
    unpauseFn,
    idlePolicy,
    maximumDurationInSeconds,
  }) {
    const microvmId = this._idFactory()
    const t = this._now()
    this._instances.set(microvmId, {
      microvmId,
      state: 'PENDING',
      portMap: portMap || {},
      stopFn: stopFn || (async () => {}),
      pauseFn: pauseFn || (async () => {}),
      unpauseFn: unpauseFn || (async () => {}),
      idlePolicy: idlePolicy || {},
      maximumDurationInSeconds: maximumDurationInSeconds || 0,
      endpoint: null,
      proxyServer: null,
      token: null,
      tokenExpiresAt: null,
      allowedPorts: null,
      startedAt: t,
      lastActivityAt: t,
      suspendedAt: null,
    })
    return microvmId
  }

  markRunning(microvmId, { endpoint, proxyServer }) {
    const inst = this._instances.get(microvmId)
    if (!inst) return
    inst.state = 'RUNNING'
    inst.endpoint = endpoint
    inst.proxyServer = proxyServer
    inst.lastActivityAt = this._now()
  }

  markSuspended(microvmId) {
    const inst = this._instances.get(microvmId)
    if (!inst || inst.state !== 'RUNNING') return
    inst.state = 'SUSPENDED'
    inst.suspendedAt = this._now()
  }

  markResumed(microvmId) {
    const inst = this._instances.get(microvmId)
    if (!inst || inst.state !== 'SUSPENDED') return
    inst.state = 'RUNNING'
    inst.suspendedAt = null
    inst.lastActivityAt = this._now()
  }

  getInstance(microvmId) {
    return this._instances.get(microvmId)
  }

  issueToken(microvmId, allowedPorts, expirationInMinutes) {
    const inst = this._instances.get(microvmId)
    if (!inst) return null
    inst.token = crypto.randomUUID()
    inst.allowedPorts = (
      allowedPorts && allowedPorts.length ? allowedPorts : [8080]
    ).map(Number)
    const minutes =
      Number(expirationInMinutes) > 0
        ? Number(expirationInMinutes)
        : DEFAULT_TOKEN_TTL_MINUTES
    inst.tokenExpiresAt = this._now() + minutes * 60_000
    return inst.token
  }

  validateToken(microvmId, token) {
    const inst = this._instances.get(microvmId)
    if (!inst || !inst.token || !token) return false
    if (inst.tokenExpiresAt && this._now() >= inst.tokenExpiresAt) return false
    return inst.token === token
  }

  isPortAllowed(microvmId, port) {
    const inst = this._instances.get(microvmId)
    if (!inst || !inst.allowedPorts) return false
    return inst.allowedPorts.includes(Number(port))
  }

  terminate(microvmId) {
    const inst = this._instances.get(microvmId)
    if (!inst) return undefined
    inst.state = 'TERMINATED'
    return inst
  }

  liveInstances() {
    return [...this._instances.values()].filter((i) => i.state !== 'TERMINATED')
  }

  _touch(inst) {
    inst.lastActivityAt = this._now()
  }

  // Pure read of timestamps vs each instance's idlePolicy at now().
  dueTransitions() {
    const now = this._now()
    const out = []
    for (const inst of this.liveInstances()) {
      const p = inst.idlePolicy || {}
      const maxIdleMs = (p.maxIdleDurationSeconds || 0) * 1000
      const suspendedMs = (p.suspendedDurationSeconds || 0) * 1000
      const maxDurMs = (inst.maximumDurationInSeconds || 0) * 1000
      if (maxDurMs > 0 && now - inst.startedAt >= maxDurMs) {
        // Max lifetime wins regardless of state.
        out.push({ microvmId: inst.microvmId, action: 'terminate' })
      } else if (
        inst.state === 'RUNNING' &&
        maxIdleMs > 0 &&
        now - inst.lastActivityAt >= maxIdleMs
      ) {
        // suspendedDurationSeconds <= 0 => no suspend window, terminate directly.
        out.push({
          microvmId: inst.microvmId,
          action: suspendedMs > 0 ? 'suspend' : 'terminate',
        })
      } else if (
        inst.state === 'SUSPENDED' &&
        now - inst.suspendedAt >= suspendedMs
      ) {
        out.push({ microvmId: inst.microvmId, action: 'terminate' })
      }
    }
    return out
  }

  // Decide what an incoming proxied request should do; mutates state for forward/resume.
  onRequest(microvmId) {
    const inst = this._instances.get(microvmId)
    if (!inst) return 'reject'
    if (inst.state === 'RUNNING' || inst.state === 'PENDING') {
      this._touch(inst)
      return 'forward'
    }
    if (inst.state === 'SUSPENDED') {
      if (inst.idlePolicy?.autoResumeEnabled) {
        this.markResumed(microvmId)
        return 'resume'
      }
      return 'reject'
    }
    return 'reject' // TERMINATED
  }
}
