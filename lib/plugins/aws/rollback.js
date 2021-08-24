'use strict';
const validate = require('./lib/validate');
const setBucketName = require('./lib/setBucketName');
const updateStack = require('./lib/updateStack');
const monitorStack = require('./lib/monitorStack');
const findDeployments = require('./lib/findDeployments');
const ServerlessError = require('../../serverless-error');

class AwsRollback {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    Object.assign(this, validate, setBucketName, updateStack, monitorStack, findDeployments);

    this.hooks = {
      'before:rollback:initialize': async () => this.validate(),

      'rollback:rollback': async () => {
        if (!this.options.timestamp) {
          this.serverless.cli.log(
            [
              'Use a timestamp from the deploy list below to rollback to a specific version.',
              'Run `sls rollback -t YourTimeStampHere`',
            ].join('\n')
          );
          await this.serverless.pluginManager.spawn('deploy:list');
          return;
        }

        await this.setBucketName();
        await this.setStackToUpdate();
        await this.updateStack();
      },
    };
  }

  async setStackToUpdate() {
    const deployments = await this.findDeployments();
    if (deployments.length === 0) {
      const msg = "Couldn't find any existing deployments.";
      const hint = 'Please verify that stage and region are correct.';
      throw new ServerlessError(`${msg} ${hint}`, 'ROLLBACK_DEPLOYMENTS_NOT_FOUND');
    }

    const existing = deployments.find(
      ({ timestamp }) => String(this.options.timestamp) === timestamp
    );
    if (!existing) {
      const msg = `Couldn't find a deployment for the timestamp: ${this.options.timestamp}.`;
      const hint = 'Please verify that the timestamp, stage and region are correct.';
      throw new ServerlessError(`${msg} ${hint}`, 'ROLLBACK_DEPLOYMENT_NOT_FOUND');
    }
    const { service } = this.serverless;
    service.package.deploymentDirectoryPrefix = existing.prefix;
    service.package.timestamp = existing.templateDirectory;
  }
}

module.exports = AwsRollback;
