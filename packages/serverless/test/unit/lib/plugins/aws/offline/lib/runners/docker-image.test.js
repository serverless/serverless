import { createImageReadinessChecker } from '../../../../../../../../lib/plugins/aws/offline/lib/runners/docker-image.js'

describe('ensureImageReady (via createImageReadinessChecker)', () => {
  let logCalls

  beforeEach(() => {
    logCalls = []
  })

  const noticeLog = {
    notice(msg) {
      logCalls.push(msg)
    },
    warning() {},
    error() {},
    debug() {},
  }

  function stubDockerClient({
    imagePresent,
    pullEvents = [],
    pullError,
    inspectArchitecture = 'amd64',
  }) {
    const pullCalls = []
    const inspectError = imagePresent
      ? null
      : Object.assign(new Error('not found'), { statusCode: 404 })

    return {
      pullCalls,
      getDockerodeClient: () => ({
        getImage: (image) => ({
          inspect: async () => {
            if (inspectError) throw inspectError
            return {
              Id: 'sha256:abc',
              RepoTags: [image],
              Architecture: inspectArchitecture,
            }
          },
        }),
        pull: (image, opts, cb) => {
          if (typeof opts === 'function') {
            cb = opts
            opts = undefined
          }
          pullCalls.push({ image, opts })
          if (pullError) {
            return cb(pullError)
          }
          // Synthesize a "stream" — dockerode's followProgress just calls
          // back with parsed events.
          cb(null, {
            __synthetic: true,
            events: pullEvents,
          })
        },
        modem: {
          followProgress(stream, onFinished, onProgress) {
            for (const evt of stream.events) onProgress(evt)
            onFinished(null, stream.events)
          },
        },
      }),
    }
  }

  it('returns immediately if the image is already present (no pull)', async () => {
    const { ensureImageReady } = createImageReadinessChecker()
    const dockerClient = stubDockerClient({ imagePresent: true })
    await ensureImageReady({
      dockerClient,
      image: 'public.ecr.aws/lambda/java:21',
      log: noticeLog,
    })
    expect(logCalls.find((m) => m.includes('Pulling'))).toBeUndefined()
  })

  it('pulls when image is absent, logs progress, resolves on completion', async () => {
    const { ensureImageReady } = createImageReadinessChecker()
    const dockerClient = stubDockerClient({
      imagePresent: false,
      pullEvents: [
        { status: 'Pulling from lambda/java', id: '21' },
        {
          status: 'Downloading',
          id: 'layer-1',
          progressDetail: { current: 50, total: 100 },
        },
        { status: 'Pull complete', id: 'layer-1' },
        { status: 'Status: Downloaded newer image' },
      ],
    })
    await ensureImageReady({
      dockerClient,
      image: 'public.ecr.aws/lambda/java:21',
      log: noticeLog,
    })
    // At least one "Pulling" notice was logged.
    expect(
      logCalls.some(
        (m) =>
          m.includes('Pulling') || m.includes('public.ecr.aws/lambda/java:21'),
      ),
    ).toBe(true)
  })

  it('passes platform to Docker pull and caches per image plus platform', async () => {
    const { ensureImageReady } = createImageReadinessChecker()
    const dockerClient = stubDockerClient({
      imagePresent: false,
      pullEvents: [{ status: 'pulled' }],
    })
    const image = 'public.ecr.aws/lambda/nodejs:20'

    await ensureImageReady({
      dockerClient,
      image,
      platform: 'linux/amd64',
      log: noticeLog,
    })
    await ensureImageReady({
      dockerClient,
      image,
      platform: 'linux/amd64',
      log: noticeLog,
    })
    await ensureImageReady({
      dockerClient,
      image,
      platform: 'linux/arm64',
      log: noticeLog,
    })

    expect(dockerClient.pullCalls).toEqual([
      { image, opts: { platform: 'linux/amd64' } },
      { image, opts: { platform: 'linux/arm64' } },
    ])
  })

  it('pulls when the local tag exists for a different platform', async () => {
    const { ensureImageReady } = createImageReadinessChecker()
    const dockerClient = stubDockerClient({
      imagePresent: true,
      inspectArchitecture: 'amd64',
      pullEvents: [{ status: 'pulled' }],
    })

    await ensureImageReady({
      dockerClient,
      image: 'public.ecr.aws/lambda/nodejs:20',
      platform: 'linux/arm64',
      log: noticeLog,
    })

    expect(dockerClient.pullCalls).toEqual([
      {
        image: 'public.ecr.aws/lambda/nodejs:20',
        opts: { platform: 'linux/arm64' },
      },
    ])
  })

  it('forwards per-layer pull events to log.debug', async () => {
    const debugMessages = []
    const debugLog = {
      notice() {},
      warning() {},
      error() {},
      debug(msg) {
        debugMessages.push(msg)
      },
    }
    const { ensureImageReady } = createImageReadinessChecker()
    const dockerClient = stubDockerClient({
      imagePresent: false,
      pullEvents: [
        { status: 'Pulling from lambda/java', id: '21' },
        {
          status: 'Downloading',
          id: 'layer-abc',
          progressDetail: { current: 1024, total: 4096 },
        },
        { status: 'Pull complete', id: 'layer-abc' },
      ],
    })
    await ensureImageReady({
      dockerClient,
      image: 'public.ecr.aws/lambda/java:21',
      log: debugLog,
    })
    // One debug line per pull event, with image + status visible.
    expect(debugMessages.length).toBe(3)
    expect(debugMessages[0]).toContain('public.ecr.aws/lambda/java:21')
    expect(debugMessages[0]).toContain('Pulling from lambda/java')
    expect(debugMessages[1]).toContain('Downloading')
    expect(debugMessages[1]).toContain('1024/4096')
    expect(debugMessages[2]).toContain('Pull complete')
  })

  it('throws OFFLINE_DOCKER_IMAGE_PULL_FAILED on pull error', async () => {
    const { ensureImageReady } = createImageReadinessChecker()
    const dockerClient = stubDockerClient({
      imagePresent: false,
      pullError: new Error('manifest not found'),
    })
    await expect(
      ensureImageReady({
        dockerClient,
        image: 'public.ecr.aws/lambda/java:bogus',
        log: noticeLog,
      }),
    ).rejects.toMatchObject({ code: 'OFFLINE_DOCKER_IMAGE_PULL_FAILED' })
  })

  it('shares a pull-in-progress across concurrent callers for the same image', async () => {
    const { ensureImageReady } = createImageReadinessChecker()
    let inspectCallCount = 0
    let pullCallCount = 0
    const dockerClient = {
      getDockerodeClient: () => ({
        getImage: () => ({
          inspect: async () => {
            inspectCallCount++
            const err = Object.assign(new Error('not found'), {
              statusCode: 404,
            })
            throw err
          },
        }),
        pull: (image, cb) => {
          pullCallCount++
          // Resolve on next tick so concurrent callers can pile in.
          setImmediate(() =>
            cb(null, { __synthetic: true, events: [{ status: 'pulled' }] }),
          )
        },
        modem: {
          followProgress(stream, onFinished, onProgress) {
            for (const evt of stream.events) onProgress(evt)
            onFinished(null, stream.events)
          },
        },
      }),
    }
    const image = 'public.ecr.aws/lambda/java:21'
    await Promise.all([
      ensureImageReady({ dockerClient, image, log: noticeLog }),
      ensureImageReady({ dockerClient, image, log: noticeLog }),
      ensureImageReady({ dockerClient, image, log: noticeLog }),
    ])
    expect(pullCallCount).toBe(1)
  })

  it('a fresh checker instance does NOT share state across boots', async () => {
    // Two separate calls to createImageReadinessChecker produce two
    // independent caches. Important for tests + for multi-boot scenarios.
    const { ensureImageReady: r1 } = createImageReadinessChecker()
    const { ensureImageReady: r2 } = createImageReadinessChecker()
    function makeClient(counter) {
      return {
        getDockerodeClient: () => ({
          getImage: () => ({
            inspect: async () => {
              throw Object.assign(new Error('not found'), { statusCode: 404 })
            },
          }),
          pull: (image, cb) => {
            counter.n++
            cb(null, { __synthetic: true, events: [] })
          },
          modem: {
            followProgress(stream, onFinished) {
              onFinished(null, [])
            },
          },
        }),
      }
    }
    const counter1 = { n: 0 }
    const counter2 = { n: 0 }
    await r1({
      dockerClient: makeClient(counter1),
      image: 'x',
      log: noticeLog,
    })
    await r2({
      dockerClient: makeClient(counter2),
      image: 'x',
      log: noticeLog,
    })
    expect(counter1.n).toBe(1)
    expect(counter2.n).toBe(1)
  })
})
