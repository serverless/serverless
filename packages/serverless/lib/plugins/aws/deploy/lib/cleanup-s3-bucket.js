import _ from 'lodash'
import findAndGroupDeployments from '../../utils/find-and-group-deployments.js'
import getS3ObjectsFromStacks from '../../utils/get-s3-objects-from-stacks.js'
import ServerlessError from '../../../../serverless-error.js'
import { findUnusedArtifacts } from '../../lib/content-addressed-artifacts.js'
import { log } from '@serverless/util'

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

    // Every page: a stage prefix holds more than the 1000 keys one page returns
    // once content-addressed zips accumulate beside the deployment folders
    const response = { Contents: [] }
    try {
      let continuationToken
      do {
        const page = await this.provider.request('S3', 'listObjectsV2', {
          Bucket: this.bucketName,
          Prefix: `${prefix}/${service}/${stage}`,
          ...(continuationToken && { ContinuationToken: continuationToken }),
        })
        response.Contents.push(...(page?.Contents || []))
        continuationToken = page?.IsTruncated
          ? page.NextContinuationToken
          : undefined
      } while (continuationToken)
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
    // S3 DeleteObjects accepts at most 1000 keys per request
    for (let start = 0; start < objectsToRemove.length; start += 1000) {
      await this.provider.request('S3', 'deleteObjects', {
        Bucket: this.bucketName,
        Delete: { Objects: objectsToRemove.slice(start, start + 1000) },
      })
    }
  },

  // Sandbox zips live beside the deployment folders, not in them. A zip is
  // read only when an image builds (deploy, rollback, base-image rebuild), so
  // it stays while a deployment folder's template points to it. Zips of an
  // earlier key layout (always under "serverless/") are covered too.
  async cleanupSandboxArtifacts() {
    const sandboxes =
      this.serverless.service.sandboxes ||
      this.serverless.configurationInput?.sandboxes
    if (!sandboxes || Object.keys(sandboxes).length === 0) return

    log.info('Removing unused sandbox artifacts from S3')
    // The stack update has succeeded by now: a failure here leaves zips in the
    // bucket, which the next deploy retries, and must not fail the deploy
    try {
      const { unused, keptAll } = await findUnusedArtifacts({
        provider: this.provider,
        bucketName: this.bucketName,
        deploymentPrefix: this.provider.getDeploymentPrefix(),
        service: this.serverless.service.service,
        stage: this.provider.getStage(),
        kind: 'sandboxes',
        templateFileName: this.provider.naming.getCompiledTemplateS3Suffix(),
        extraPrefixes: ['serverless'],
        maxTemplateReads: 20,
      })
      if (keptAll) {
        log.info(`Keeping all sandbox artifacts: ${keptAll}.`)
        return
      }
      await this.removeObjects(unused.map((Key) => ({ Key })))
    } catch (error) {
      log.warning(
        `Could not remove unused sandbox artifacts from S3: ${error.message}`,
      )
    }
  },

  async cleanupS3Bucket() {
    if (this.serverless.service.provider.deploymentWithEmptyChangeSet) {
      log.info('Removing unnecessary service artifacts from S3')
      await this.cleanupArtifactsForEmptyChangeSet()
    } else if (this.provider.isReferenceCodeStorageMode()) {
      // Reference mode: deployment artifacts back live Lambda versions.
      // Retirement is handled by "serverless prune --includeArtifacts".
      log.info(
        'Skipping deployment artifact cleanup (codeStorageMode: reference). Use "serverless prune --includeArtifacts" to retire old versions and their artifacts.',
      )
    } else {
      log.info('Removing old service artifacts from S3')
      const objectsToRemove = await this.getObjectsToRemove()
      await this.removeObjects(objectsToRemove)
    }
    // In every mode: sandbox images never run from their zips, which follow
    // the deployment folders that remain
    await this.cleanupSandboxArtifacts()
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
