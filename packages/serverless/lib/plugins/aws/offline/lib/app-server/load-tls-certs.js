import { readFile, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import ServerlessError from '../../../../../serverless-error.js'

/**
 * Load the TLS certificate pair used by `offline.httpsProtocol`.
 *
 * @param {string} certDir Directory containing `cert.pem` and `key.pem`.
 * @returns {Promise<{ cert: Buffer, key: Buffer }>}
 */
export async function loadTlsCerts(certDir) {
  const resolvedDir = resolve(certDir)

  try {
    const dirStat = await stat(resolvedDir)
    if (!dirStat.isDirectory()) {
      throw new ServerlessError(
        `offline.httpsProtocol must point to a directory containing cert.pem and key.pem: ${resolvedDir}`,
        'OFFLINE_HTTPS_DIR_MISSING',
      )
    }
  } catch (err) {
    if (err?.code === 'OFFLINE_HTTPS_DIR_MISSING') throw err
    if (err?.code === 'ENOENT') {
      throw new ServerlessError(
        `offline.httpsProtocol directory does not exist: ${resolvedDir}`,
        'OFFLINE_HTTPS_DIR_MISSING',
      )
    }
    throw new ServerlessError(
      `Unable to inspect offline.httpsProtocol directory "${resolvedDir}": ${err?.message ?? err}`,
      'OFFLINE_HTTPS_FILES_UNREADABLE',
    )
  }

  const certPath = join(resolvedDir, 'cert.pem')
  const keyPath = join(resolvedDir, 'key.pem')

  try {
    const [cert, key] = await Promise.all([
      readFile(certPath),
      readFile(keyPath),
    ])
    return { cert, key }
  } catch (err) {
    if (err?.code === 'ENOENT') {
      const missingPath = err.path ?? `${certPath} or ${keyPath}`
      throw new ServerlessError(
        `offline.httpsProtocol is missing required TLS file: ${missingPath}`,
        'OFFLINE_HTTPS_FILES_MISSING',
      )
    }
    throw new ServerlessError(
      `Unable to read offline.httpsProtocol TLS files from "${resolvedDir}": ${err?.message ?? err}`,
      'OFFLINE_HTTPS_FILES_UNREADABLE',
    )
  }
}
