'use strict';

/*
 * Provide common lifecycle events for the AWS provider that can be invoked
 * and spawned from other AWS plugins. This makes it easy to hook lifecycle
 * events in
 */

const BbPromise = require('bluebird');
const validate = require('../lib/validate');
const cleanupTempDir = require('./lib/cleanupTempDir');

class AwsCommon {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    Object.assign(
      this,
      validate,
      cleanupTempDir
    );

    // Internal commands are addressed as aws:common:<lifecycleevent|command>[:lifecycleevent]
    this.commands = {
      aws: {
        type: 'entrypoint',
        commands: {
          // Common is only a command group here
          common: {
            commands: {
              cleanupTempDir: {
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
      'aws:common:cleanupTempDir:cleanup': () => BbPromise.bind(this)
        .then(this.cleanupTempDir),
    };
  }
}

module.exports = AwsCommon;
