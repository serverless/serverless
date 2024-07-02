import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import globby from 'globby'
import _ from 'lodash'
import normalizeFiles from '../../lib/normalize-files.js'
import ServerlessError from '../../../../serverless-error.js'
import utils from '@serverlessinc/sf-core/src/utils.js'

const { log } = utils
const fsp = fs.promises

const isDeploymentDirToken = RegExp.prototype.test.bind(
  /^[\d]+-\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
)
const isOtelExtensionName = RegExp.prototype.test.bind(
  /^sls-otel\.\d+\.\d+\.\d+\.zip$/,
)

export default {
  async checkForChanges() {
    const logger = log.get('check-for-changes')
    this.serverless.service.provider.shouldNotDeploy = false
    if (this.options.force) {
      logger.debug('deployment forced - deploy')
      return this.checkLogGroupSubscriptionFilterResourceLimitExceeded()
    }

    return Promise.resolve(this)
      .then(() => this.getMostRecentObjects())
      .then((objs) => {
        return Promise.all([
          this.getObjectMetadata(objs),
          this.getFunctionsEarliestLastModifiedDate(),
        ])
      })
      .then(([objMetadata, lastModifiedDate]) =>
        this.checkIfDeploymentIsNecessary(objMetadata, lastModifiedDate),
      )
      .then(() => {
        if (this.serverless.service.provider.shouldNotDeploy) {
          return Promise.resolve()
        }

        // perform the subscription filter checking only if a deployment is required
        return this.checkLogGroupSubscriptionFilterResourceLimitExceeded()
      })
  },

  async getMostRecentObjects() {
    const service = this.serverless.service.service

    const params = {
      Bucket: this.bucketName,
      Prefix: `${this.provider.getDeploymentPrefix()}/${service}/${this.provider.getStage()}/`,
    }

    const result = await (async () => {
      try {
        return await this.provider.request('S3', 'listObjectsV2', params)
      } catch (error) {
        if (!error.message.includes('The specified bucket does not exist'))
          throw error
        const stackName = this.provider.naming.getStackName()
        throw new ServerlessError(
          [
            `The serverless deployment bucket "${params.Bucket}" does not exist.`,
            `Create it manually if you want to reuse the CloudFormation stack "${stackName}",`,
            'or delete the stack if it is no longer required.',
          ].join(' '),
          'DEPLOYMENT_BUCKET_DOES_NOT_EXIST',
        )
      }
    })()
    const objects = result.Contents.filter(({ Key: key }) =>
      isDeploymentDirToken(key.split('/')[3]),
    )
    if (!objects.length) return []

    const ordered = _.orderBy(objects, ['Key'], ['desc'])

    const firstKey = ordered[0].Key
    const directory = firstKey.substring(0, firstKey.lastIndexOf('/'))

    return ordered.filter((obj) => {
      const objKey = obj.Key
      const objDirectory = objKey.substring(0, objKey.lastIndexOf('/'))

      return directory === objDirectory
    })
  },

  // Gives the least recent last modify date across all the functions in the service.
  async getFunctionsEarliestLastModifiedDate() {
    const logger = log.get('check-for-changes')
    let couldNotAccessFunction = false
    const getFunctionResults = this.serverless.service
      .getAllFunctions()
      .map((funName) => {
        const functionObj = this.serverless.service.getFunction(funName)
        return this.provider
          .request('Lambda', 'getFunction', {
            FunctionName: functionObj.name,
          })
          .then((res) => new Date(res.Configuration.LastModified))
          .catch((err) => {
            if (err.providerError && err.providerError.statusCode === 403) {
              couldNotAccessFunction = true
            }
            return new Date(0)
          }) // Function is missing, needs to be deployed
      })

    return Promise.all(getFunctionResults).then((results) => {
      if (couldNotAccessFunction) {
        logger.warning(
          'Not authorized to perform: lambda:GetFunction for at least one of the lambda functions. Deployment will not be skipped even if service files did not change.',
        )
      }

      return results.reduce((currentMin, date) => {
        if (!currentMin || date < currentMin) return date
        return currentMin
      }, null)
    })
  },

  async getObjectMetadata(objects) {
    return Promise.all(
      objects.map(async (obj) => {
        try {
          const result = await this.provider.request('S3', 'headObject', {
            Bucket: this.bucketName,
            Key: obj.Key,
          })
          result.Key = obj.Key
          return result
        } catch (err) {
          if (err.code === 'AWS_S3_HEAD_OBJECT_FORBIDDEN') {
            throw new ServerlessError(
              'Could not access objects in the deployment bucket. Make sure you have sufficient permissions to access it.',
              err.code,
            )
          }
          throw err
        }
      }),
    )
  },

  async checkIfDeploymentIsNecessary(objects, funcLastModifiedDate) {
    const logger = log.get('check-for-changes')
    if (!objects.length) {
      logger.debug('no objects to compare - deploy')
      return
    }
    const remoteHashesMap = new Map()
    for (const {
      Key: name,
      Metadata: { filesha256: hash },
    } of objects) {
      remoteHashesMap.set(name, hash)
    }

    const serverlessDirPath = path.join(
      this.serverless.serviceDir,
      '.serverless',
    )

    // create a hash of the CloudFormation body
    const compiledCfTemplate =
      this.serverless.service.provider.compiledCloudFormationTemplate
    const stateBasename = this.provider.naming.getServiceStateFileName()
    const stateObject = JSON.parse(
      await fsp.readFile(
        path.join(this.serverless.serviceDir, '.serverless', stateBasename),
        'utf-8',
      ),
    )

    const localHashesMap = new Map([
      [
        'compiled-cloudformation-template.json',
        crypto
          .createHash('sha256')
          .update(
            JSON.stringify(
              normalizeFiles.normalizeCloudFormationTemplate(
                compiledCfTemplate,
              ),
            ),
          )
          .digest('base64'),
      ],
      [
        stateBasename,
        crypto
          .createHash('sha256')
          .update(JSON.stringify(normalizeFiles.normalizeState(stateObject)))
          .digest('base64'),
      ],
    ])

    // create hashes for all the zip files
    const zipFiles = globby
      .sync(['**.zip'], { cwd: serverlessDirPath, dot: true, silent: true })
      .filter((basename) => !isOtelExtensionName(basename))
    if (this.serverless.service.package.artifact) {
      zipFiles.push(
        path.resolve(
          this.serverless.serviceDir,
          this.serverless.service.package.artifact,
        ),
      )
    }
    // resolve paths and ensure we only hash each unique file once.
    const zipFilePaths = Array.from(
      new Set(
        zipFiles.map((zipFile) => path.resolve(serverlessDirPath, zipFile)),
      ),
    )

    await Promise.all(
      zipFilePaths.map((zipFilePath) =>
        fsp.readFile(zipFilePath).then((zipFile) => {
          localHashesMap.set(
            zipFilePath,
            crypto.createHash('sha256').update(zipFile).digest('base64'),
          )
        }),
      ),
    )

    // If any objects were changed after the last time the function was updated
    // there could have been a failed deploy.
    const changedAfterDeploy = objects.some((object) => {
      return object.LastModified && object.LastModified > funcLastModifiedDate
    })

    if (changedAfterDeploy) {
      logger.debug(
        'function modification dates changed after last deploy - deploy',
      )
      return
    }
    logger.debug(
      'artifacts on S3 (%o) and locally (%o)',
      remoteHashesMap,
      localHashesMap,
    )

    if (
      _.isEqual(
        Array.from(remoteHashesMap.values()).sort(),
        Array.from(localHashesMap.values()).sort(),
      )
    ) {
      logger.debug('no changes detected - do not deploy')
      this.serverless.service.provider.shouldNotDeploy = true
      return
    }
    logger.debug('different artifacts resolved - deploy')
  },

  /**
   * @description Cloudwatch imposes a hard limit of 2 subscription filter per log group.
   * If we change a cloudwatchLog event entry to add a subscription filter to a log group
   * that already had two before, it will throw an error because CloudFormation firstly
   * tries to create and replace the new subscription filter (therefore hitting the limit)
   * before deleting the old one. This precompile process aims to delete existent
   * subscription filters of functions that a new filter was provided, by checking the
   * current ARN with the new one that will be generated.
   * See: https://github.com/serverless/serverless/issues/3447
   */
  async checkLogGroupSubscriptionFilterResourceLimitExceeded() {
    const logger = log.get('check-for-changes')
    const region = this.provider.getRegion()

    const account = await this.provider.getAccountInfo()
    const accountId = account.accountId
    const partition = account.partition

    const functionNames = await this.serverless.service.getAllFunctions()

    const cloudwatchLogEvents = functionNames
      .map((functionName) => {
        const functionObj = this.serverless.service.getFunction(functionName)
        const FunctionName = functionObj.name
        const events = functionObj.events
        let logSubscriptionSerialNumber = 0
        return events
          .filter((event) => !!event.cloudwatchLog)
          .map((event) => {
            const rawLogGroupName =
              event.cloudwatchLog.logGroup || event.cloudwatchLog
            const logGroupName = rawLogGroupName.replace(/\r?\n/g, '')

            logSubscriptionSerialNumber++

            return {
              FunctionName,
              functionName,
              logGroupName,
              logSubscriptionSerialNumber,
            }
          })
      })
      .flat()

    const cloudwatchLogEventsMap = _.groupBy(
      cloudwatchLogEvents,
      'logGroupName',
    )
    const logGroupNames = Object.keys(cloudwatchLogEventsMap)
    if (!logGroupNames.length) {
      logger.debug('no log groups to investigate')
      return
    }

    await Promise.all(
      logGroupNames.map((logGroupName) =>
        this.fixLogGroupSubscriptionFilters({
          accountId,
          region,
          partition,
          logGroupName,
          cloudwatchLogEvents: cloudwatchLogEventsMap[logGroupName],
        }),
      ),
    )
  },

  async fixLogGroupSubscriptionFilters(params) {
    const logger = log.get('check-for-changes')
    const accountId = params.accountId
    const region = params.region
    const partition = params.partition
    const logGroupName = params.logGroupName
    const cloudwatchLogEvents = params.cloudwatchLogEvents
    const CLOUDWATCHLOG_LOG_GROUP_EVENT_PER_FUNCTION_LIMIT = 2

    const response = await this.provider
      .request(
        'CloudWatchLogs',
        'describeSubscriptionFilters',
        { logGroupName },
        { useCache: true },
      )
      .catch(() => ({ subscriptionFilters: [] }))
    if (response.subscriptionFilters.length === 0) {
      logger.debug('no subscription filters detected')
      return false
    }

    const stackName = this.provider.naming.getStackName()
    const oldSubscriptionFilters = await Promise.all(
      response.subscriptionFilters.map(async (subscriptionFilter) => {
        const { destinationArn, filterName } = subscriptionFilter
        const logicalId = this.getLogicalIdFromFilterName(filterName)
        const isInternal = await this.isInternalSubscriptionFilter(
          stackName,
          logicalId,
          filterName,
        )

        return { destinationArn, logicalId, filterName, isInternal }
      }),
    )

    const newSubscriptionFilters = cloudwatchLogEvents.map(
      (cloudwatchLogEvent) => {
        const destinationArn = `arn:${partition}:lambda:${region}:${accountId}:function:${cloudwatchLogEvent.FunctionName}`
        const logicalId = this.provider.naming.getCloudWatchLogLogicalId(
          cloudwatchLogEvent.functionName,
          cloudwatchLogEvent.logSubscriptionSerialNumber,
        )

        return { destinationArn, logicalId }
      },
    )
    logger.debug('new subscription filters %o', newSubscriptionFilters)

    // If subscription filters defined externally cause a situation where we cannot create all
    // subscription filters defined as a part of current service, we want to throw an error
    // instead of silently removing external filters.
    const externalOldSubscriptionFilters = oldSubscriptionFilters.filter(
      (oldSubscriptionFilter) => !oldSubscriptionFilter.isInternal,
    )
    logger.debug(
      'external subscription filters %o',
      externalOldSubscriptionFilters,
    )
    if (
      externalOldSubscriptionFilters.length + newSubscriptionFilters.length >
      CLOUDWATCHLOG_LOG_GROUP_EVENT_PER_FUNCTION_LIMIT
    ) {
      const errorMessage = [
        `Only ${CLOUDWATCHLOG_LOG_GROUP_EVENT_PER_FUNCTION_LIMIT} subscription filters can be configured per log group.`,
        ` There are subscription filters defined outside of the service definition for "${logGroupName}" that have to be deleted manually.`,
      ].join('')
      throw new ServerlessError(
        errorMessage,
        'CLOUDWATCHLOG_LOG_GROUP_EVENT_PER_FUNCTION_LIMIT_EXCEEDED',
      )
    }

    const sameDestinationArn = (sf1, sf2) =>
      sf1.destinationArn === sf2.destinationArn
    const sameLogicalId = (sf1, sf2) => sf1.logicalId === sf2.logicalId
    const subscriptionFilterComparator = (sf1, sf2) =>
      sameDestinationArn(sf1, sf2) && sameLogicalId(sf1, sf2)

    const internalOldSubscriptionFilters = oldSubscriptionFilters.filter(
      (oldSubscriptionFilter) => oldSubscriptionFilter.isInternal,
    )
    const notMatchedInternalOldSubscriptionFilters =
      internalOldSubscriptionFilters.filter((internalOldSubscriptionFilter) => {
        const matchNewSubscriptionFilter = newSubscriptionFilters.find(
          (newSubscriptionFilter) =>
            subscriptionFilterComparator(
              newSubscriptionFilter,
              internalOldSubscriptionFilter,
            ),
        )
        return !matchNewSubscriptionFilter
      })

    return Promise.all(
      notMatchedInternalOldSubscriptionFilters.map((oldSubscriptionFilter) =>
        this.provider.request('CloudWatchLogs', 'deleteSubscriptionFilter', {
          logGroupName,
          filterName: oldSubscriptionFilter.filterName,
        }),
      ),
    )
  },

  getLogicalIdFromFilterName(filterName) {
    // Filter name format:
    // {stack name}-{logical id}-{random alphanumeric characters}
    // Note that the stack name can include hyphens
    const split = filterName.split('-')
    return split[split.length - 2]
  },

  async isInternalSubscriptionFilter(
    stackName,
    logicalResourceId,
    physicalResourceId,
  ) {
    try {
      const { StackResourceDetail } = await this.provider.request(
        'CloudFormation',
        'describeStackResource',
        {
          StackName: stackName,
          LogicalResourceId: logicalResourceId,
        },
      )

      return physicalResourceId === StackResourceDetail.PhysicalResourceId
    } catch {
      return false
    }
  },
}
