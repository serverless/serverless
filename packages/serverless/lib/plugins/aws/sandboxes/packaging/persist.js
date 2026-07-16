'use strict'

import path from 'path'
import fsPromises from 'fs/promises'

// Manifest written into the package directory so the deploy step can find and
// upload the sandbox artifacts even in a separate process (serverless deploy
// --package <dir>), mirroring how the framework hands function zips from
// `package` to `deploy` via the package directory.
export const UPLOAD_MANIFEST = 'sandboxes-uploads.json'

/**
 * Persist local-dir sandbox artifacts into the package directory at package
 * time: write each zip to <packageDir>/sandboxes/<basename> and a manifest
 * mapping the S3 key → that file. The upload itself happens at deploy time
 * (see readUploadManifest), so `serverless package` stays offline.
 *
 * @param {object} params
 * @param {string} params.packageDir            - Resolved package output directory
 * @param {Map<string,{key:string,zipBuffer:Buffer}>} params.pendingUploads
 * @param {object} [params.fs]                  - fs/promises-like (injectable for tests)
 * @returns {Promise<Array<{name:string,key:string,file:string}>>} manifest entries
 */
export async function persistArtifacts({
  packageDir,
  pendingUploads,
  fs = fsPromises,
}) {
  const entries = []
  for (const [name, { key, zipBuffer }] of pendingUploads) {
    const basename = key.split('/').pop()
    const relFile = path.posix.join('sandboxes', basename)
    const absFile = path.join(packageDir, 'sandboxes', basename)
    await fs.mkdir(path.dirname(absFile), { recursive: true })
    await fs.writeFile(absFile, zipBuffer)
    entries.push({ name, key, file: relFile })
  }
  if (entries.length > 0) {
    await fs.writeFile(
      path.join(packageDir, UPLOAD_MANIFEST),
      JSON.stringify(entries, null, 2),
    )
  }
  return entries
}

/**
 * Read the upload manifest from the package directory. Returns [] when no
 * manifest exists (no local-dir artifacts, or only s3:// pass-through ones).
 *
 * @param {object} params
 * @param {string} params.packageDir
 * @param {object} [params.fs]
 * @returns {Promise<Array<{name:string,key:string,file:string}>>}
 */
export async function readUploadManifest({ packageDir, fs = fsPromises }) {
  try {
    const raw = await fs.readFile(
      path.join(packageDir, UPLOAD_MANIFEST),
      'utf8',
    )
    return JSON.parse(raw)
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
}
