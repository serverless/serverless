'use strict';

const path = require('path');
const fs = require('fs-extra');
const BbPromise = require('bluebird');
const os = require('os');

module.exports = {
  deployResources() {
    return new BbPromise((resolve, reject) => {
      // Turn the existing resources into a JSON file\
      const azureResources = this.serverless.service.resources.azure;
      const tmpDir = path.join(os.tmpDir(), 'serverless');
      this.armFile = path.join(tmpDir, `${Date.now()}.json`);

      fs.emptyDir(tmpDir, (emptyErr) => {
        if (emptyErr) {
          reject(emptyErr);
          return;
        }

        fs.outputJson(this.armFile, azureResources, (outputErr) => {
          if (outputErr) {
            reject(outputErr);
            return;
          }

          // Todo: Hand it over to the Azure CLI, where it'll be deployed
          resolve();
          return;
        });
      });
    });
  },
};
