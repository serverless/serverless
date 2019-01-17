'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const globby = require('globby');
const BbPromise = require('bluebird');
const _ = require('lodash');
const normalizeFiles = require('../../lib/normalizeFiles');

module.exports = {
  checkForChanges() {
    this.serverless.service.provider.shouldNotDeploy = false;

    if (this.options.force) {
      return this.checkLogGroupSubscriptionFilterResourceLimitExceeded();
    }

    return BbPromise.bind(this)
      .then(this.getMostRecentObjects)
      .then(this.getObjectMetadata)
      .then(this.checkIfDeploymentIsNecessary)
      .then(() => {
        if (this.serverless.service.provider.shouldNotDeploy) {
          return BbPromise.resolve();
        }

        // perform the subscription filter checking only if a deployment is required
        return this.checkLogGroupSubscriptionFilterResourceLimitExceeded();
      });
  },

  getMostRecentObjects() {
    const service = this.serverless.service.service;

    const params = {
      Bucket: this.bucketName,
      Prefix: `${this.provider.getDeploymentPrefix()}/${service}/${this.provider.getStage()}`,
    };

    return this.provider.request('S3',
      'listObjectsV2',
      params
    ).catch((reason) => {
      if (!_.includes(reason.message, 'The specified bucket does not exist')) {
        return BbPromise.reject(reason);
      }
      const stackName = this.provider.naming.getStackName();
      return BbPromise.reject(new this.serverless.classes.Error([
        `The serverless deployment bucket "${params.Bucket}" does not exist.`,
        `Create it manually if you want to reuse the CloudFormation stack "${stackName}",`,
        'or delete the stack if it is no longer required.',
      ].join(' ')));
    }).then((result) => {
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

  getObjectMetadata(objects) {
    if (objects && objects.length) {
      const headObjectObjects = objects
        .map((obj) => this.provider.request('S3',
          'headObject',
          {
            Bucket: this.bucketName,
            Key: obj.Key,
          }
        ));

      return BbPromise.all(headObjectObjects)
        .then((result) => result);
    }

    return BbPromise.resolve([]);
  },

  checkIfDeploymentIsNecessary(objects) {
    if (objects && objects.length) {
      const remoteHashes = objects.map((object) => object.Metadata.filesha256 || '');

      const serverlessDirPath = path.join(this.serverless.config.servicePath, '.serverless');

      // create a hash of the CloudFormation body
      const compiledCfTemplate = this.serverless.service.provider.compiledCloudFormationTemplate;
      const normCfTemplate = normalizeFiles.normalizeCloudFormationTemplate(compiledCfTemplate);
      const localCfHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(normCfTemplate))
        .digest('base64');

      // create hashes for all the zip files
      const zipFiles = globby.sync(['**.zip'], { cwd: serverlessDirPath, dot: true, silent: true });
      const zipFilePaths = zipFiles.map((zipFile) => path.join(serverlessDirPath, zipFile));
      const zipFileHashes = zipFilePaths.map((zipFilePath) => {
        // TODO refactor to be async (use util function to compute checksum async)
        const zipFile = fs.readFileSync(zipFilePath);
        return crypto.createHash('sha256').update(zipFile).digest('base64');
      });

      const localHashes = zipFileHashes;
      localHashes.push(localCfHash);

      if (_.isEqual(remoteHashes.sort(), localHashes.sort())) {
        this.serverless.service.provider.shouldNotDeploy = true;

        const message = [
          'Service files not changed. Skipping deployment...',
        ].join('');
        this.serverless.cli.log(message);
      }
    }

    return BbPromise.resolve();
  },

  /**
   * @description Cloudwatch imposes a hard limit of 1 subscription filter per log group.
   * If we change a cloudwatchLog event entry to add a subscription filter to a log group
   * that already had one before, it will throw an error because CloudFormation firstly
   * tries to create and replace the new subscription filter (therefore hitting the limit)
   * before deleting the old one. This precompile process aims to delete existent
   * subscription filters of functions that a new filter was provided, by checking the
   * current ARN with the new one that will be generated.
   * See: https://git.io/fpKCM
  */
  checkLogGroupSubscriptionFilterResourceLimitExceeded() {
    const region = this.provider.getRegion();
    const serviceName = this.serverless.service.getServiceName();
    const stage = this.provider.getStage();
    const cloudWatchLogsSdk = new this.provider.sdk.CloudWatchLogs({ region });

    return this.provider.getAccountId()
      .then(accountId =>
        Promise.all(this.serverless.service.getAllFunctions().map((functionName) => {
          const functionObj = this.serverless.service.getFunction(functionName);

          if (!functionObj.events) {
            return BbPromise.resolve();
          }

          const promises = functionObj.events.map((event) => {
            if (!event.cloudwatchLog) {
              return BbPromise.resolve();
            }

            let logGroupName;

            /*
              it isn't necessary to run sanity checks here as they already happened during the
              compile step
            */
            if (typeof event.cloudwatchLog === 'object') {
              logGroupName = event.cloudwatchLog.logGroup.replace(/\r?\n/g, '');
            } else {
              logGroupName = event.cloudwatchLog.replace(/\r?\n/g, '');
            }

            /*
              return a new promise that will check the resource limit exceeded and will fix it if
              the option is enabled
            */
            return this.fixLogGroupSubscriptionFilters({
              cloudWatchLogsSdk,
              accountId,
              logGroupName,
              functionName,
              region,
              serviceName,
              stage,
            });
          });

          return Promise.all(promises);
        })));
  },

  fixLogGroupSubscriptionFilters(params) {
    const cloudWatchLogsSdk = params.cloudWatchLogsSdk;
    const accountId = params.accountId;
    const logGroupName = params.logGroupName;
    const functionName = params.functionName;
    const region = params.region;
    const serviceName = params.serviceName;
    const stage = params.stage;

    return cloudWatchLogsSdk.describeSubscriptionFilters({ logGroupName }).promise()
      .then((response) => {
        const subscriptionFilter = response.subscriptionFilters[0];

        // log group doesn't have any subscription filters currently
        if (!subscriptionFilter) {
          return false;
        }

        const oldDestinationArn = subscriptionFilter.destinationArn;
        const filterName = subscriptionFilter.filterName;
        const newDestinationArn =
          `arn:aws:lambda:${region}:${accountId}:function:${serviceName}-${stage}-${functionName}`;

        // everything is fine, just return
        if (oldDestinationArn === newDestinationArn) {
          return false;
        }

        /*
          If the destinations functions' ARNs doesn't match, we need to delete the current
          subscription filter to prevent the resource limit exceeded error to happen
        */
        return cloudWatchLogsSdk
          .deleteSubscriptionFilter({ logGroupName, filterName }).promise();
      })
      /*
        it will throw when trying to get subscription filters of a log group that was just added
        to the serverless.yml (therefore not created in AWS yet), we can safely ignore this error
      */
      .catch(() => undefined);
  },
};
