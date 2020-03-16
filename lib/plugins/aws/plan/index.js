'use strict';

const BbPromise = require('bluebird');
const setBucketName = require('../lib/setBucketName');
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
        lifecycleEvents: ['deploy'],
      },
    };

    this.hooks = {
      'plan:deploy': () => {
        this.planning = true;
        return this.serverless.pluginManager.spawn('deploy');
      },
      'before:aws:deploy:deploy:updateStack': () =>
        BbPromise.bind(this).then(this.lockStackDeployment),
      'aws:deploy:deploy:updateStack': () =>
        this.callIfPlanning([
          this.setBucketName,
          this.createChangeSet,
          this.waitForChangeSetCreateComplete,
          this.runAnalysis,
          this.deleteChangeSet,
          this.deleteChangeSetFromS3,
        ]),
      'after:aws:deploy:deploy:updateStack': () =>
        this.callIfPlanning([this.unlockStackDeployment]),
      'after:deploy:deploy': () => this.callIfPlanning([this.printAnalysis]),
    };
  }

  callIfPlanning(functions) {
    if (this.planning) {
      let promise = BbPromise.bind(this);
      functions.forEach(fn => {
        promise = promise.then(fn);
      });
      return promise;
    }
    return BbPromise.resolve();
  }

  lockStackDeployment() {
    this.shouldNotDeploy = this.serverless.service.provider.shouldNotDeploy;
    this.planning = this.planning && !this.shouldNotDeploy;
    if (this.planning) {
      this.serverless.service.provider.shouldNotDeploy = true;
    }
  }

  unlockStackDeployment() {
    this.serverless.service.provider.shouldNotDeploy = this.shouldNotDeploy;
  }
}

module.exports = AwsPlan;
