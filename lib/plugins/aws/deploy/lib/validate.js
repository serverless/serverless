'use strict';

const BbPromise = require('bluebird');

module.exports = {
  validate() {
    if (!this.serverless.config.servicePath) {
      throw new this.serverless.classes.Error('This command can only be run inside a service');
    }

    this.options.stage = this.options.stage
      || (this.serverless.service.defaults && this.serverless.service.defaults.stage)
      || 'dev';
    this.options.region = this.options.region
      || (this.serverless.service.defaults && this.serverless.service.defaults.region)
      || 'us-east-1';

    // validate stage / region exists in service
    this.serverless.service.getStage(this.options.stage);
    this.serverless.service.getRegionInStage(this.options.stage, this.options.region);

    if (Object.keys(this.serverless.service.environment
        .stages[this.options.stage].regions[this.options.region]).indexOf('vars') === -1) {
      throw new this.serverless.classes
        .Error('region vars object does not exist in serverless.env.yaml');
    }

    return BbPromise.resolve();
  },
};
