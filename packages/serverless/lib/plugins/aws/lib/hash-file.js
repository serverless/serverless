import { readFile } from 'fs/promises'
import crypto from 'crypto'

/**
 * Shared SHA-256 hashing helpers.
 *
 * Output format matches what AWS Lambda reports as `Configuration.CodeSha256`
 * on `GetFunction`, and what the framework writes as `filesha256` metadata
 * on uploaded S3 objects.
 *
 * Currently used by `package/diff/run-diff.js`. Designed as a single point
 * of truth so that other callers across the AWS plugin can pick it up over
 * time — keeping every "did this file change?" decision in the codebase
 * consistent.
 */

/**
 * Compute the SHA-256 hash of a file's contents, base64-encoded.
 *
 * @param {string} filePath - absolute path to the file
 * @returns {Promise<string>} base64-encoded SHA-256
 */
export async function hashFile(filePath) {
  const buf = await readFile(filePath)
  return crypto.createHash('sha256').update(buf).digest('base64')
}

/**
 * Compute the SHA-256 hash of an in-memory string or Buffer.
 *
 * Same encoding (base64) as `hashFile`, for callers that need to hash a JSON
 * string (e.g., a normalized CloudFormation template) instead of a file.
 *
 * @param {string|Buffer} data
 * @returns {string}
 */
export function hashContent(data) {
  return crypto.createHash('sha256').update(data).digest('base64')
}
