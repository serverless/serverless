const PLATFORM = Object.getOwnPropertyDescriptor(process, 'platform')

/**
 * Runs `fn` with `process.platform` reading `platform`, for output that depends on the platform it
 * is printed on: a suggested command quotes a word for that platform's shells. The real platform
 * is put back when `fn` returns or throws.
 */
export const onPlatform = (platform, fn) => {
  Object.defineProperty(process, 'platform', { ...PLATFORM, value: platform })
  try {
    return fn()
  } finally {
    Object.defineProperty(process, 'platform', PLATFORM)
  }
}
