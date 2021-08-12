'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const globby = require('globby');
const BbPromise = require('bluebird');
const _ = require('lodash');
const normalizeFiles = require('../../lib/normalizeFiles');
const ServerlessError = require('../../../../serverless-error');

module.exports = {
  async checkForChanges() {
    this.serverless.service.provider.shouldNotDeploy = false;

    if (this.options.force) {
      return this.checkLogGroupSubscriptionFilterResourceLimitExceeded();
    }

    return BbPromise.bind(this)
      .then(this.getMostRecentObjects)
      .then((objs) => {
        return BbPromise.all([
          this.getObjectMetadata(objs),
          this.getFunctionsEarliestLastModifiedDate(),
        ]);
      })
      .then(([objMetadata, lastModifiedDate]) =>
        this.checkIfDeploymentIsNecessary(objMetadata, lastModifiedDate)
      )
      .then(() => {
        if (this.serverless.service.provider.shouldNotDeploy) {
          return BbPromise.resolve();
        }

        // perform the subscription filter checking only if a deployment is required
        return this.checkLogGroupSubscriptionFilterResourceLimitExceeded();
      });
  },

  async getMostRecentObjects() {
    const service = this.serverless.service.service;

    const params = {
      Bucket: this.bucketName,
      Prefix: `${this.provider.getDeploymentPrefix()}/${service}/${this.provider.getStage()}`,
    };

    return this.provider
      .request('S3', 'listObjectsV2', params)
      .catch((reason) => {
        if (!reason.message.includes('The specified bucket does not exist')) {
          return BbPromise.reject(reason);
        }
        const stackName = this.provider.naming.getStackName();
        return BbPromise.reject(
          new ServerlessError(
            [
              `The serverless deployment bucket "${params.Bucket}" does not exist.`,
              `Create it manually if you want to reuse the CloudFormation stack "${stackName}",`,
              'or delete the stack if it is no longer required.',
            ].join(' '),
            'DEPLOYMENT_BUCKET_DOES_NOT_EXIST'
          )
        );
      })
      .then((result) => {
        if (result && result.Contents && result.Contents.length) {
          const objects = result.Contents;

          const ordered = _.orderBy(objects, ['Key'], ['desc']);

          const firstKey = ordered[0].Key;
          const directory = firstKey.substring(0, firstKey.lastIndexOf('/'));

          const mostRecentObjects = ordered.filter((obj) => {
            const objKey = obj.Key;
            const objDirectory = objKey.substring(0, objKey.lastIndexOf('/'));

            return directory === objDirectory;
          });

          return BbPromise.resolve(mostRecentObjects);
        }

        return BbPromise.resolve([]);
      });
  },

  // Gives the least recent last modify date across all the functions in the service.
  async getFunctionsEarliestLastModifiedDate() {
    let couldNotAccessFunction = false;
    const getFunctionResults = this.serverless.service.getAllFunctions().map((funName) => {
      const functionObj = this.serverless.service.getFunction(funName);
      return this.provider
        .request('Lambda', 'getFunction', {
          FunctionName: functionObj.name,
        })
        .then((res) => new Date(res.Configuration.LastModified))
        .catch((err) => {
          if (err.providerError && err.providerError.statusCode === 403) {
            couldNotAccessFunction = true;
          }
          return new Date(0);
        }); // Function is missing, needs to be deployed
    });

    return BbPromise.all(getFunctionResults).then((results) => {
      if (couldNotAccessFunction) {
        this.serverless.cli.log(
          [
            'WARNING: Not authorized to perform: lambda:GetFunction for at least one of the lambda functions.',
            ' Deployment will not be skipped even if service files did not change. ',
          ].join(''),
          'Serverless',
          { color: 'orange' }
        );
      }

      return results.reduce((currentMin, date) => {
        if (!currentMin || date < currentMin) return date;
        return currentMin;
      }, null);
    });
  },

  async getObjectMetadata(objects) {
    if (objects && objects.length) {
      const headObjectObjects = objects.map((obj) =>
        this.provider.request('S3', 'headObject', {
          Bucket: this.bucketName,
          Key: obj.Key,
        })
      );

      return BbPromise.all(headObjectObjects).then((result) => result);
    }

    return BbPromise.resolve([]);
  },

  async checkIfDeploymentIsNecessary(objects, funcLastModifiedDate) {
    if (objects && objects.length) {
      const remoteHashes = objects.map((object) => object.Metadata.filesha256 || '');

      const serverlessDirPath = path.join(this.serverless.serviceDir, '.serverless');

      // create a hash of the CloudFormation body
      const compiledCfTemplate = this.serverless.service.provider.compiledCloudFormationTemplate;
      const normCfTemplate = normalizeFiles.normalizeCloudFormationTemplate(compiledCfTemplate);
      const localCfHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(normCfTemplate))
        .digest('base64');

      // create hashes for all the zip files
      const zipFiles = globby.sync(['**.zip'], { cwd: serverlessDirPath, dot: true, silent: true });
      if (this.serverless.service.package.artifact) {
        zipFiles.push(
          path.resolve(this.serverless.serviceDir, this.serverless.service.package.artifact)
        );
      }
      // resolve paths and ensure we only hash each unique file once.
      const zipFilePaths = Array.from(
        new Set(zipFiles.map((zipFile) => path.resolve(serverlessDirPath, zipFile)))
      );

      const readFile = BbPromise.promisify(fs.readFile);
      const zipFileHashesPromises = zipFilePaths.map((zipFilePath) =>
        readFile(zipFilePath).then((zipFile) =>
          crypto.createHash('sha256').update(zipFile).digest('base64')
        )
      );

      return BbPromise.all(zipFileHashesPromises).then((zipFileHashes) => {
        const localHashes = zipFileHashes;
        localHashes.push(localCfHash);

        // If any objects were changed after the last time the function was updated
        // there could have been a failed deploy.
        const changedAfterDeploy = objects.some((object) => {
          return object.LastModified && object.LastModified > funcLastModifiedDate;
        });

        if (!changedAfterDeploy && _.isEqual(remoteHashes.sort(), localHashes.sort())) {
          this.serverless.service.provider.shouldNotDeploy = true;

          const message = ['Service files not changed. Skipping deployment...'].join('');
          this.serverless.cli.log(message, 'Serverless', { color: 'orange' });
        }
      });
    }

    return BbPromise.resolve();
  },

  /**
   * @description Cloudwatch imposes a hard limit of 2 subscription filter per log group.
   * If we change a cloudwatchLog event entry to add a subscription filter to a log group
   * that already had two before, it will throw an error because CloudFormation firstly
   * tries to create and replace the new subscription filter (therefore hitting the limit)
   * before deleting the old one. This precompile process aims to delete existent
   * subscription filters of functions that a new filter was provided, by checking the
   * current ARN with the new one that will be generated.
   * See: https://git.io/fpKCM
   */
  async checkLogGroupSubscriptionFilterResourceLimitExceeded() {
    const region = this.provider.getRegion();

    const account = await this.provider.getAccountInfo();
    const accountId = account.accountId;
    const partition = account.partition;

    const functionNames = await this.serverless.service.getAllFunctions();
    const cloudwatchLogEvents = _.flatten(
      functionNames.map((functionName) => {
        const functionObj = this.serverless.service.getFunction(functionName);
        const FunctionName = functionObj.name;
        const events = functionObj.events;
        let logSubscriptionSerialNumber = 0;
        return events
          .filter((event) => !!event.cloudwatchLog)
          .map((event) => {
            const rawLogGroupName = event.cloudwatchLog.logGroup || event.cloudwatchLog;
            const logGroupName = rawLogGroupName.replace(/\r?\n/g, '');

            logSubscriptionSerialNumber++;

            return { FunctionName, functionName, logGroupName, logSubscriptionSerialNumber };
          });
      })
    );

    const cloudwatchLogEventsMap = _.groupBy(cloudwatchLogEvents, 'logGroupName');
    const logGroupNames = Object.keys(cloudwatchLogEventsMap);

    return Promise.all(
      logGroupNames.map((logGroupName) =>
        this.fixLogGroupSubscriptionFilters({
          accountId,
          region,
          partition,
          logGroupName,
          cloudwatchLogEvents: cloudwatchLogEventsMap[logGroupName],
        })
      )
    );
  },

  async fixLogGroupSubscriptionFilters(params) {
    const accountId = params.accountId;
    const region = params.region;
    const partition = params.partition;
    const logGroupName = params.logGroupName;
    const cloudwatchLogEvents = params.cloudwatchLogEvents;
    const CLOUDWATCHLOG_LOG_GROUP_EVENT_PER_FUNCTION_LIMIT = 2;

    const response = await this.provider
      .request(
        'CloudWatchLogs',
        'describeSubscriptionFilters',
        { logGroupName },
        { useCache: true }
      )
      .catch(() => ({ subscriptionFilters: [] }));
    if (response.subscriptionFilters.length === 0) {
      return false;
    }

    const oldSubscriptionFilters = response.subscriptionFilters.map((subscriptionFilter) => ({
      ...subscriptionFilter,
      logicalId: this.getLogicalIdFromFilterName(subscriptionFilter.filterName),
    }));

    const newSubscriptionFilters = cloudwatchLogEvents.map((cloudwatchLogEvent) => {
      const destinationArn = `arn:${partition}:lambda:${region}:${accountId}:function:${cloudwatchLogEvent.FunctionName}`;
      const logicalId = this.provider.naming.getCloudWatchLogLogicalId(
        cloudwatchLogEvent.functionName,
        cloudwatchLogEvent.logSubscriptionSerialNumber
      );

      return {
        destinationArn,
        logicalId,
      };
    });

    const sameDestinationArn = (sf1, sf2) => sf1.destinationArn === sf2.destinationArn;
    const sameLogicalId = (sf1, sf2) => sf1.logicalId === sf2.logicalId;

    // Old subscription filters which don't have the same destination as any of the new subscription filters.
    // Currently, these kinds of subscription filters are deleted.
    // In the future, the behavior will change to not delete filters that were set up externally.
    const notMatchedOldSubscriptionFilters = oldSubscriptionFilters.filter(
      (oldSubscriptionFilter) => {
        const destinationMatchNewSubscriptionFilter = newSubscriptionFilters.find(
          (newSubscriptionFilter) =>
            sameDestinationArn(newSubscriptionFilter, oldSubscriptionFilter)
        );
        return !destinationMatchNewSubscriptionFilter;
      }
    );

    const numOfSubscriptionFiltersToDelete =
      notMatchedOldSubscriptionFilters.length +
      newSubscriptionFilters.length -
      CLOUDWATCHLOG_LOG_GROUP_EVENT_PER_FUNCTION_LIMIT;
    if (numOfSubscriptionFiltersToDelete > 0) {
      await Promise.all(
        notMatchedOldSubscriptionFilters
          .slice(0, numOfSubscriptionFiltersToDelete)
          .map((oldSubscriptionFilter) =>
            this.provider.request('CloudWatchLogs', 'deleteSubscriptionFilter', {
              logGroupName,
              filterName: oldSubscriptionFilter.filterName,
            })
          )
      );
    }

    // Old subscription filters which have same destination with one of the new subscription filter, but index of log event in function has been changed.
    // If log event order changed, we should delete old subscription filters before creation.
    const logEventOrderChangedOldSubscriptionFilters = oldSubscriptionFilters.filter(
      (oldSubscriptionFilter) => {
        const logEventOrderChangedNewSubscriptionFilter = newSubscriptionFilters.find(
          (newSubscriptionFilter) =>
            sameDestinationArn(newSubscriptionFilter, oldSubscriptionFilter) &&
            !sameLogicalId(newSubscriptionFilter, oldSubscriptionFilter)
        );
        return logEventOrderChangedNewSubscriptionFilter;
      }
    );
    return Promise.all(
      logEventOrderChangedOldSubscriptionFilters.map((oldSubscriptionFilter) =>
        this.provider.request('CloudWatchLogs', 'deleteSubscriptionFilter', {
          logGroupName,
          filterName: oldSubscriptionFilter.filterName,
        })
      )
    );
  },

  getLogicalIdFromFilterName(filterName) {
    // Filter name format:
    // {stack name}-{logical id}-{random alphanumeric characters}
    // Note that the stack name can include hyphens
    const split = filterName.split('-');
    return split[split.length - 2];
  },
};
