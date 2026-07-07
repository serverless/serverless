import { ContainerManager } from '../../../../../../../../lib/plugins/aws/sandboxes/dev/api-emulator/container-manager.js'

function fakeDocker() {
  const started = []
  const removed = []
  const calls = { pause: 0, unpause: 0 }
  return {
    started,
    removed,
    calls,
    createContainer: async (opts) => {
      started.push(opts)
      return {
        start: async () => {},
        pause: async () => {
          calls.pause++
        },
        unpause: async () => {
          calls.unpause++
        },
        inspect: async () => ({
          NetworkSettings: {
            Ports: {
              '8080/tcp': [{ HostIp: '0.0.0.0', HostPort: '50080' }],
              '9000/tcp': [{ HostIp: '0.0.0.0', HostPort: '50090' }],
            },
          },
        }),
      }
    },
    removeContainer: async ({ containerName }) => removed.push(containerName),
  }
}

test('run() starts a uniquely-named container and returns the host port map', async () => {
  const docker = fakeDocker()
  const cm = new ContainerManager({
    docker,
    imageUri: 'img:latest',
    serviceName: 'svc',
    sandboxName: 'echo',
    env: { GREETING: 'hi' },
    idFactory: () => 'abc123',
  })
  const inst = await cm.run()
  expect(inst.containerName).toBe('sls-sandbox-dev-svc-echo-abc123')
  expect(inst.portMap).toEqual({ 8080: 50080, 9000: 50090 })
  // exposed + bound both requested ports with auto host port, loopback-only
  for (const p of ['8080/tcp', '9000/tcp']) {
    const binding = docker.started[0].hostConfig.PortBindings[p][0]
    expect(binding.HostPort).toBe('')
    // HostIp must pin to loopback — a 0.0.0.0 bind would expose the dev
    // container (running with assumed-role creds) to the whole network.
    expect(binding.HostIp).toBe('127.0.0.1')
  }
  expect(docker.started[0].env.GREETING).toBe('hi')
})

test('stop() removes the container by name', async () => {
  const docker = fakeDocker()
  const cm = new ContainerManager({
    docker,
    imageUri: 'i',
    serviceName: 's',
    sandboxName: 'e',
    idFactory: () => 'x',
  })
  const inst = await cm.run()
  await inst.stop()
  expect(docker.removed).toContain('sls-sandbox-dev-s-e-x')
})

// A docker double whose container/remove behaviour is configurable per test.
function dockerWith({ start, inspect, removeContainer } = {}) {
  const removed = []
  return {
    removed,
    createContainer: async () => ({
      start: start || (async () => {}),
      inspect: inspect || (async () => ({ NetworkSettings: { Ports: {} } })),
      pause: async () => {},
      unpause: async () => {},
    }),
    removeContainer:
      removeContainer ||
      (async ({ containerName }) => {
        removed.push(containerName)
      }),
  }
}

test('run() removes the partially-created container and rethrows when start fails', async () => {
  const docker = dockerWith({
    start: async () => {
      throw new Error('start boom')
    },
  })
  const cm = new ContainerManager({
    docker,
    imageUri: 'i',
    serviceName: 's',
    sandboxName: 'e',
    idFactory: () => 'x',
  })
  await expect(cm.run()).rejects.toThrow('start boom')
  expect(docker.removed).toContain('sls-sandbox-dev-s-e-x')
})

test('run() removes the partially-created container and rethrows when inspect fails', async () => {
  const docker = dockerWith({
    inspect: async () => {
      throw new Error('inspect boom')
    },
  })
  const cm = new ContainerManager({
    docker,
    imageUri: 'i',
    serviceName: 's',
    sandboxName: 'e',
    idFactory: () => 'x',
  })
  await expect(cm.run()).rejects.toThrow('inspect boom')
  expect(docker.removed).toContain('sls-sandbox-dev-s-e-x')
})

test('stop() ignores a "no such container" removal error (already gone)', async () => {
  const docker = dockerWith({
    removeContainer: async () => {
      throw Object.assign(new Error('No such container'), { statusCode: 404 })
    },
  })
  const cm = new ContainerManager({
    docker,
    imageUri: 'i',
    serviceName: 's',
    sandboxName: 'e',
    idFactory: () => 'x',
  })
  const inst = await cm.run()
  await expect(inst.stop()).resolves.toBeUndefined()
})

test('stop() propagates an unexpected removal error (termination is not falsely reported)', async () => {
  const docker = dockerWith({
    removeContainer: async () => {
      throw new Error('docker daemon unreachable')
    },
  })
  const cm = new ContainerManager({
    docker,
    imageUri: 'i',
    serviceName: 's',
    sandboxName: 'e',
    idFactory: () => 'x',
  })
  const inst = await cm.run()
  await expect(inst.stop()).rejects.toThrow('docker daemon unreachable')
})

test('pause()/unpause() map to the container freeze/thaw (suspend analog)', async () => {
  const docker = fakeDocker()
  const cm = new ContainerManager({
    docker,
    imageUri: 'i',
    serviceName: 's',
    sandboxName: 'e',
    idFactory: () => 'x',
  })
  const inst = await cm.run()
  await inst.pause()
  await inst.unpause()
  expect(docker.calls).toEqual({ pause: 1, unpause: 1 })
})
