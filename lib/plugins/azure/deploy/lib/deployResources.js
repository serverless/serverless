'use strict';

const path = require('path');
const fs = require('fs-extra');
const BbPromise = require('bluebird');
const os = require('os');

const azureCli = require('../../utils/azureCli');

module.exports = {
  deployResources() {
    return new BbPromise((resolve, reject) => {
      // Turn the existing resources into a JSON file\
      const azureResources = this.serverless.service.resources.azure;
      const tmpDir = path.join(os.tmpDir(), 'serverless');
      const resourceGroupName = `${this.serverless.service.service}-${this.options.stage}`;
      const deployment = `serverless-${Date.now()}`;
      const params = null;
      this.armFile = path.join(tmpDir, `${Date.now()}.json`);

      fs.emptyDir(tmpDir, (emptyErr) => {
        if (emptyErr) {
          return reject(emptyErr);
        }

        return fs.outputJson(this.armFile, azureResources, (outputErr) => {
          if (outputErr) {
            reject(outputErr);
            return;
          }

          azureCli.deployResourceGroup(this.armFile, params, resourceGroupName, deployment)
            .then((...results) => resolve(...results))
            .catch(err => reject(err));
        });
      });
    });
  },
};
