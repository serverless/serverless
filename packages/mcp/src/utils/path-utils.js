import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Resolves a path relative to the repository root
 * @param {string} relativePath - Path relative to repo root
 * @returns {string} - Absolute path
 */
export function fromRepoRoot(relativePath) {
  if (__dirname.endsWith('dist')) {
    return path.resolve(__dirname, '..', relativePath)
  }
  return path.resolve(__dirname, '../../../..', relativePath)
}
