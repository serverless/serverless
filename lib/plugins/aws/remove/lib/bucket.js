import utils from '@serverlessinc/sf-core/src/utils.js'
import ServerlessError from '../../../../serverless-error.js'

const { log } = utils

export default {
  async setServerlessDeploymentBucketName() {
    try {
      this.bucketName = await this.provider.getServerlessDeploymentBucketName()
      this.deploymentBucketInStack = this.provider.deploymentBucketInStack
      this.globalDeploymentBucketUsed = this.provider.globalDeploymentBucketUsed
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

    return isProvidedVersionedBucket || this.globalDeploymentBucketUsed
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
      this.deploymentBucketInStack &&
      (await this.checkIfBucketExists(this.deploymentBucketInStack))
    ) {
      const objectsInBucket = await this.listObjectsV2(
        this.deploymentBucketInStack,
      )
      await this.deleteObjects(this.deploymentBucketInStack, objectsInBucket)
    } else {
      log.info(
        'ServerlessDeploymentBucket S3 bucket not found. Skipping S3 bucket objects removal',
      )
    }
    // Clear the global deployment bucket
    if (
      this.globalDeploymentBucketUsed &&
      (await this.checkIfBucketExists(this.bucketName))
    ) {
      const objectsInBucket = await this.listObjectVersions(this.bucketName)
      await this.deleteObjects(this.bucketName, objectsInBucket)
    } else {
      log.info(
        'Global deployment S3 bucket not found. Skipping S3 bucket objects removal',
      )
    }
    // Clear the bucket provided by the user in the configuration
    if (
      this.bucketName &&
      !this.globalDeploymentBucketUsed &&
      this.bucketName !== this.deploymentBucketInStack &&
      (await this.checkIfBucketExists(this.bucketName))
    ) {
      const deploymentBucketObject =
        this.serverless.service.provider.deploymentBucketObject
      const isProvidedVersionedBucket =
        deploymentBucketObject &&
        deploymentBucketObject.name === this.bucketName &&
        deploymentBucketObject.versioning

      const objectsInBucket = isProvidedVersionedBucket
        ? await this.listObjectVersions(this.bucketName)
        : await this.listObjectsV2(this.bucketName)

      await this.deleteObjects(this.bucketName, objectsInBucket)
    } else {
      log.info(
        'Deployment S3 bucket not found. Skipping S3 bucket objects removal',
      )
    }
  },
}
