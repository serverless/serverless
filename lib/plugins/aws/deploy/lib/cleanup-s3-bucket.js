import _ from 'lodash'
import findAndGroupDeployments from '../../utils/find-and-group-deployments.js'
import getS3ObjectsFromStacks from '../../utils/get-s3-objects-from-stacks.js'
import ServerlessError from '../../../../serverless-error.js'
import utils from '@serverlessinc/sf-core/src/utils.js'

const { log } = utils

export default {
  async getObjectsToRemove() {
    const stacksToKeepCount = _.get(
      this.serverless,
      'service.provider.deploymentBucketObject.maxPreviousDeploymentArtifacts',
      5,
    )

    const service = this.serverless.service.service
    const stage = this.provider.getStage()
    const prefix = this.provider.getDeploymentPrefix()

    let response
    try {
      response = await this.provider.request('S3', 'listObjectsV2', {
        Bucket: this.bucketName,
        Prefix: `${prefix}/${service}/${stage}`,
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
    const stacks = findAndGroupDeployments(response, prefix, service, stage)
    const stacksToRemove = stacks.slice(0, -stacksToKeepCount || Infinity)

    return getS3ObjectsFromStacks(stacksToRemove, prefix, service, stage)
  },

  async removeObjects(objectsToRemove) {
    if (!objectsToRemove || !objectsToRemove.length) return
    await this.provider.request('S3', 'deleteObjects', {
      Bucket: this.bucketName,
      Delete: { Objects: objectsToRemove },
    })
  },

  async cleanupS3Bucket() {
    if (this.serverless.service.provider.deploymentWithEmptyChangeSet) {
      log.info('Removing unnecessary service artifacts from S3')
      await this.cleanupArtifactsForEmptyChangeSet()
    } else {
      log.info('Removing old service artifacts from S3')
      const objectsToRemove = await this.getObjectsToRemove()
      await this.removeObjects(objectsToRemove)
    }
  },

  async cleanupArtifactsForEmptyChangeSet() {
    let response
    try {
      response = await this.provider.request('S3', 'listObjectsV2', {
        Bucket: this.bucketName,
        Prefix: this.serverless.service.package.artifactDirectoryName,
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
    const service = this.serverless.service.service
    const stage = this.provider.getStage()
    const deploymentPrefix = this.provider.getDeploymentPrefix()

    const objectsToRemove = getS3ObjectsFromStacks(
      findAndGroupDeployments(response, deploymentPrefix, service, stage),
      deploymentPrefix,
      service,
      stage,
    )
    await this.removeObjects(objectsToRemove)
  },
}
