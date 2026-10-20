'use strict'

import ServerlessError from '../../../../serverless-error.js'
import path from 'path'
import fs from 'fs'
import { ZipArchive } from 'archiver'
import { resolveSandboxPatterns, selectSandboxFiles } from './files.js'
import {
  buildArtifactKey,
  sha256Hex,
} from '../../lib/content-addressed-artifacts.js'

/**
 * Zip a directory into an in-memory Buffer using archiver.
 *
 * This is the real implementation used in production. Unit tests inject a
 * stub via `deps.zipDir` so they never touch the filesystem.
 *
 * @param {string} dirPath - Absolute path to the directory to zip
 * @param {object} selection - `serviceDir`, `excludes` and `includes` for
 *   selectSandboxFiles (files.js)
 * @returns {Promise<Buffer>}
 */
async function defaultZipDir(dirPath, selection) {
  // Fail loudly on a missing artifact directory. archiver silently produces an
  // empty (22-byte) zip for a non-existent directory, which then surfaces much
  // later as an opaque MicroVM image-build "did not stabilize" error.
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    throw new ServerlessError(
      `sandboxes: artifact directory not found: "${dirPath}". ` +
        `The "artifact" path is resolved relative to the service directory ` +
        `(the directory containing serverless.yml).`,
      'SANDBOXES_ARTIFACT_NOT_FOUND',
      { stack: false },
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
      { stack: false },
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
    const files = selectSandboxFiles(dirPath, selection)

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
 * @param {string}   [deps.serviceDir] - Service directory; relative artifact paths resolve against it
 * @param {object}   [deps.serverless] - Serverless instance; its package patterns select the files
 * @param {Function} [deps.zipDir]    - Injected zip fn (dir → Buffer); defaults to archiver impl
 *
 * @returns {Promise<{ uri: string, key: undefined, zipBuffer: undefined }
 *                  |{ uri: undefined, key: string,  zipBuffer: Buffer }>}
 */
export async function computeCodeArtifact(cfg, deps) {
  if (cfg.artifact.startsWith('s3://')) {
    return { uri: cfg.artifact, key: undefined, zipBuffer: undefined }
  }

  const { serviceName, stage, name, serviceDir, serverless } = deps
  const zipDir = deps.zipDir ?? defaultZipDir

  // Resolve the artifact directory relative to the service directory (where
  // serverless.yml lives), NOT process.cwd(). The CLI is frequently invoked
  // from a different cwd (`serverless -c path/to/serverless.yml`, the test
  // harness, `serverless compose`), and a cwd-relative path silently zips the
  // wrong — often empty — directory. Mirrors functions.js artifact resolution.
  const dir = path.isAbsolute(cfg.artifact)
    ? cfg.artifact
    : path.resolve(serviceDir || '.', cfg.artifact)

  const zipBuffer = await zipDir(dir, {
    serviceDir: path.resolve(serviceDir || '.'),
    ...(serverless ? resolveSandboxPatterns(serverless, cfg) : {}),
  })

  const key = buildArtifactKey({
    prefix: 'serverless',
    serviceName,
    stage,
    kind: 'sandboxes',
    name,
    sha256: sha256Hex(zipBuffer),
  })

  return { uri: undefined, key, zipBuffer }
}
