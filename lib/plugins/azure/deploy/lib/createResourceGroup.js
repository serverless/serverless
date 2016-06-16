'use strict';

const azureCli = require('../../utils/azureCli');

module.exports = {
  createResourceGroup() {
    // Get resource group - if it exists, delete it.
    // Then, create a new one.
    const name = `${this.serverless.service.service}-${this.options.stage}`;
    const location = this.serverless.service.resources.azure.variables.location;
    this.resourceGroupName = name;

    return azureCli.showResourceGroup(name)
      .then(() => azureCli.deleteResourceGroup(name))
      .then(() => azureCli.createResourceGroup(name, location))
      .catch(() => azureCli.createResourceGroup(name, location));
  },
};
