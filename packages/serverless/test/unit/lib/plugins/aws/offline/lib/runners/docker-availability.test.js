import { assertDockerAvailable } from '../../../../../../../../lib/plugins/aws/offline/lib/runners/docker-availability.js'

function makeDockerClient(pingImpl) {
  return {
    getDockerodeClient: () => ({
      ping: pingImpl,
    }),
  }
}

describe('assertDockerAvailable', () => {
  it('resolves when ping() succeeds', async () => {
    const dockerClient = makeDockerClient(async () => 'OK')
    await expect(
      assertDockerAvailable({ dockerClient }),
    ).resolves.toBeUndefined()
  })

  it('throws OFFLINE_DOCKER_DAEMON_NOT_RUNNING on ECONNREFUSED', async () => {
    const err = Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNREFUSED',
    })
    const dockerClient = makeDockerClient(async () => {
      throw err
    })
    await expect(assertDockerAvailable({ dockerClient })).rejects.toMatchObject(
      { code: 'OFFLINE_DOCKER_DAEMON_NOT_RUNNING' },
    )
    await expect(assertDockerAvailable({ dockerClient })).rejects.toThrow(
      /ECONNREFUSED|connect ECONNREFUSED/i,
    )
  })

  it('throws OFFLINE_DOCKER_BINARY_MISSING on ENOENT', async () => {
    const err = Object.assign(new Error('socket not found'), { code: 'ENOENT' })
    const dockerClient = makeDockerClient(async () => {
      throw err
    })
    await expect(assertDockerAvailable({ dockerClient })).rejects.toMatchObject(
      { code: 'OFFLINE_DOCKER_BINARY_MISSING' },
    )
  })

  it('error message names a concrete next step', async () => {
    const err = Object.assign(new Error('boom'), { code: 'ECONNREFUSED' })
    const dockerClient = makeDockerClient(async () => {
      throw err
    })
    await expect(assertDockerAvailable({ dockerClient })).rejects.toThrow(
      /start docker|docker daemon/i,
    )
  })

  it('wraps unknown errors as OFFLINE_DOCKER_DAEMON_NOT_RUNNING', async () => {
    const dockerClient = makeDockerClient(async () => {
      throw new Error('something weird happened')
    })
    await expect(assertDockerAvailable({ dockerClient })).rejects.toMatchObject(
      { code: 'OFFLINE_DOCKER_DAEMON_NOT_RUNNING' },
    )
    await expect(assertDockerAvailable({ dockerClient })).rejects.toThrow(
      /something weird happened/,
    )
  })
})
