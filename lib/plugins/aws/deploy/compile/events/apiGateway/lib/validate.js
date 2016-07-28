'use strict';

const forEach = require('lodash').forEach;
const BbPromise = require('bluebird');

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
    forEach(this.serverless.service.functions, (functionObject, functionName) => {
      functionObject.events.forEach(event => {
        if (event.http) {
          let method;
          let path;

          if (typeof event.http === 'object') {
            method = event.http.method.toLowerCase();
            path = event.http.path;
          } else if (typeof event.http === 'string') {
            method = event.http.split(' ')[0].toLowerCase();
            path = event.http.split(' ')[1];
          }

          if (!path) {
            const errorMessage = [
              `Missing "path" property in function "${functionName}"`,
              ' for http event in serverless.yml.',
              ' If you define an http event, make sure you pass a valid value for it,',
              ' either as string syntax, or object syntax.',
              ' Please check the docs for more options.',
            ].join('');
            throw new this.serverless.classes
              .Error(errorMessage);
          }
          if (!method) {
            const errorMessage = [
              `Missing "method" property in function "${functionName}"`,
              ' for http event in serverless.yml.',
              ' If you define an http event, make sure you pass a valid value for it,',
              ' either as string syntax, or object syntax.',
              ' Please check the docs for more options.',
            ].join('');
            throw new this.serverless.classes
              .Error(errorMessage);
          }

          if (['get', 'post', 'put', 'patch', 'options', 'head', 'delete'].indexOf(method) === -1) {
            const errorMessage = [
              `Invalid APIG method "${method}" in function "${functionName}".`,
              ' AWS supported methods are: get, post, put, patch, options, head, delete.',
            ].join('');
            throw new this.serverless.classes.Error(errorMessage);
          }
        }
      });
    });

    return BbPromise.resolve();
  },
};
