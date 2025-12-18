export const BASE_BACKOFF = 5000

export const createPersistentRequest = (MAX_RETRIES, log, wait) =>
  async function persistentRequest(f, numTry = 0) {
    try {
      return await f()
    } catch (e) {
      const { providerError } = e
      if (
        numTry < MAX_RETRIES &&
        providerError &&
        ((providerError.retryable &&
          providerError.statusCode !== 403 &&
          providerError.code !== 'CredentialsError' &&
          providerError.code !== 'ExpiredTokenException') ||
          providerError.statusCode === 429)
      ) {
        const nextTryNum = numTry + 1
        const jitter = Math.random() * 3000 - 1000
        const backOff = BASE_BACKOFF + jitter
        log.info(
          [
            `Recoverable error occurred (${e.message}), sleeping for ~${Math.round(
              backOff / 1000,
            )} seconds.`,
            `Try ${nextTryNum} of ${MAX_RETRIES}`,
          ].join(' '),
        )
        await wait(backOff)
        return persistentRequest(f, nextTryNum)
      }
      throw e
    }
  }
