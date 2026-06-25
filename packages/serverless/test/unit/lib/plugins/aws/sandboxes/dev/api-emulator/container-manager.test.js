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
  // exposed + bound both requested ports with auto host port
  expect(
    docker.started[0].hostConfig.PortBindings['8080/tcp'][0].HostPort,
  ).toBe('')
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
