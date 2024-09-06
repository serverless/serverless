import utils from '@serverlessinc/sf-core/src/utils.js'
import ServerlessError from '../../../../serverless-error.js'

const { log } = utils

export default {
  async setServerlessDeploymentBucketName() {
    try {
      const { bucketToUse: bucketName, existingStackBucket } =
        await this.provider.getServerlessDeploymentBucketName()
      this.bucketName = bucketName
      this.existingStackBucket = existingStackBucket
    } catch (err) {
      // If there is a validation error with expected message, it means that logical resource for
      // S3 bucket does not exist and we want to proceed with empty `bucketName`
      if (
        err.providerError.code !== 'ValidationError' ||
        !err.message.includes('does not exist for stack')
      ) {
        throw err
      }
    }
  },

  async listObjectsV2(bucketName) {
    const objectsInBucket = []

    const serviceStage = `${
      this.serverless.service.service
    }/${this.provider.getStage()}`

    let result
    try {
      result = await this.provider.request('S3', 'listObjectsV2', {
        Bucket: bucketName,
        Prefix: `${this.provider.getDeploymentPrefix()}/${serviceStage}`,
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

    if (result) {
      result.Contents.forEach((object) => {
        objectsInBucket.push({
          Key: object.Key,
        })
      })
    }
    return objectsInBucket
  },

  async listObjectVersions(bucketName) {
    const objectsInBucket = []

    const serviceStage = `${
      this.serverless.service.service
    }/${this.provider.getStage()}`

    const result = await this.provider.request('S3', 'listObjectVersions', {
      Bucket: bucketName,
      Prefix: `${this.provider.getDeploymentPrefix()}/${serviceStage}`,
    })

    if (result) {
      if (result.Versions) {
        result.Versions.forEach((object) => {
          objectsInBucket.push({
            Key: object.Key,
            VersionId: object.VersionId,
          })
        })
      }

      if (result.DeleteMarkers) {
        result.DeleteMarkers.forEach((object) => {
          objectsInBucket.push({
            Key: object.Key,
            VersionId: object.VersionId,
          })
        })
      }
    }
    return objectsInBucket
  },

  async listObjects(bucketName) {
    const deploymentBucketObject =
      this.serverless.service.provider.deploymentBucketObject
    const isProvidedVersionedBucket =
      deploymentBucketObject &&
      deploymentBucketObject.name === bucketName &&
      deploymentBucketObject.versioning

    const isGlobalVersionedBucket =
      bucketName && bucketName === this.serverless?.globalDeploymentBucketName

    return isProvidedVersionedBucket || isGlobalVersionedBucket
      ? this.listObjectVersions(bucketName)
      : this.listObjectsV2(bucketName)
  },

  async deleteObjects(bucketName, objectsInBucket) {
    if (objectsInBucket.length) {
      const data = await this.provider.request('S3', 'deleteObjects', {
        Bucket: bucketName,
        Delete: {
          Objects: objectsInBucket,
        },
      })
      if (data && data.Errors && data.Errors.length) {
        const firstErrorCode = data.Errors[0].Code

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
    }
  },

  async emptyS3Bucket() {
    await this.setServerlessDeploymentBucketName()
    // Clear the stack bucket if it exists
    if (
      this.existingStackBucket &&
      (await this.checkIfBucketExists(this.existingStackBucket))
    ) {
      const objectsInBucket = await this.listObjects(this.existingStackBucket)
      await this.deleteObjects(this.existingStackBucket, objectsInBucket)
    } else {
      log.info(
        'ServerlessDeploymentBucket S3 bucket not found. Skipping S3 bucket objects removal',
      )
    }
    // Clear the global deployment bucket
    if (
      this.serverless?.globalDeploymentBucketName &&
      (await this.checkIfBucketExists(
        this.serverless?.globalDeploymentBucketName,
      ))
    ) {
      const objectsInBucket = await this.listObjects(
        this.serverless?.globalDeploymentBucketName,
      )
      await this.deleteObjects(
        this.serverless?.globalDeploymentBucketName,
        objectsInBucket,
      )
    } else {
      log.info(
        'Global deployment S3 bucket not found. Skipping S3 bucket objects removal',
      )
    }
    // Clear the bucket provided by the user in the configuration
    if (
      this.bucketName &&
      this.bucketName !== this.existingStackBucket &&
      this.bucketName !== this.serverless?.globalDeploymentBucketName &&
      (await this.checkIfBucketExists(this.bucketName))
    ) {
      const objectsInBucket = await this.listObjects(this.bucketName)
      await this.deleteObjects(this.bucketName, objectsInBucket)
    } else {
      log.info(
        'Deployment S3 bucket not found. Skipping S3 bucket objects removal',
      )
    }
  },
}
