'use strict';

/*
 * serverless package => package in default .serverless dir
 * serverless package --package => package in custom path
 *
 * serverless deploy => package in default .serverless & deploy from default .serverless
 * serverless deploy --package => deploy from custom path
 */

const BbPromise = require('bluebird');
const extendedValidate = require('./../deploy/lib/extendedValidate');
const setBucketName = require('./../lib/setBucketName');
const checkForChanges = require('./../deploy/lib/checkForChanges');
const monitorStack = require('./../lib/monitorStack');
const createStack = require('./../deploy/lib/createStack');
const cleanupS3Bucket = require('./../deploy/lib/cleanupS3Bucket');
const validateTemplate = require('./../deploy/lib/validateTemplate');
const path = require('path');

class AwsPlan {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');
    this.servicePath = this.serverless.config.servicePath || '';
    this.packagePath = this.options.package ||
      this.serverless.service.package.path ||
      path.join(this.servicePath, '.serverless');

    Object.assign(
      this,
      extendedValidate,
      createStack,
      setBucketName,
      checkForChanges,
      cleanupS3Bucket,
      validateTemplate,
      monitorStack
    );

    // Define the internal lifecycle model
    this.commands = {
      aws: {
        type: 'entrypoint',
        commands: {
          plan: {
            commands: {
              plan: {
                lifecycleEvents: [
                  'createStack',
                  'checkForChanges',
                  'validateTemplate',
                  'generateChangeDiff',
                ],
              },
              finalize: {
                lifecycleEvents: [
                  'cleanup',
                ],
              },
            },
          },
        },
      },
    };

    this.hooks = {
      'before:plan:plan': () => BbPromise.bind(this)
        .then(() => this.serverless.pluginManager.spawn('aws:common:validate'))
        .then(() => {
          if (!this.options.package && !this.serverless.service.package.path) {
            return this.extendedValidate();
          }
          return BbPromise.bind(this)
            .then(() => this.serverless.pluginManager.spawn('aws:common:moveArtifactsToTemp'))
            .then(this.extendedValidate);
        }),

      'plan:plan': () => BbPromise.bind(this).then(() => this.serverless.pluginManager.spawn('aws:plan:plan')),
      'plan:finalize': () => this.serverless.pluginManager.spawn('aws:plan:finalize'),

      // Deploy deploy inner lifecycle
      'aws:plan:plan:createStack': () => BbPromise.bind(this)
        .then(this.createStack),

      'aws:plan:plan:checkForChanges': () => BbPromise.bind(this)
        .then(this.setBucketName)
        .then(this.checkForChanges),

      'aws:plan:plan:validateTemplate': () => BbPromise.bind(this)
        .then(() => {
          if (this.serverless.service.provider.shouldNotDeploy) {
            return BbPromise.resolve();
          }
          return BbPromise.bind(this).then(this.validateTemplate);
        }),

        // Deploy finalize inner lifecycle
      'aws:plan:finalize:cleanup': () => BbPromise.bind(this)
        .then(() => {
          if (this.options.noDeploy || this.serverless.service.provider.shouldNotDeploy) {
            return BbPromise.resolve();
          }
          return this.cleanupS3Bucket();
        })
        .then(() => {
          if (this.options.package || this.serverless.service.package.path) {
            return BbPromise.bind(this)
              .then(() => this.serverless.pluginManager.spawn('aws:common:cleanupTempDir'));
          }
          return BbPromise.resolve();
        }),
    };
  }
}

module.exports = AwsPlan;
