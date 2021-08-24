'use strict';
const validate = require('./lib/validate');
const setBucketName = require('./lib/setBucketName');
const updateStack = require('./lib/updateStack');
const monitorStack = require('./lib/monitorStack');
const findAndGroupDeployments = require('./utils/findAndGroupDeployments');
const ServerlessError = require('../../serverless-error');

class AwsRollback {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    Object.assign(this, validate, setBucketName, updateStack, monitorStack);

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
    const service = this.serverless.service;
    const serviceName = this.serverless.service.service;
    const stage = this.provider.getStage();
    const deploymentPrefix = this.provider.getDeploymentPrefix();
    const prefix = `${deploymentPrefix}/${serviceName}/${stage}`;

    const response = await this.provider.request('S3', 'listObjectsV2', {
      Bucket: this.bucketName,
      Prefix: prefix,
    });
    const deployments = findAndGroupDeployments(response, deploymentPrefix, serviceName, stage);

    if (deployments.length === 0) {
      const msg = "Couldn't find any existing deployments.";
      const hint = 'Please verify that stage and region are correct.';
      throw new ServerlessError(`${msg} ${hint}`, 'ROLLBACK_DEPLOYMENTS_NOT_FOUND');
    }

    let date = new Date(this.options.timestamp);

    // The if below is added due issues#5664 - Check it for more details
    if (date instanceof Date === false || isNaN(date.valueOf())) {
      date = new Date(Number(this.options.timestamp));
    }

    const dateString = `${date.getTime().toString()}-${date.toISOString()}`;
    const exists = deployments.some((deployment) =>
      deployment.some(
        (item) =>
          item.directory === dateString &&
          item.file === this.provider.naming.getCompiledTemplateS3Suffix()
      )
    );

    if (!exists) {
      const msg = `Couldn't find a deployment for the timestamp: ${this.options.timestamp}.`;
      const hint = 'Please verify that the timestamp, stage and region are correct.';
      throw new ServerlessError(`${msg} ${hint}`, 'ROLLBACK_DEPLOYMENT_NOT_FOUND');
    }

    service.package.artifactDirectoryName = `${prefix}/${dateString}`;
  }
}

module.exports = AwsRollback;
