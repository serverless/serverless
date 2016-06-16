'use strict';

const azureCLI = require('../../utils/azureCli');

module.exports = {
  remove() {
    this.serverless.cli.log('Removing Stack...');
    const resourceGroup = `${this.serverless.service.service}-${this.options.stage}`;
    return azureCLI.removeResourceGroup(resourceGroup);
  },
};
