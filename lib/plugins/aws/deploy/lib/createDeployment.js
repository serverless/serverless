'use strict';

const platform = require('@serverless/platform-sdk');
const BbPromise = require('bluebird');
const getAccessKey = require('../../../../utils/getAccessKey');

module.exports = {
  createDeployment() {
    return getAccessKey(this.serverless.service.tenant).then(accessKey => {
      if (accessKey && this.serverless.service.app &&
        this.serverless.service.tenant &&
        !this.options.noDeploy) {
        const deploymentData = {
          tenant: this.serverless.service.tenant,
          app: this.serverless.service.app,
          accessKey,
          serviceName: this.serverless.service.service,
        };
        return platform.createDeployment(deploymentData)
          .then((res) => {
            this.serverless.service.deployment = {
              deploymentId: res.id,
              accessKey,
              tenant: this.serverless.service.tenant,
              app: this.serverless.service.app,
              serviceName: this.serverless.service.service,
            };
            return BbPromise.resolve();
          });
      }
      return BbPromise.resolve();
    });
  },
};
