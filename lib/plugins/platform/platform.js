'use strict';

/* eslint-disable no-console */

const BbPromise = require('bluebird');
const path = require('path');
const fs = require('fs');
const fsExtra = require('../../utils/fs/fse');
const platform = require('@serverless/platform-sdk');
const getAccessKey = require('../../utils/getAccessKey');
const userStats = require('../../utils/userStats');

class Platform {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');
    // NOTE for the time being we only track services published to AWS
    if (this.provider) {
      this.hooks = {
        'after:deploy:finalize': this.publishService.bind(this),
        'after:remove:remove': this.archiveService.bind(this),
      };
    }
  }

  getReadme() {
    const readmePath = path.join(this.serverless.config.servicePath, 'README.md');
    if (fs.existsSync(readmePath)) {
      return fsExtra.readFileSync(readmePath).toString('utf8');
    }
    return null;
  }

  publishService() {
    if (!this.serverless.service.deployment || !this.serverless.service.deployment.deploymentId) {
      return BbPromise.resolve();
    }
    this.serverless.cli.log('Publishing service to Serverless Platform...');

    return this.provider.getStackResources().then(resources => {
      this.cfResources = resources;
    }).then(() => this.provider.getAccountId())
      .then(accountId => {
        const deploymentData = {
          tenant: this.serverless.service.deployment.tenant,
          app: this.serverless.service.deployment.app,
          serviceName: this.serverless.service.deployment.serviceName,
          accessKey: this.serverless.service.deployment.accessKey,
          deploymentId: this.serverless.service.deployment.deploymentId,
          status: 'success',
          computedData: {
            readme: this.getReadme(),
            accountId,
            apiId: this.serverless.service.deployment.apiId,
            physicalIds: this.cfResources.map(r => ({
              logicalId: r.LogicalResourceId,
              physicalId: r.PhysicalResourceId,
            })),
          },
        };

        return platform.updateDeployment(deploymentData)
          .then(() => {
            const trackingData = {
              tenant: deploymentData.tenant,
              app: deploymentData.app,
            };
            userStats.track('service_published', trackingData);
            const serviceUrlData = {
              tenant: deploymentData.tenant,
              app: deploymentData.app,
              name: deploymentData.serviceName,
            };
            const serviceUrl = platform.getServiceUrl(serviceUrlData);
            this.serverless.cli
              .log('Successfully published your service on the Serverless Platform');
            this.serverless.cli.log(`Service URL:  ${serviceUrl}`);
          });
      });
  }

  archiveService() {
    return getAccessKey(this.serverless.service.tenant).then(accessKey => {
      if (!accessKey || !this.serverless.service.app || !this.serverless.service.tenant) {
        return BbPromise.resolve();
      }
      const data = {
        name: this.serverless.service.service,
        tenant: this.serverless.service.tenant,
        app: this.serverless.service.app,
        provider: this.serverless.service.provider.name,
        region: this.serverless.service.provider.region,
        accessKey,
      };
      return platform.archiveService(data)
        .then(() => {
          this.serverless.cli.log('Successfully archived your service on the Serverless Platform');
        })
        .catch(err => {
          this.serverless.cli.log('Failed to archived your service on the Serverless Platform');
          throw new this.serverless.classes.Error(err.message);
        });
    });
  }
}

module.exports = Platform;
