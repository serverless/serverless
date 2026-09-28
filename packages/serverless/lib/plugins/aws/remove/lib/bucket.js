import { log } from '@serverless/util'
import ServerlessError from '../../../../serverless-error.js'

// S3 DeleteObjects accepts at most 1000 keys per request
const DELETE_BATCH_SIZE = 1000

export default {
  async setServerlessDeploymentBucketName() {
    try {
      this.bucketName = await this.provider.getServerlessDeploymentBucketName()
      this.deploymentBucketInStack = this.provider.deploymentBucketInStack
      this.globalDeploymentBucketUsed = this.provider.globalDeploymentBucketUsed
    } catch (err) {
      // A validation error with this message means the stack has no deployment
      // bucket resource, so we proceed with an empty `bucketName`. Anything
      // else propagates — including framework errors that carry no provider
      // error at all (for example, insufficient permissions to resolve the
      // global deployment bucket).
      if (
        err.providerError?.code !== 'ValidationError' ||
        !err.message.includes('does not exist for stack')
      ) {
        throw err
      }
    }
  },

  // Artifacts live under `<prefix>/<service>/<stage>/<deployment>/…`. The
  // trailing slash keeps the listing from reaching into a sibling stage whose
  // name merely starts with this one (dev vs dev2, prod vs production).
  getDeploymentArtifactsPrefix() {
    return `${this.provider.getDeploymentPrefix()}/${
      this.serverless.service.service
    }/${this.provider.getStage()}/`
  },

  // Yields one page of `{ Key }` objects at a time
  async *listObjectsV2(bucketName) {
    let continuationToken

    do {
      let result
      try {
        result = await this.provider.request('S3', 'listObjectsV2', {
          Bucket: bucketName,
          Prefix: this.getDeploymentArtifactsPrefix(),
          ...(continuationToken && { ContinuationToken: continuationToken }),
        })
      } catch (err) {
        if (err.code === 'AWS_S3_LIST_OBJECTS_V2_ACCESS_DENIED') {
          throw new ServerlessError(
            'Could not list objects in the deployment bucket. Make sure you have sufficient permissions to access it.',
            err.code,
          )
        }
        throw err
      }

      yield (result?.Contents || []).map((object) => ({ Key: object.Key }))
      continuationToken = result?.IsTruncated
        ? result.NextContinuationToken
        : undefined
    } while (continuationToken)
  },

  // Yields one page of `{ Key, VersionId }` objects at a time, covering both
  // object versions and delete markers
  async *listObjectVersions(bucketName) {
    let markers

    do {
      const result = await this.provider.request('S3', 'listObjectVersions', {
        Bucket: bucketName,
        Prefix: this.getDeploymentArtifactsPrefix(),
        ...markers,
      })

      yield [...(result?.Versions || []), ...(result?.DeleteMarkers || [])].map(
        (object) => ({ Key: object.Key, VersionId: object.VersionId }),
      )
      markers =
        result?.IsTruncated && result.NextKeyMarker
          ? {
              KeyMarker: result.NextKeyMarker,
              VersionIdMarker: result.NextVersionIdMarker,
            }
          : undefined
    } while (markers)
  },

  isGlobalDeploymentBucket(bucketName) {
    return this.globalDeploymentBucketUsed && bucketName === this.bucketName
  },

  // Reads the bucket's versioning state from S3: `true` when versioning is
  // enabled or suspended (either way non-current versions and delete markers
  // can exist and block the bucket's deletion), `false` when the bucket was
  // never versioned, `null` when the state cannot be read.
  async getBucketVersioningState(bucketName) {
    try {
      const result = await this.provider.request('S3', 'getBucketVersioning', {
        Bucket: bucketName,
      })
      return result?.Status === 'Enabled' || result?.Status === 'Suspended'
    } catch (err) {
      if (err.code !== 'AWS_S3_GET_BUCKET_VERSIONING_ACCESS_DENIED') throw err
      log.info(
        `Could not read the versioning state of the deployment bucket "${bucketName}" (missing "s3:GetBucketVersioning" permission). Object versions will be removed if they can be listed.`,
      )
      return null
    }
  },

  // Whether the bucket's artifacts have to be deleted by version: `true`,
  // `false`, or `null` when that is unknown. The global deployment bucket is
  // always versioned. A user-owned bucket is never deleted by the Framework,
  // so it is treated as versioned only when the configuration declares it:
  // otherwise current objects get delete markers and the bucket's history
  // stays. The stack-owned bucket is deleted with the stack, so every version
  // has to go: its S3 state decides, because that state outlives the
  // configuration that enabled it (removing `deploymentBucket.versioning`
  // suspends versioning, it does not undo it).
  async resolveBucketVersioning(bucketName) {
    if (this.isGlobalDeploymentBucket(bucketName)) return true
    const declared = Boolean(
      this.serverless.service.provider.deploymentBucketObject?.versioning,
    )
    if (bucketName !== this.deploymentBucketInStack) return declared
    return this.getBucketVersioningState(bucketName)
  },

  // Whether the configuration itself says the bucket is versioned: the
  // `versioning` flag versions it, and reference code storage requires the
  // stack-owned bucket to be versioned
  isDeclaredVersioned(bucketName) {
    return (
      Boolean(
        this.serverless.service.provider.deploymentBucketObject?.versioning,
      ) ||
      (bucketName === this.deploymentBucketInStack &&
        this.provider.isReferenceCodeStorageMode())
    )
  },

  // With `retryNullVersionsByKey`, a batch whose refused deletes are all denied
  // deletes of "null" versions is retried with those keys alone. A bucket that
  // was never versioned reports every object as a "null" version, and deleting
  // one by version id needs "s3:DeleteObjectVersion", which a delete by key
  // does not.
  async deleteObjects(
    bucketName,
    objectsInBucket,
    { retryNullVersionsByKey = false } = {},
  ) {
    for (
      let start = 0;
      start < objectsInBucket.length;
      start += DELETE_BATCH_SIZE
    ) {
      let errors = await this.requestObjectsDeletion(
        bucketName,
        objectsInBucket.slice(start, start + DELETE_BATCH_SIZE),
      )
      if (
        retryNullVersionsByKey &&
        errors.length &&
        errors.every(
          (error) =>
            error.Code === 'AccessDenied' && error.VersionId === 'null',
        )
      ) {
        log.info(
          `Deleting ${errors.length} object(s) in the deployment bucket "${bucketName}" by key (missing "s3:DeleteObjectVersion" permission).`,
        )
        errors = await this.requestObjectsDeletion(
          bucketName,
          errors.map(({ Key }) => ({ Key })),
        )
      }
      if (!errors.length) continue

      const firstErrorCode = errors[0].Code
      if (firstErrorCode === 'AccessDenied') {
        throw new ServerlessError(
          `Could not empty the S3 deployment bucket (${bucketName}). Make sure that you have permissions that allow S3 objects deletion. First encountered S3 error code: ${firstErrorCode}`,
          'CANNOT_DELETE_S3_OBJECTS_ACCESS_DENIED',
        )
      }
      throw new ServerlessError(
        `Could not empty the S3 deployment bucket (${bucketName}). First encountered S3 error code: ${firstErrorCode}`,
        'CANNOT_DELETE_S3_OBJECTS_GENERIC',
      )
    }
  },

  // Returns the per-object errors S3 reports for one DeleteObjects request
  async requestObjectsDeletion(bucketName, objects) {
    const data = await this.provider.request('S3', 'deleteObjects', {
      Bucket: bucketName,
      Delete: { Objects: objects },
    })
    return data?.Errors || []
  },

  // Deletes the service's artifacts page by page, so an interrupted removal
  // keeps the progress it made and memory stays bounded on large buckets
  async emptyDeploymentBucket(bucketName) {
    const versioned = await this.resolveBucketVersioning(bucketName)
    // When the state is unknown, list by version anyway: historical versions
    // would block the stack deletion, and a denied version listing still
    // falls back to the plain listing below
    if (versioned !== false) {
      try {
        for await (const objects of this.listObjectVersions(bucketName)) {
          await this.deleteObjects(bucketName, objects, {
            retryNullVersionsByKey: versioned === null,
          })
        }
        return
      } catch (err) {
        if (err.code !== 'AWS_S3_LIST_OBJECT_VERSIONS_ACCESS_DENIED') throw err
        const message = `Could not list object versions in the deployment bucket "${bucketName}" (missing "s3:ListBucketVersions" permission). Only current object versions will be removed; if the bucket is versioned, remaining versions may block its deletion.`
        // A warning when the bucket is known or declared to be versioned;
        // otherwise the plain listing is what this bucket has always received
        if (versioned === true || this.isDeclaredVersioned(bucketName)) {
          log.warning(message)
        } else {
          log.info(message)
        }
      }
    }
    for await (const objects of this.listObjectsV2(bucketName)) {
      await this.deleteObjects(bucketName, objects)
    }
  },

  async emptyS3Bucket() {
    await this.setServerlessDeploymentBucketName()

    // The bucket owned by the stack (if any) and the resolved deployment bucket
    // (global or user-named). In most modes these are the same single bucket.
    const bucketNames = new Set(
      [this.deploymentBucketInStack, this.bucketName].filter(Boolean),
    )
    if (!bucketNames.size) {
      log.info(
        'No deployment S3 bucket found for this service. Skipping S3 bucket objects removal',
      )
      return
    }

    for (const bucketName of bucketNames) {
      if (!(await this.checkIfBucketExists(bucketName))) {
        log.info(
          `Deployment S3 bucket "${bucketName}" not found. Skipping S3 bucket objects removal`,
        )
        continue
      }
      await this.emptyDeploymentBucket(bucketName)
    }
  },
}
