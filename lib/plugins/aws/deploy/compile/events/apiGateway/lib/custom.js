'use strict';

const BbPromise = require('bluebird');
const merge = require('lodash').merge;
const forEach = require('lodash').forEach;

module.exports = {
  compileCustom() {
    // check if the user has added some "custom Resources" (and merge them into coreCFTemplate)
    if (this.serverless.service.custom && this.serverless.service.custom.Resources) {
      const json = JSON.stringify(this.serverless.service.custom);
      const deploymentResource = `DeploymentApigEvent${this.serverless.service.custom.deployTime}`;
      const jsonObj = json.replace(/DeploymentApigEvent/g, deploymentResource);

      this.serverless.service.custom = JSON.parse(jsonObj);

      forEach(this.serverless.service.custom.Resources, (value, key) => {
        const newResourceObject = {
          [key]: value,
        };

        merge(this.serverless.service.resources.Resources, newResourceObject);
      });
    }
    return BbPromise.resolve();
  },
};
