'use strict';

const BbPromise = require('bluebird');

module.exports = {
  validateInput() {
    if (!this.options.stage) {
      throw new this.serverless.classes.Error('Please provide a stage name.');
    }

    if (!this.options.region) {
      throw new this.serverless.classes.Error('Please provide a region name.');
    }

    if (!this.serverless.config.servicePath) {
      throw new this.serverless.classes.Error('This command can only be run inside a service.');
    }

    // validate stage / region exists in service
    const convertedRegion = this.serverless.utils.convertRegionName(this.options.region);
    this.serverless.service.getStage(this.options.stage);
    this.serverless.service.getRegionInStage(this.options.stage, convertedRegion);

    if (!this.serverless.service.environment
        .stages[this.options.stage].regions[convertedRegion].vars) {
      throw new this.serverless.classes
        .Error('region vars object does not exist in serverless.env.yaml.');
    }

    return BbPromise.resolve();
  },
};
