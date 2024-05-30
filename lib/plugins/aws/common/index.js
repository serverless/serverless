/*
 * Provide common lifecycle events for the AWS provider that can be invoked
 * and spawned from other AWS plugins. This makes it easy to hook lifecycle
 * events in
 */

import validate from '../lib/validate.js'
import cleanupTempDir from './lib/cleanup-temp-dir.js'
import artifacts from './lib/artifacts.js'

class AwsCommon {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options
    this.provider = this.serverless.getProvider('aws')

    Object.assign(this, validate, cleanupTempDir, artifacts)

    // Internal commands are addressed as aws:common:<lifecycleevent|command>[:lifecycleevent]
    this.commands = {
      aws: {
        type: 'entrypoint',
        commands: {
          // Common is only a command group here
          common: {
            commands: {
              validate: {
                lifecycleEvents: ['validate'],
              },
              cleanupTempDir: {
                lifecycleEvents: ['cleanup'],
              },
              moveArtifactsToPackage: {
                lifecycleEvents: ['move'],
              },
              moveArtifactsToTemp: {
                lifecycleEvents: ['move'],
              },
            },
          },
        },
      },
    }

    this.hooks = {
      'aws:common:validate:validate': () => this.validate(),

      'aws:common:cleanupTempDir:cleanup': () => this.cleanupTempDir(),

      'aws:common:moveArtifactsToPackage:move': () =>
        this.moveArtifactsToPackage(),

      'aws:common:moveArtifactsToTemp:move': () => this.moveArtifactsToTemp(),
    }
  }
}

export default AwsCommon
