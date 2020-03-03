'use strict';

const BbPromise = require('bluebird');
const setBucketName = require('../lib/setBucketName');
const uploadArtifacts = require('../deploy/lib/uploadArtifacts');
const checkForChanges = require('../deploy/lib/checkForChanges');
const createChangeSet = require('./lib/createChangeSet');
const waitForChangeSetCreateComplete = require('./lib/waitForChangeSetCreateComplete');
const runAnalysis = require('./lib/runAnalysis');
const printAnalysis = require('./lib/printAnalysis');
const deleteChangeSet = require('./lib/deleteChangeSet');
const deleteChangeSetFromS3 = require('./lib/deleteChangeSetFromS3');

class AwsPlan {
  constructor(serverless, options) {
    Object.assign(
      this,
      setBucketName,
      checkForChanges,
      uploadArtifacts,
      createChangeSet,
      waitForChangeSetCreateComplete,
      runAnalysis,
      printAnalysis,
      deleteChangeSet,
      deleteChangeSetFromS3
    );

    this.serverless = serverless;
    this.options = options;
    this.planning = false;
    this.provider = this.serverless.getProvider('aws');
    this.commands = {
      type: 'entrypoint',
      plan: {
        lifecycleEvents: [
          'package',
          'checkForChanges',
          'uploadCloudFormationFile',
          'createChangeSet',
          'waitForChangeSetCreateComplete',
          'runAnalysis',
          'deleteChangeSet',
          'deleteChangeSetFromS3',
          'printAnalysis',
        ],
      },
    };

    this.hooks = {
      'before:plan:package': () =>
        BbPromise.bind(this)
          .then(this.setBucketName)
          .catch(error => {
            this.serverless.cli.log('unable to get bucket name');
            this.serverless.cli.log('"plan" runs only on deployed projects');
            throw error;
          }),
      'plan:package': () => {
        return this.serverless.pluginManager.spawn('package');
      },
      'plan:checkForChanges': () =>
        BbPromise.bind(this)
          .then(this.checkForChanges)
          .then(() => {
            if (this.serverless.service.provider.shouldNotDeploy) {
              return BbPromise.reject(
                new this.serverless.classes.Error('Service files not changed')
              );
            }
            return BbPromise.resolve();
          }),
      'plan:uploadCloudFormationFile': () =>
        BbPromise.bind(this).then(this.uploadCloudFormationFile),
      'plan:createChangeSet': () => BbPromise.bind(this).then(this.createChangeSet),
      'plan:waitForChangeSetCreateComplete': () =>
        BbPromise.bind(this).then(this.waitForChangeSetCreateComplete),
      'plan:runAnalysis': () => BbPromise.bind(this).then(this.runAnalysis),
      'plan:deleteChangeSet': () => BbPromise.bind(this).then(this.deleteChangeSet),
      'plan:deleteChangeSetFromS3': () => BbPromise.bind(this).then(this.deleteChangeSetFromS3),
      'plan:printAnalysis': () => BbPromise.bind(this).then(this.printAnalysis),
    };
  }
}

module.exports = AwsPlan;
