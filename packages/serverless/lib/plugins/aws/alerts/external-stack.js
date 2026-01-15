/**
 * The ExternalStack class manages an external CloudFormation stack
 * for the alarms. It is enabled by using this custom option in serverless.yml:
 *
 * custom:
 *   alerts:
 *     externalStack: true
 *
 * You can also specify options as an object instead of "true":
 *
 * custom:
 *   alerts:
 *     externalStack:
 *       nameSuffix: Alerts
 */
class ExternalStack {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options
    this.provider = this.serverless.getProvider('aws')
    this.queuedResources = []
    this.mergedResources = {}
    this.refParameters = {}
    this.stackStatusCodes = {
      CREATE_COMPLETE: 'success',
      CREATE_IN_PROGRESS: 'in_progress',
      CREATE_FAILED: 'failure',
      DELETE_COMPLETE: 'success',
      DELETE_FAILED: 'failure',
      DELETE_IN_PROGRESS: 'in_progress',
      REVIEW_IN_PROGRESS: 'in_progress',
      ROLLBACK_COMPLETE: 'failure',
      ROLLBACK_FAILED: 'failure',
      ROLLBACK_IN_PROGRESS: 'in_progress',
      UPDATE_COMPLETE: 'success',
      UPDATE_COMPLETE_CLEANUP_IN_PROGRESS: 'in_progress',
      UPDATE_IN_PROGRESS: 'in_progress',
      UPDATE_ROLLBACK_COMPLETE: 'failure',
      UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS: 'in_progress',
      UPDATE_ROLLBACK_FAILED: 'failure',
      UPDATE_ROLLBACK_IN_PROGRESS: 'in_progress',
    }
    this.phrases = {
      create: {
        success: 'created successfully',
        failure: 'create failed',
      },
      update: {
        success: 'updated successfully',
        failure: 'updated failed',
      },
      delete: {
        success: 'removed successfully',
        failure: 'remove failed',
      },
    }
  }

  getExternalStackConfig() {
    if (!this.serverless.service.custom?.alerts) {
      return this.options['alerts-external-stack'] || ''
    }

    return (
      this.serverless.service.custom?.alerts?.externalStack ||
      this.options['alerts-external-stack'] ||
      ''
    )
  }

  getExternalStackNameSuffix() {
    return (
      (this.getExternalStackConfig() &&
        this.getExternalStackConfig().nameSuffix) ||
      '-alerts'
    )
  }

  isUsingExternalStack() {
    return !!this.getExternalStackConfig()
  }

  // Fix unresolved references occurring because of stack separation
  fixLambdaFunctionAndLogGroupReferences(
    parent,
    childKey,
    resource,
    preMergedResources,
  ) {
    // This does not check for circular references, but they shouldn't occur in CloudFormation properties
    if (Array.isArray(resource)) {
      for (let index = 0; index < resource.length; index++) {
        this.fixLambdaFunctionAndLogGroupReferences(
          resource,
          index,
          resource[index],
          preMergedResources,
        )
      }
    } else if (typeof resource === 'object') {
      for (const key in resource) {
        if (key === 'Ref' && typeof resource[key] === 'string') {
          // Found a (Lambda function) reference. See if it's unresolved.
          const refName = resource[key]
          if (!preMergedResources[refName]) {
            // It's an unresolved reference. Try to find it in the main stack.
            const mainResource =
              this.serverless.service.provider.compiledCloudFormationTemplate
                .Resources[refName]
            if (
              mainResource &&
              mainResource.Properties &&
              mainResource.Properties.FunctionName
            ) {
              // Found Lambda function in main stack, create a parameter from it.
              this.refParameters[refName] = {
                Type: 'String',
                Default: mainResource.Properties.FunctionName,
              }
            } else {
              this.serverless.cli.log(
                `Warning: Unresolved external alert stack reference: ${refName}`,
              )
            }
          }
        } else if (
          key === 'DependsOn' &&
          typeof resource[key] === 'string' &&
          parent &&
          childKey
        ) {
          // Found a dependency. See if it's unresolved.
          const refName = resource[key]
          if (!preMergedResources[refName]) {
            if (
              resource[key].endsWith('LogGroup') &&
              parent[childKey].Type === 'AWS::Logs::MetricFilter'
            ) {
              // Metric filters targetting serverless generated LogGroup resource
              // should be merged after removing DependsOn property
              delete parent[childKey].DependsOn
            } else if (
              this.serverless.service.provider.compiledCloudFormationTemplate
                .Resources[refName]
            ) {
              // It's a dependency on the main stack. We can drop it because it's already been deployed.
              delete parent[childKey]
            } else {
              this.serverless.cli.log(
                `Warning: Unresolved external alert stack dependency: ${refName}`,
              )
            }
          }
        }
        this.fixLambdaFunctionAndLogGroupReferences(
          resource,
          key,
          resource[key],
          preMergedResources,
        )
      }
    }
  }

  // This is called by the main plugin to merge alert resources to the stack
  mergeResources(resources) {
    // We queue the resources for latest processing
    this.queuedResources.push(resources)
  }

  // Here we merge the resources that were queued above
  mergeQueuedResources() {
    // Make one map of all resources so we can find unresolved references
    const preMergedResources = {}
    for (const resource of this.queuedResources) {
      Object.assign(preMergedResources, resource)
    }
    // Now find the unresolved references and create parameters from them
    for (const resource of this.queuedResources) {
      this.fixLambdaFunctionAndLogGroupReferences(
        null,
        null,
        resource,
        preMergedResources,
      )
      Object.assign(this.mergedResources, resource)
    }
  }

  afterDeployGlobal() {
    if (!this.isUsingExternalStack()) return

    // Fix unresolved references and merge resources
    this.mergeQueuedResources()

    const externalStackName =
      this.provider.naming.getStackName() + this.getExternalStackNameSuffix()

    if (!Object.keys(this.mergedResources).length) {
      // Stack is empty - delete it
      return this.deleteExternalStack(externalStackName, true)
    }
    // Stack is not empty - deploy it
    return this.deployExternalStack(externalStackName)
  }

  beforeRemoveGlobal() {
    if (!this.isUsingExternalStack()) return
    const externalStackName =
      this.provider.naming.getStackName() + this.getExternalStackNameSuffix()
    return this.deleteExternalStack(externalStackName)
  }

  describeExternalStack(externalStackName) {
    return this.provider
      .request('CloudFormation', 'describeStacks', {
        StackName: externalStackName,
      })
      .then((response) => response.Stacks && response.Stacks[0])
      .catch((err) => {
        if (err.message && err.message.match(/does not exist$/)) {
          // Stack doesn't exist yet
          return null
        }
        // Some other error, let it throw
        return Promise.reject(err)
      })
  }

  waitForExternalStack(externalStackName, operation) {
    let dots = 0
    const readMore = () =>
      this.describeExternalStack(externalStackName).then((response) => {
        if (!response) {
          // Stack does not exist
          if (dots) this.serverless.cli.consoleLog('')
          this.serverless.cli.log(
            `External alert stack ${externalStackName} removed successfully.`,
          )
          return
        }
        const state = this.stackStatusCodes[response.StackStatus]
        if (state === 'in_progress') {
          // Continue until no longer in progress
          this.serverless.cli.printDot()
          dots += 1
          return new Promise((resolve) => setTimeout(resolve, 5000)).then(
            readMore,
          )
        }
        if (dots) this.serverless.cli.consoleLog('')
        this.serverless.cli.log(
          `External alert stack ${externalStackName} ${this.phrases[operation][state]} (${response.StackStatus}).`,
        )
        if (this.stackStatusCodes[response.StackStatus] === 'failure') {
          // The operation failed, so return an error to Serverless
          return Promise.reject(
            new Error(
              `External alert stack ${externalStackName} ${this.phrases[operation][state]} (${response.StackStatus})`,
            ),
          )
        }
      })
    return readMore()
  }

  deployExternalStack(externalStackName) {
    // These options are the same for creating and updating stacks
    const externalStackConfig = this.getExternalStackConfig()
    const configResources =
      (externalStackConfig && externalStackConfig.resources) || {}
    const compiledCloudFormationTemplate = {
      AWSTemplateFormatVersion: '2010-09-09',
      Description:
        configResources.Description ||
        'External AWS CloudFormation template for alerts',
      Metadata: configResources.Metadata || undefined,
      Parameters: Object.assign(
        {},
        this.refParameters,
        configResources.Parameters || {},
      ),
      Mappings: configResources.Mappings || undefined,
      Conditions: configResources.Conditions || undefined,
      Transform: configResources.Transform || undefined,
      Resources: Object.assign(
        {},
        configResources.Resources || {},
        this.mergedResources,
      ),
      Outputs: configResources.Outputs || undefined,
    }

    // Generate tags
    const stackTags = {
      STAGE: this.options.stage || this.serverless.service.provider.stage,
    }
    if (
      typeof externalStackConfig === 'object' &&
      externalStackConfig.stackTags === 'object'
    ) {
      // Add custom tags specified only for this stack
      Object.assign(stackTags, externalStackConfig.stackTags)
    } else if (typeof this.serverless.service.provider.stackTags === 'object') {
      // Add stackTags from Serverless main provider config
      Object.assign(stackTags, this.serverless.service.provider.stackTags)
    }

    // Stack deploy parameters (optional)
    const deployParameters =
      (externalStackConfig && externalStackConfig.deployParameters) || []

    return this.describeExternalStack(externalStackName).then(
      (existingStack) => {
        if (existingStack) {
          return this.updateExternalStack(
            externalStackName,
            compiledCloudFormationTemplate,
            deployParameters,
            stackTags,
          )
        }
        return this.createExternalStack(
          externalStackName,
          compiledCloudFormationTemplate,
          deployParameters,
          stackTags,
        )
      },
    )
  }

  // From Serverless
  setServersideEncryptionOptions(putParams, deploymentBucketOptions) {
    const encryptionFields = [
      ['serverSideEncryption', 'ServerSideEncryption'],
      ['sseCustomerAlgorithim', 'SSECustomerAlgorithm'],
      ['sseCustomerKey', 'SSECustomerKey'],
      ['sseCustomerKeyMD5', 'SSECustomerKeyMD5'],
      ['sseKMSKeyId', 'SSEKMSKeyId'],
    ]

    const params = putParams

    encryptionFields.forEach((element) => {
      if (deploymentBucketOptions[element[0]]) {
        params[element[1]] = deploymentBucketOptions[element[0]]
      }
    }, this)

    return params
  }

  // From Serverless
  getS3EndpointForRegion(region) {
    const strRegion = region.toLowerCase()
    // look for govcloud - currently s3-us-gov-west-1.amazonaws.com
    if (strRegion.match(/us-gov/)) return `s3-${strRegion}.amazonaws.com`
    // look for china - currently s3.cn-north-1.amazonaws.com.cn
    if (strRegion.match(/cn-/)) return `s3.${strRegion}.amazonaws.com.cn`
    // default s3 endpoint for other regions
    return 's3.amazonaws.com'
  }

  // From Serverless
  uploadCloudFormationTemplate(compiledCloudFormationTemplate) {
    this.serverless.cli.log('Uploading external alerts template to S3...')

    const compiledTemplateFileName =
      'compiled-cloudformation-alerts-template.json'

    let params = {
      Key: `${this.serverless.service.package.artifactDirectoryName}/${compiledTemplateFileName}`,
      Body: JSON.stringify(compiledCloudFormationTemplate),
      ContentType: 'application/json',
    }

    const deploymentBucketObject =
      this.serverless.service.provider.deploymentBucketObject
    if (deploymentBucketObject) {
      params = this.setServersideEncryptionOptions(
        params,
        deploymentBucketObject,
      )
    }
    return this.provider
      .getServerlessDeploymentBucketName()
      .then((bucketName) => {
        params.Bucket = bucketName
        return this.provider.request('S3', 'upload', params)
      })
      .then(() => {
        // Return the template URL
        const s3Endpoint = this.getS3EndpointForRegion(
          this.provider.getRegion(),
        )
        const templateUrl = `https://${s3Endpoint}/${params.Bucket}/${this.serverless.service.package.artifactDirectoryName}/${compiledTemplateFileName}`
        return templateUrl
      })
  }

  createExternalStack(
    externalStackName,
    compiledCloudFormationTemplate,
    deployParameters,
    stackTags,
  ) {
    this.serverless.cli.log(
      `Creating external alert stack ${externalStackName} (${
        Object.keys(this.mergedResources).length
      } resources configured)...`,
    )

    // These are mostly the same parameters that Serverless uses in https://github.com/serverless/serverless/blob/master/lib/plugins/aws/deploy/lib/createStack.js
    const params = {
      StackName: externalStackName,
      OnFailure: 'ROLLBACK',
      Capabilities: [],
      Parameters: deployParameters || [],
      Tags: Object.keys(stackTags).map((key) => ({
        Key: key,
        Value: stackTags[key],
      })),
    }

    return Promise.resolve()
      .then(() =>
        this.uploadCloudFormationTemplate(compiledCloudFormationTemplate),
      )
      .then((templateUrl) => {
        params.TemplateURL = templateUrl
        return this.provider.request('CloudFormation', 'createStack', params)
      })
      .then(() => this.waitForExternalStack(externalStackName, 'create'))
  }

  updateExternalStack(
    externalStackName,
    compiledCloudFormationTemplate,
    deployParameters,
    stackTags,
  ) {
    this.serverless.cli.log(
      `Updating external alert stack ${externalStackName} (${
        Object.keys(this.mergedResources).length
      } resources configured)...`,
    )

    // These are the same parameters that Serverless uses in https://github.com/serverless/serverless/blob/master/lib/plugins/aws/lib/updateStack.js
    const params = {
      StackName: externalStackName,
      Capabilities: [],
      Parameters: deployParameters || [],
      Tags: Object.keys(stackTags).map((key) => ({
        Key: key,
        Value: stackTags[key],
      })),
    }

    return Promise.resolve()
      .then(() =>
        this.uploadCloudFormationTemplate(compiledCloudFormationTemplate),
      )
      .then((templateUrl) => {
        params.TemplateURL = templateUrl
        return this.provider.request('CloudFormation', 'updateStack', params)
      })
      .then(() => this.waitForExternalStack(externalStackName, 'update'))
      .then(null, (err) => {
        if (err.message && err.message.match(/^No updates/)) {
          // Stack is unchanged, ignore error
          this.serverless.cli.log(
            `External alert stack ${externalStackName} has not changed.`,
          )
          return Promise.resolve()
        }
        return Promise.reject(err)
      })
  }

  deleteExternalStack(externalStackName, becauseNoResources) {
    this.serverless.cli.log(
      `Removing external alert stack ${externalStackName}${
        becauseNoResources ? ' (no resources configured)...' : '...'
      }`,
    )
    return this.provider
      .request('CloudFormation', 'deleteStack', {
        StackName: externalStackName,
      })
      .then(() => this.waitForExternalStack(externalStackName, 'delete'))
  }
}

export default ExternalStack
