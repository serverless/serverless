'use strict';

const setBucketName = require('../lib/setBucketName');
const uploadArtifacts = require('../deploy/lib/uploadArtifacts');
const checkForChanges = require('../deploy/lib/checkForChanges');
const createChangeSet = require('./lib/createChangeSet');
const generateChangesetArtifactDirectoryName = require('./lib/generateChangesetArtifactDirectoryName');
const waitForChangeSetCreateComplete = require('./lib/waitForChangeSetCreateComplete');
const runAnalysis = require('./lib/runAnalysis');
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
      generateChangesetArtifactDirectoryName,
      waitForChangeSetCreateComplete,
      runAnalysis,
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
        lifecycleEvents: ['plan'],
      },
    };

    this.hooks = {
      'plan:plan': () =>
        this.setBucketName()
          .catch(error => {
            this.serverless.cli.log('unable to get bucket name');
            this.serverless.cli.log('"plan" runs only on deployed projects');
            throw error;
          })
          .then(() => this.generateChangesetArtifactDirectoryName())
          .then(() => this.serverless.pluginManager.spawn('package'))
          .then(() => this.checkForChanges())
          .then(() => {
            if (this.serverless.service.provider.shouldNotDeploy) {
              return Promise.resolve();
            }
            return this.uploadCloudFormationFile()
              .then(() => this.createChangeSet())
              .then(() => this.waitForChangeSetCreateComplete())
              .then(() => this.runAnalysis())
              .then(() => this.deleteChangeSet())
              .then(() => this.deleteChangeSetFromS3());
          }),
    };
  }
}

module.exports = AwsPlan;
