import ServerlessError from '../../../../../serverless-error.js'

/**
 * Create a stateful image-readiness checker. Each instance maintains its
 * own per-image Promise cache so concurrent `ensureImageReady` calls for
 * the same image during a single boot share the pull. Subsequent boots
 * create a fresh checker (`createImageReadinessChecker()` invoked again
 * at the boot wiring's call site).
 *
 * The cache is keyed by image URI. A successful pull resolves the Promise
 * permanently (subsequent calls hit the cache and return immediately). A
 * failed pull rejects and removes the entry, so a corrected toolchain
 * (user fixed network / pulled manually) can retry on the next call.
 *
 * @returns {{
 *   ensureImageReady(opts: { dockerClient: object, image: string, log: object }): Promise<void>,
 * }}
 */
export function createImageReadinessChecker() {
  /** @type {Map<string, Promise<void>>} */
  const inFlight = new Map()

  async function _check(dockerClient, image, log) {
    const docker = dockerClient.getDockerodeClient()

    // 1. Already pulled?
    try {
      await docker.getImage(image).inspect()
      return // present; nothing to do
    } catch (err) {
      if (err.statusCode !== 404) {
        // Some other error from `inspect` — surface as a pull failure,
        // since this is the same boot-time gate.
        throw new ServerlessError(
          `Could not inspect image ${image}: ${err.message}.`,
          'OFFLINE_DOCKER_IMAGE_PULL_FAILED',
        )
      }
      // 404 → fall through to pull.
    }

    if (typeof log?.notice === 'function') {
      log.notice(`Pulling ${image} — this can take 30s–3min on first run.`)
    }

    // 2. Pull, streaming progress events.
    await new Promise((resolve, reject) => {
      docker.pull(image, (err, stream) => {
        if (err) {
          reject(
            new ServerlessError(
              `Failed to start pull for ${image}: ${err.message}.`,
              'OFFLINE_DOCKER_IMAGE_PULL_FAILED',
            ),
          )
          return
        }
        docker.modem.followProgress(
          stream,
          (finishErr, _output) => {
            if (finishErr) {
              reject(
                new ServerlessError(
                  `Failed to pull ${image}: ${finishErr.message}.`,
                  'OFFLINE_DOCKER_IMAGE_PULL_FAILED',
                ),
              )
              return
            }
            if (typeof log?.notice === 'function') {
              log.notice(`Pulled ${image}.`)
            }
            resolve()
          },
          // onProgress: per-event. Per-layer events are noisy in the
          // default log stream (50–200 events for a typical Lambda image)
          // but invaluable when a pull stalls. Forward at debug so
          // `DEBUG=sls:offline:docker` reveals layer-by-layer heartbeat
          // without polluting normal output.
          (event) => {
            if (typeof log?.debug !== 'function') return
            if (!event) return
            const id = event.id ? ` ${event.id}` : ''
            const progress =
              event.progressDetail &&
              typeof event.progressDetail.current === 'number' &&
              typeof event.progressDetail.total === 'number'
                ? ` ${event.progressDetail.current}/${event.progressDetail.total}`
                : ''
            const status = event.status ?? ''
            log.debug(`pull ${image}${id}: ${status}${progress}`.trimEnd())
          },
        )
      })
    })
  }

  async function ensureImageReady({ dockerClient, image, log }) {
    let promise = inFlight.get(image)
    if (promise) return promise

    promise = _check(dockerClient, image, log).catch((err) => {
      // Remove failed promise so a retry will re-attempt the pull.
      inFlight.delete(image)
      throw err
    })
    inFlight.set(image, promise)
    return promise
  }

  return { ensureImageReady }
}
