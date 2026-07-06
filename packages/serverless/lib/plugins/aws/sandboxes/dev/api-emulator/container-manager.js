'use strict'

import crypto from 'crypto'

// A removal error we can safely ignore: the container is already gone.
function isContainerNotFound(err) {
  return (
    err?.statusCode === 404 ||
    /no such container|not found/i.test(err?.message || '')
  )
}

export class ContainerManager {
  constructor({
    docker,
    imageUri,
    serviceName,
    sandboxName,
    env = {},
    ports = [8080, 9000],
    idFactory,
  }) {
    this.docker = docker
    this.imageUri = imageUri
    this.serviceName = serviceName
    this.sandboxName = sandboxName
    this.env = env
    this.ports = ports
    this._idFactory = idFactory || (() => crypto.randomUUID().slice(0, 8))
  }

  async run() {
    const containerName = `sls-sandbox-dev-${this.serviceName}-${this.sandboxName}-${this._idFactory()}`
    const exposedPorts = {}
    const portBindings = {}
    for (const p of this.ports) {
      exposedPorts[`${p}/tcp`] = {}
      portBindings[`${p}/tcp`] = [{ HostPort: '' }] // '' => Docker assigns a free host port
    }
    const container = await this.docker.createContainer({
      imageUri: this.imageUri,
      name: containerName,
      exposedPorts,
      env: this.env,
      labels: {
        'com.serverless.sandboxes.dev-mode': 'true',
        'com.serverless.sandboxes.name': this.sandboxName,
      },
      hostConfig: { PortBindings: portBindings },
    })
    const docker = this.docker
    let portMap
    try {
      await container.start()
      const info = await container.inspect()
      portMap = {}
      for (const p of this.ports) {
        const binding = info.NetworkSettings?.Ports?.[`${p}/tcp`]?.[0]
        if (binding?.HostPort) portMap[p] = Number(binding.HostPort)
      }
    } catch (err) {
      // The container was created but failed to come up — don't leak it.
      await docker.removeContainer({ containerName }).catch(() => {})
      throw err
    }
    return {
      containerName,
      portMap,
      stop: async () => {
        // Surface real removal failures so the control plane can't believe a
        // termination succeeded while Docker kept the container running; only an
        // already-gone container is safe to ignore.
        try {
          await docker.removeContainer({ containerName })
        } catch (err) {
          if (!isContainerNotFound(err)) throw err
        }
      },
      // Suspend/resume analog: freeze/thaw the container's processes in place.
      pause: async () => {
        await container.pause()
      },
      unpause: async () => {
        await container.unpause()
      },
    }
  }
}
