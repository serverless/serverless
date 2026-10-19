'use strict'

import fsPromises from 'node:fs/promises'
import path from 'node:path'
import ServerlessError from '../../../../serverless-error.js'
import { readArchiveEntryNames } from '../../../../utils/read-archive-entry-names.js'
import parseS3URI from '../../utils/parse-s3-uri.js'
import downloadS3Object from '../../utils/download-s3-object.js'
import {
  buildArtifactKey,
  persistArtifacts,
  sha256Hex,
} from '../../lib/content-addressed-artifacts.js'
import { normalizeEntryPath } from './bootstrap.js'
import { BOOTSTRAP_FILE, MANIFEST_KIND, WEB_APPS_DIR } from '../constants.js'

// S3 error codes for an object or bucket that does not exist.
const MISSING_S3_OBJECT_CODES = new Set(['NoSuchKey', 'NoSuchBucket'])

/**
 * Download a `package.artifact` given as an S3 URI to a temporary file, which
 * then stands in for a local zip. Fails with one line naming the URI.
 *
 * @returns {Promise<string>} the downloaded file
 */
async function downloadArtifact({
  name,
  artifact,
  s3Object,
  serverless,
  provider,
}) {
  try {
    return await downloadS3Object({
      provider,
      s3Object,
      filePath: path.join(
        serverless.utils.getTmpDirPath(),
        path.basename(s3Object.Key),
      ),
    })
  } catch (err) {
    if (!err.providerError || err.code === 'AWS_CREDENTIALS_NOT_FOUND') {
      throw err
    }
    const code = err.providerError.code
    if (MISSING_S3_OBJECT_CODES.has(code)) {
      throw new ServerlessError(
        `webApps.${name}.package.artifact "${artifact}" does not exist.`,
        'WEB_APPS_ARTIFACT_NOT_FOUND',
        { stack: false },
      )
    }
    // S3 messages may lack a closing period ("Access Denied").
    const reason = (err.providerError.message || err.message).replace(
      /\.?$/,
      '.',
    )
    // Without s3:ListBucket, S3 answers AccessDenied for a missing object too.
    const hint =
      code === 'AccessDenied'
        ? ' Check that the object exists and that your deploy credentials allow s3:GetObject on it.'
        : ''
    throw new ServerlessError(
      `webApps.${name}.package.artifact "${artifact}" could not be downloaded: ${reason}${hint}`,
      'WEB_APPS_ARTIFACT_DOWNLOAD_FAILED',
      { stack: false },
    )
  }
}

/**
 * Read a `package.artifact` zip and check that it contains `entry`. The zip
 * ships as supplied, so `entry` (normalized) is the file the runtime starts.
 * An S3 URI is downloaded first and then read like a local path.
 *
 * @returns {Promise<{ bytes: Buffer, sourceFile: string, entrypoint: string }>}
 */
async function readPrebuiltArtifact({
  name,
  webApp,
  serverless,
  provider,
  fs,
}) {
  const { artifact } = webApp.package
  const s3Object = parseS3URI(artifact)
  const sourceFile = s3Object
    ? await downloadArtifact({ name, artifact, s3Object, serverless, provider })
    : path.resolve(serverless.serviceDir, artifact)
  let bytes
  try {
    bytes = await fs.readFile(sourceFile)
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
    throw new ServerlessError(
      `webApps.${name}.package.artifact "${artifact}" does not exist.`,
      'WEB_APPS_ARTIFACT_NOT_FOUND',
      { stack: false },
    )
  }

  const entryNames = await readArchiveEntryNames(sourceFile)
  if (!entryNames) {
    throw new ServerlessError(
      `webApps.${name}.package.artifact "${artifact}" is not a readable zip file.`,
      'WEB_APPS_ARTIFACT_UNREADABLE',
      { stack: false },
    )
  }
  const entrypoint = normalizeEntryPath(webApp.entry)
  if (!entryNames.has(entrypoint)) {
    throw new ServerlessError(
      `webApps.${name}.entry "${webApp.entry}" is not in ${artifact}. Set entry to the path of your server's start file inside the zip.`,
      'WEB_APPS_ARTIFACT_ENTRY_MISSING',
      { stack: false },
    )
  }
  return { bytes, sourceFile, entrypoint }
}

/**
 * The zip each web app ships and its content-addressed S3 key: the
 * `package.artifact` zip as supplied (downloaded first when it is an S3 URI), or the zip packaging wrote to
 * `<packageDir>/webapps/<name>.zip` (with the bootstrap as its start file).
 * The key embeds the sha256 of the bytes, so identical code gives an
 * identical key and template.
 *
 * @param {object} params
 * @param {object} params.serverless
 * @param {object} params.provider - the AWS provider
 * @param {Record<string, object>} params.webApps - `webApps`
 * @param {string} params.packageDir - where packaging wrote the zips
 *   (`<serviceDir>/.serverless`)
 * @param {object} [params.fs] - fs/promises-like (injectable for tests)
 * @returns {Promise<Map<string, { key: string, sourceFile: string, entrypoint: string, prebuilt: boolean }>>}
 *   by web app key; `prebuilt` marks a `package.artifact` zip
 */
export async function collectWebAppArtifacts({
  serverless,
  provider,
  webApps,
  packageDir,
  fs = fsPromises,
}) {
  const collected = await Promise.all(
    Object.entries(webApps).map(async ([name, webApp]) => {
      const prebuilt = Boolean(webApp.package?.artifact)
      let artifact
      if (prebuilt) {
        artifact = await readPrebuiltArtifact({
          name,
          webApp,
          serverless,
          provider,
          fs,
        })
      } else {
        const sourceFile = path.join(packageDir, WEB_APPS_DIR, `${name}.zip`)
        artifact = {
          bytes: await fs.readFile(sourceFile),
          sourceFile,
          entrypoint: BOOTSTRAP_FILE,
        }
      }
      const key = buildArtifactKey({
        prefix: provider.getDeploymentPrefix(),
        serviceName: serverless.service.service,
        stage: provider.getStage(),
        kind: MANIFEST_KIND,
        name,
        sha256: sha256Hex(artifact.bytes),
      })
      const { sourceFile, entrypoint } = artifact
      return [name, { key, sourceFile, entrypoint, prebuilt }]
    }),
  )
  return new Map(collected)
}

/**
 * Write each zip to `<packageDir>/webapps/<name>-<sha256>.zip` and list it in
 * `<packageDir>/webapps-uploads.json` for the deploy step. A zip packaging
 * wrote is moved, so the package directory holds exactly one zip per web app;
 * a `package.artifact` zip is copied and left where it is.
 *
 * @param {object} params
 * @param {string} params.packageDir
 * @param {Awaited<ReturnType<typeof collectWebAppArtifacts>>} params.artifacts
 * @param {object} [params.fs] - fs/promises-like (injectable for tests)
 */
export async function persistWebAppArtifacts({
  packageDir,
  artifacts,
  fs = fsPromises,
}) {
  await persistArtifacts({
    packageDir,
    kind: MANIFEST_KIND,
    pendingUploads: artifacts,
    fs,
  })
  await Promise.all(
    [...artifacts.values()]
      .filter(({ prebuilt }) => !prebuilt)
      .map(({ sourceFile }) => fs.unlink(sourceFile)),
  )
}
