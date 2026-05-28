import { cleanupOrphanContainers } from '../../../../../../../../lib/plugins/aws/offline/lib/runners/docker-cleanup.js'

describe('cleanupOrphanContainers', () => {
  let logCalls
  beforeEach(() => {
    logCalls = { notice: [], warning: [], debug: [] }
  })
  const log = {
    notice(m) {
      logCalls.notice.push(m)
    },
    warning(m) {
      logCalls.warning.push(m)
    },
    debug(m) {
      logCalls.debug.push(m)
    },
    error() {},
  }

  function stubDockerClient({ orphans = [], removeError } = {}) {
    const removed = []
    return {
      removed,
      getDockerodeClient: () => ({
        listContainers: async ({ all, filters }) => {
          expect(all).toBe(true)
          expect(filters.name).toEqual([
            'serverless-offline-docker-',
            'serverless-offline-java-',
          ])
          return orphans
        },
        getContainer: (id) => ({
          remove: async ({ force }) => {
            expect(force).toBe(true)
            if (removeError) throw removeError
            removed.push(id)
          },
        }),
      }),
    }
  }

  it('does nothing when no orphans exist', async () => {
    const client = stubDockerClient({ orphans: [] })
    await cleanupOrphanContainers({ dockerClient: client, log })
    expect(client.removed).toEqual([])
  })

  it('removes each orphan container (force) and logs a notice', async () => {
    const client = stubDockerClient({
      orphans: [
        { Id: 'abc', Names: ['/serverless-offline-docker-hello-uuid1'] },
        { Id: 'def', Names: ['/serverless-offline-java-world-uuid2'] },
      ],
    })
    await cleanupOrphanContainers({ dockerClient: client, log })
    expect(client.removed).toEqual(['abc', 'def'])
    expect(logCalls.notice.length).toBeGreaterThanOrEqual(1)
  })

  it('per-container removal failure logs a warning, continues with the rest', async () => {
    const client = stubDockerClient({
      orphans: [
        { Id: 'abc', Names: ['/serverless-offline-docker-hello-uuid1'] },
      ],
      removeError: new Error('container in use'),
    })
    await expect(
      cleanupOrphanContainers({ dockerClient: client, log }),
    ).resolves.toBeUndefined()
    expect(logCalls.warning.length).toBe(1)
  })

  it('listContainers failure logs a warning and returns without throwing', async () => {
    const client = {
      getDockerodeClient: () => ({
        listContainers: async () => {
          throw new Error('docker daemon glitch')
        },
        getContainer: () => {
          throw new Error('should not be called')
        },
      }),
    }
    await expect(
      cleanupOrphanContainers({ dockerClient: client, log }),
    ).resolves.toBeUndefined()
    expect(logCalls.warning.length).toBe(1)
  })
})
