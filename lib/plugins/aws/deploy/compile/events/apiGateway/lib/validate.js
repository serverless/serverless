'use strict';

const forEach = require('lodash').forEach;

module.exports = {
  validate() {
    if (!this.serverless.service.resources.Resources) {
      throw new this.serverless.classes.Error(
        'This plugin needs access to Resources section of the AWS CloudFormation template');
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

    // validate that path and method exists for each http event in service
    forEach(this.serverless.service.functions, (functionObject) => {
      functionObject.events.forEach(event => {
        if (event.http) {
          // TODO validate the values of these properties as well
          if (!event.http.path) {
            throw new this.serverless.classes
              .Error('Missing "path" property in serverless.yaml for http event.');
          }
          if (!event.http.method) {
            throw new this.serverless.classes
              .Error('Missing "method" property in serverless.yaml for http event.');
          }
        }
      });
    });
  },
};
