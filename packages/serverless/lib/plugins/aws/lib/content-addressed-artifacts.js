import crypto from 'node:crypto'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import pLimit from 'p-limit'
import ServerlessError from '../../../serverless-error.js'
import setS3UploadEncryptionOptions from '../../../aws/set-s3-upload-encryption-options.js'
import findAndGroupDeployments from '../utils/find-and-group-deployments.js'

/**
 * Content-addressed artifacts shared by `sandboxes` and `webApps`.
 *
 * Zips are stored under keys that embed the SHA-256 of their bytes, outside
 * the timestamped deployment directories. `package` writes each zip into the
 * package directory with a manifest (`<kind>-uploads.json`); `deploy` reads the
 * manifest and uploads from disk, so `deploy --package <dir>` works in a
 * separate process. Because a key fixes its content, an existing object is
 * never uploaded again.
 */

/**
 * Every `kind`: the package-directory subdirectory and key segment that hold
 * that kind's zips.
 */
export const ARTIFACT_KINDS = ['webapps', 'sandboxes']

const manifestName = (kind) => `${kind}-uploads.json`

/**
 * Resolve the package output directory the way the package and deploy
 * commands do: the --package option, else service.package.path, else
 * <serviceDir>/.serverless. A relative path resolves against serviceDir.
 *
 * @param {object} params
 * @param {object} [params.options]   - CLI options
 * @param {object} [params.service]   - serverless.service
 * @param {string} [params.serviceDir]
 * @returns {string}
 */
export function resolvePackageDir({ options, service, serviceDir }) {
  const configured = options?.package || service?.package?.path
  const base = serviceDir || '.'
  if (!configured) return resolveArtifactsDir({ serviceDir })
  return path.isAbsolute(configured) ? configured : path.join(base, configured)
}

/**
 * Where `package` writes artifacts: <serviceDir>/.serverless. At the end of
 * `package`, the package step replaces the --package (or package.path)
 * directory with a copy of this one, so anything written straight to the
 * package directory is lost. Deploy reads from resolvePackageDir().
 *
 * @param {object} params
 * @param {string} [params.serviceDir]
 * @returns {string}
 */
export function resolveArtifactsDir({ serviceDir }) {
  return path.join(serviceDir || '.', '.serverless')
}

/**
 * @param {object} params
 * @param {string} params.prefix      - Deployment prefix (first key segment)
 * @param {string} params.serviceName
 * @param {string} params.stage
 * @param {'webapps'|'sandboxes'} params.kind
 * @param {string} params.name        - Web app or sandbox name
 * @param {string} params.sha256      - Hex SHA-256 of the zip bytes
 * @returns {string} `<prefix>/<service>/<stage>/<kind>/<name>-<sha256>.zip`
 */
export function buildArtifactKey({
  prefix,
  serviceName,
  stage,
  kind,
  name,
  sha256,
}) {
  return `${prefix}/${serviceName}/${stage}/${kind}/${name}-${sha256}.zip`
}

/**
 * @param {Buffer} buffer
 * @returns {string} lowercase hex SHA-256
 */
export function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

/**
 * Resolve how compiled resources reference the deployment bucket: the
 * resolved bucket name when the framework knows it, otherwise the in-stack
 * `ServerlessDeploymentBucket` resource, resolved by CloudFormation at deploy
 * time. Every consumer (code URIs, IAM policies) must use the same value.
 *
 * @param {string} [resolvedBucket]
 * @returns {string|{Ref: 'ServerlessDeploymentBucket'}}
 */
export function resolveBucketRef(resolvedBucket) {
  return resolvedBucket ? resolvedBucket : { Ref: 'ServerlessDeploymentBucket' }
}

/**
 * Write each artifact to `<packageDir>/<kind>/<basename(key)>` and list them in
 * `<packageDir>/<kind>-uploads.json`. No manifest is written when there is
 * nothing to upload.
 *
 * @param {object} params
 * @param {string} params.packageDir
 * @param {'webapps'|'sandboxes'} params.kind
 * @param {Map<string,{key:string,zipBuffer?:Buffer,sourceFile?:string}>} params.pendingUploads
 *   `sourceFile` is copied when given; `zipBuffer` is written otherwise.
 * @param {object} [params.fs] - fs/promises-like (injectable for tests)
 * @returns {Promise<Array<{name:string,key:string,file:string}>>} manifest entries
 */
export async function persistArtifacts({
  packageDir,
  kind,
  pendingUploads,
  fs = fsPromises,
}) {
  const entries = []
  for (const [name, { key, zipBuffer, sourceFile }] of pendingUploads) {
    const basename = path.posix.basename(key)
    const absFile = path.join(packageDir, kind, basename)
    await fs.mkdir(path.dirname(absFile), { recursive: true })
    if (sourceFile) {
      await fs.copyFile(sourceFile, absFile)
    } else {
      await fs.writeFile(absFile, zipBuffer)
    }
    entries.push({ name, key, file: path.posix.join(kind, basename) })
  }
  if (entries.length > 0) {
    await fs.writeFile(
      path.join(packageDir, manifestName(kind)),
      JSON.stringify(entries, null, 2),
    )
  }
  return entries
}

/**
 * Read `<packageDir>/<kind>-uploads.json`; `[]` when it does not exist.
 *
 * @param {object} params
 * @param {string} params.packageDir
 * @param {'webapps'|'sandboxes'} params.kind
 * @param {object} [params.fs]
 * @returns {Promise<Array<{name:string,key:string,file:string}>>}
 */
export async function readUploadManifest({
  packageDir,
  kind,
  fs = fsPromises,
}) {
  try {
    const raw = await fs.readFile(
      path.join(packageDir, manifestName(kind)),
      'utf8',
    )
    return JSON.parse(raw)
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
}

/**
 * Resolve a manifest entry's `file` inside the package directory. The manifest
 * may come from a `deploy --package <dir>` built elsewhere, so `file` is
 * untrusted: a path that resolves outside `packageDir` is refused, so deploy
 * never reads (and uploads) a file outside the package directory.
 *
 * @param {object} params
 * @param {string} params.packageDir
 * @param {string} params.file
 * @param {string} params.label     - Noun for messages, e.g. 'sandbox artifact'
 * @param {string} params.errorCode - ServerlessError code for an escaping path
 * @returns {string} absolute path inside packageDir
 */
export function resolveManifestFile({ packageDir, file, label, errorCode }) {
  const root = path.resolve(packageDir)
  const resolved = path.resolve(root, file)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new ServerlessError(
      `Refusing to upload ${label} from '${file}': path escapes the package directory.`,
      errorCode,
      { stack: false },
    )
  }
  return resolved
}

const MISSING_OBJECT_STATUS_CODES = new Set([403, 404])
const MISSING_OBJECT_ERROR_CODES = new Set(['NotFound', 'Forbidden'])

/**
 * Whether a HeadObject error means "no readable object at this key". S3
 * answers 403 instead of 404 for a missing key when the caller lacks
 * s3:ListBucket. `provider.request` wraps SDK v2 and v3 errors differently, so
 * check every place the status or code can appear.
 */
function isMissingObjectError(err) {
  const statusCodes = [
    err?.$metadata?.httpStatusCode,
    err?.statusCode,
    err?.providerError?.statusCode,
    err?.providerError?.$metadata?.httpStatusCode,
  ]
  const codes = [
    err?.code,
    err?.name,
    err?.providerError?.code,
    err?.providerError?.name,
  ]
  return (
    statusCodes.some((statusCode) =>
      MISSING_OBJECT_STATUS_CODES.has(statusCode),
    ) || codes.some((code) => MISSING_OBJECT_ERROR_CODES.has(code))
  )
}

/** How many artifacts `uploadPackagedArtifacts` reads and uploads at a time. */
const UPLOAD_CONCURRENCY = 4

/**
 * Upload a content-addressed zip unless an object already exists at its key.
 * HeadObject 200 skips the upload; 404 or 403 uploads; any other error fails
 * with a message naming the object.
 *
 * @param {object} params
 * @param {object} params.provider - Serverless AWS provider
 * @param {string} params.bucket
 * @param {string} params.key
 * @param {Buffer} params.body
 * @param {object} [params.deploymentBucketObject] - provider.deploymentBucketObject
 * @returns {Promise<'skipped'|'uploaded'>}
 */
export async function uploadArtifactIfMissing({
  provider,
  bucket,
  key,
  body,
  deploymentBucketObject,
}) {
  try {
    await provider.request('S3', 'headObject', { Bucket: bucket, Key: key })
    return 'skipped'
  } catch (err) {
    if (!isMissingObjectError(err)) {
      const error = new ServerlessError(
        `Cannot check whether s3://${bucket}/${key} exists: ${err.message}`,
        'ARTIFACT_HEAD_OBJECT_FAILED',
      )
      error.providerError = err.providerError ?? err
      throw error
    }
  }

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
  return 'uploaded'
}

/**
 * Upload every artifact listed in `<packageDir>/<kind>-uploads.json` to the
 * deployment bucket, skipping keys that already exist. Runs at deploy time and
 * reads only from the package directory, so `deploy --package <dir>` works in
 * a separate process. Every listed path is confined to packageDir before any
 * S3 call, so a tampered manifest uploads nothing. Up to four zips are read and
 * uploaded at a time, each read just before its own S3 calls, so a missing zip
 * fails without uploading that entry.
 *
 * @param {object} params
 * @param {object} params.provider - Serverless AWS provider
 * @param {string} params.packageDir
 * @param {'webapps'|'sandboxes'} params.kind
 * @param {string} params.label            - Noun for messages, e.g. 'sandbox artifact'
 * @param {string} params.errorCode        - Code for a path escaping packageDir
 * @param {string} params.missingErrorCode - Code for a listed zip that is missing
 * @param {object} [params.deploymentBucketObject] - provider.deploymentBucketObject
 * @param {object} [params.fs]  - fs/promises-like (injectable for tests)
 * @param {object} [params.log] - Logger; skipped keys are logged at debug
 * @returns {Promise<{uploaded: string[], skipped: string[]}>} keys, in manifest order
 */
export async function uploadPackagedArtifacts({
  provider,
  packageDir,
  kind,
  label,
  errorCode,
  missingErrorCode,
  deploymentBucketObject,
  fs = fsPromises,
  log,
}) {
  const manifest = await readUploadManifest({ packageDir, kind, fs })
  if (manifest.length === 0) return { uploaded: [], skipped: [] }

  const entries = manifest.map(({ key, file }) => ({
    key,
    file,
    resolved: resolveManifestFile({ packageDir, file, label, errorCode }),
  }))

  const bucket = await provider.getServerlessDeploymentBucketName()

  const limit = pLimit(UPLOAD_CONCURRENCY)
  const results = await Promise.all(
    entries.map(({ key, file, resolved }) =>
      limit(async () => {
        let body
        try {
          body = await fs.readFile(resolved)
        } catch (err) {
          if (err.code !== 'ENOENT') throw err
          throw new ServerlessError(
            `Cannot find ${label} '${file}' in the package directory ${packageDir}. Run serverless package again, or deploy without --package.`,
            missingErrorCode,
            { stack: false },
          )
        }
        const result = await uploadArtifactIfMissing({
          provider,
          bucket,
          key,
          body,
          deploymentBucketObject,
        })
        if (result === 'skipped') {
          log?.debug?.(
            `${kind}: artifact s3://${bucket}/${key} already exists, upload skipped`,
          )
        }
        return { key, result }
      }),
    ),
  )

  return {
    uploaded: results.filter((r) => r.result === 'uploaded').map((r) => r.key),
    skipped: results.filter((r) => r.result === 'skipped').map((r) => r.key),
  }
}

async function listAllObjects(provider, bucketName, prefix) {
  const objects = []
  let continuationToken
  do {
    const result = await provider.request('S3', 'listObjectsV2', {
      Bucket: bucketName,
      Prefix: prefix,
      ...(continuationToken && { ContinuationToken: continuationToken }),
    })
    objects.push(...(result?.Contents || []))
    continuationToken = result?.IsTruncated
      ? result.NextContinuationToken
      : undefined
  } while (continuationToken)
  return objects
}

async function listAllKeys(provider, bucketName, prefix) {
  return (await listAllObjects(provider, bucketName, prefix)).map(
    (object) => object.Key,
  )
}

// A deploy uploads its zips before the template that points to them, so a
// cleanup running meanwhile (a concurrent deploy, or a deploy whose own folder
// is already trimmed) would see them as unused. S3's upload time, not the
// local clock, decides.
const RECENT_UPLOAD_MS = 60 * 60 * 1000

// The text of a getObject Body: a v3 stream or a v2 Buffer. Anything else
// throws, so an unreadable template keeps every zip instead of matching none.
async function readBody(body) {
  if (body && typeof body.transformToString === 'function') {
    return body.transformToString()
  }
  if (body instanceof Uint8Array) return Buffer.from(body).toString('utf8')
  throw new Error('Unreadable object body')
}

/**
 * Content-addressed zips of `kind` that no deployment folder left in the
 * bucket points to. A zip is needed only to build from: the latest folder's
 * template names the zip of the current deploy, and every older folder is a
 * `serverless rollback` target that builds from its own. Any folder whose
 * template cannot be read keeps every zip (fail-safe). A zip uploaded within
 * the last hour is kept too: its deploy may not have written its folder yet.
 *
 * @param {object} params
 * @param {object} params.provider
 * @param {string} params.bucketName
 * @param {string} params.deploymentPrefix
 * @param {string} params.service
 * @param {string} params.stage
 * @param {'webapps'|'sandboxes'} params.kind
 * @param {string} params.templateFileName - compiled template in each folder
 * @param {string[]} [params.extraPrefixes] - other first key segments that may
 *   hold zips of this kind (an earlier key layout)
 * @param {string[]} [params.ignoreDirectories] - deployment folders to treat as
 *   gone (a dry run's planned deletions)
 * @param {number} [params.maxTemplateReads] - templates to read at most; past
 *   it every zip is kept. Folders are read newest first and reading stops once
 *   every zip is referenced, so the common case reads one template.
 * @param {number} [params.now] - current time in ms; zips uploaded within the
 *   last hour are always kept
 * @returns {Promise<{unused: string[], keptAll?: string}>}
 */
export async function findUnusedArtifacts({
  provider,
  bucketName,
  deploymentPrefix,
  service,
  stage,
  kind,
  templateFileName,
  extraPrefixes = [],
  ignoreDirectories = [],
  maxTemplateReads = Infinity,
  now = Date.now(),
}) {
  const zipPrefixes = [...new Set([deploymentPrefix, ...extraPrefixes])].map(
    (prefix) => `${prefix}/${service}/${stage}/${kind}/`,
  )
  const zips = []
  for (const prefix of zipPrefixes) {
    const objects = await listAllObjects(provider, bucketName, prefix)
    for (const { Key, LastModified } of objects) {
      const uploadedAt = LastModified ? new Date(LastModified).getTime() : 0
      if (now - uploadedAt >= RECENT_UPLOAD_MS) zips.push(Key)
    }
  }
  if (zips.length === 0) return { unused: [] }

  const folderKeys = await listAllKeys(
    provider,
    bucketName,
    `${deploymentPrefix}/${service}/${stage}/`,
  )
  const folders = findAndGroupDeployments(
    { Contents: folderKeys.map((Key) => ({ Key })) },
    deploymentPrefix,
    service,
    stage,
  )

  // Listing order is oldest first; the newest folder names the current zip
  const remaining = folders
    .filter((group) => !ignoreDirectories.includes(group[0].directory))
    .reverse()
  const referenced = new Set()
  let reads = 0
  for (const group of remaining) {
    if (referenced.size === zips.length) break
    if (reads === maxTemplateReads) {
      return {
        unused: [],
        keptAll: `more than ${maxTemplateReads} deployments to check; "serverless prune --includeArtifacts" retires older ones`,
      }
    }
    reads++
    const { directory } = group[0]
    const keptAll = {
      unused: [],
      keptAll: `could not read the template of deployment ${directory}`,
    }
    if (!group.some((entry) => entry.file === templateFileName)) return keptAll
    let template
    try {
      const result = await provider.request('S3', 'getObject', {
        Bucket: bucketName,
        Key: `${deploymentPrefix}/${service}/${stage}/${directory}/${templateFileName}`,
      })
      template = await readBody(result?.Body)
      JSON.parse(template)
    } catch {
      return keptAll
    }
    for (const key of zips) {
      // The template is JSON text, so a key appears with its `"` and `\` escaped
      if (template.includes(JSON.stringify(key).slice(1, -1)))
        referenced.add(key)
    }
  }

  return { unused: zips.filter((key) => !referenced.has(key)) }
}
