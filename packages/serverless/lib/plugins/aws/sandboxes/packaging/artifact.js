'use strict'

import ServerlessError from '../../../../serverless-error.js'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import { ZipArchive } from 'archiver'
import { globbySync } from 'globby'
import setS3UploadEncryptionOptions from '../../../../aws/set-s3-upload-encryption-options.js'

/**
 * Zip a directory into an in-memory Buffer using archiver.
 *
 * This is the real implementation used in production. Unit tests inject a
 * stub via `deps.zipDir` so they never touch the filesystem.
 *
 * @param {string} dirPath - Absolute path to the directory to zip
 * @returns {Promise<Buffer>}
 */
async function defaultZipDir(dirPath) {
  // Fail loudly on a missing artifact directory. archiver silently produces an
  // empty (22-byte) zip for a non-existent directory, which then surfaces much
  // later as an opaque MicroVM image-build "did not stabilize" error.
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    throw new ServerlessError(
      `sandboxes: artifact directory not found: "${dirPath}". ` +
        `The "artifact" path is resolved relative to the service directory ` +
        `(the directory containing serverless.yml).`,
      'SANDBOXES_ARTIFACT_NOT_FOUND',
    )
  }
  // The MicroVM image is built FROM a Dockerfile in the artifact dir. Catch a
  // missing one here — otherwise the build fails ~80s later at deploy with an
  // opaque "MicrovmImage did not stabilize" error.
  if (!fs.existsSync(path.join(dirPath, 'Dockerfile'))) {
    throw new ServerlessError(
      `sandboxes: no Dockerfile found in artifact directory "${dirPath}". ` +
        `A local sandbox artifact must contain a Dockerfile (the image is built ` +
        `from it). Add a Dockerfile, or point "artifact" at a pre-built s3:// zip.`,
      'SANDBOXES_DOCKERFILE_NOT_FOUND',
    )
  }
  return new Promise((resolve, reject) => {
    const chunks = []
    const archive = new ZipArchive({ zlib: { level: 9 } })

    archive.on('data', (chunk) => chunks.push(chunk))
    archive.on('end', () => resolve(Buffer.concat(chunks)))
    archive.on('error', reject)

    // Build the zip deterministically so the content-addressed S3 key is stable
    // across machines and CI. `archive.directory()` embeds each file's live
    // mtime and walks in filesystem order, so the same source bytes produce
    // different zips on a fresh checkout — churning the key and triggering
    // spurious ~100s MicrovmImage rebuilds. Mirror the framework's function
    // packaging (lib/plugins/package/lib/zip-service.js): enumerate files,
    // sort by path, and pin every entry's date to `new Date(0)`.
    const files = globbySync('**/*', {
      cwd: dirPath,
      dot: true,
      onlyFiles: true,
    }).sort((a, b) => a.localeCompare(b))

    for (const rel of files) {
      const fullPath = path.join(dirPath, rel)
      const stat = fs.statSync(fullPath)
      // Preserve the executable bit (or force 0o755 on Windows), matching
      // zip-service.js — otherwise scripts in the build context lose +x.
      const mode =
        stat.mode & 0o100 || process.platform === 'win32' ? 0o755 : 0o644
      archive.append(fs.createReadStream(fullPath), {
        name: rel,
        mode,
        date: new Date(0), // pin mtime → identical content yields an identical zip
      })
    }

    archive.finalize()
  })
}

/**
 * Compute the code artifact descriptor for a sandbox — pure, no AWS calls.
 *
 * Behaviour:
 *   - If `cfg.artifact` already starts with `s3://` it is returned unchanged
 *     as `{ uri: cfg.artifact }`.
 *   - Otherwise `cfg.artifact` is treated as a local directory path.  It is
 *     zipped with `deps.zipDir` (defaults to the real archiver impl).  The S3
 *     key is content-addressed:
 *       `serverless/<serviceName>/<stage>/sandboxes/<name>-<sha256hex>.zip`
 *     Returns `{ key, zipBuffer, uri: undefined }` — no upload happens here.
 *
 * @param {object} cfg
 * @param {string} cfg.artifact  - `s3://…` passthrough URI **or** local dir path
 *
 * @param {object} deps
 * @param {string}   deps.serviceName - Serverless service name
 * @param {string}   deps.stage       - Deployment stage
 * @param {string}   deps.name        - Sandbox name
 * @param {Function} [deps.zipDir]    - Injected zip fn (dir → Buffer); defaults to archiver impl
 *
 * @returns {Promise<{ uri: string, key: undefined, zipBuffer: undefined }
 *                  |{ uri: undefined, key: string,  zipBuffer: Buffer }>}
 */
export async function computeCodeArtifact(cfg, deps) {
  if (cfg.artifact.startsWith('s3://')) {
    return { uri: cfg.artifact, key: undefined, zipBuffer: undefined }
  }

  const { serviceName, stage, name, serviceDir } = deps
  const zipDir = deps.zipDir ?? defaultZipDir

  // Resolve the artifact directory relative to the service directory (where
  // serverless.yml lives), NOT process.cwd(). The CLI is frequently invoked
  // from a different cwd (`serverless -c path/to/serverless.yml`, the test
  // harness, `serverless compose`), and a cwd-relative path silently zips the
  // wrong — often empty — directory. Mirrors functions.js artifact resolution.
  const dir = path.isAbsolute(cfg.artifact)
    ? cfg.artifact
    : path.resolve(serviceDir || '.', cfg.artifact)

  const zipBuffer = await zipDir(dir)

  const sha = crypto.createHash('sha256').update(zipBuffer).digest('hex')
  const key = `serverless/${serviceName}/${stage}/sandboxes/${name}-${sha}.zip`

  return { uri: undefined, key, zipBuffer }
}

/**
 * Upload a sandbox zip artifact to S3.
 *
 * Applies deployment-bucket encryption options when `deploymentBucketObject`
 * is present (mirrors the behaviour of `lib/plugins/aws/lib/upload-zip-file.js`).
 *
 * @param {object} params
 * @param {object} params.provider               - Serverless AWS provider
 * @param {string} params.bucket                 - Deployment bucket name
 * @param {string} params.key                    - S3 object key
 * @param {Buffer} params.body                   - Zip content
 * @param {object} [params.deploymentBucketObject] - Encryption options object from
 *                                                  provider.deploymentBucketObject
 *
 * @returns {Promise<void>}
 */
export async function uploadArtifact({
  provider,
  bucket,
  key,
  body,
  deploymentBucketObject,
}) {
  let params = {
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: 'application/zip',
  }

  if (deploymentBucketObject) {
    params = setS3UploadEncryptionOptions(params, deploymentBucketObject)
  }

  await provider.request('S3', 'upload', params)
}
