'use strict';

/*
 * Provide common lifecycle events for the AWS provider that can be invoked
 * and spawned from other AWS plugins. This makes it easy to hook lifecycle
 * events in
 */

const BbPromise = require('bluebird');
const validate = require('../lib/validate');
const cleanupTempDir = require('./lib/cleanupTempDir');
const artifacts = require('./lib/artifacts');

class AwsCommon {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    Object.assign(
      this,
      validate,
      cleanupTempDir,
      artifacts
    );

    // Internal commands are addressed as aws:common:<lifecycleevent|command>[:lifecycleevent]
    this.commands = {
      aws: {
        type: 'entrypoint',
        commands: {
          // Common is only a command group here
          common: {
            commands: {
              validate: {
                lifecycleEvents: [
                  'validate',
                ],
              },
              cleanupTempDir: {
                lifecycleEvents: [
                  'cleanup',
                ],
              },
              moveArtifactsToPackage: {
                lifecycleEvents: [
                  'move',
                ],
              },
              moveArtifactsToTemp: {
                lifecycleEvents: [
                  'move',
                ],
              },
            },
          },
        },
      },
    };

    this.hooks = {
      'aws:common:validate:validate': () => BbPromise.bind(this)
        .then(this.validate),

      'aws:common:cleanupTempDir:cleanup': () => BbPromise.bind(this)
        .then(this.cleanupTempDir),

      'aws:common:moveArtifactsToPackage:move': () => BbPromise.bind(this)
        .then(this.moveArtifactsToPackage),

      'aws:common:moveArtifactsToTemp:move': () => BbPromise.bind(this)
        .then(this.moveArtifactsToTemp),
    };
  }
}

module.exports = AwsCommon;
