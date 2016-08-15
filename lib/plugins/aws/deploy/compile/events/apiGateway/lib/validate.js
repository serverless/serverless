'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  validate() {
    if (!this.serverless.service.provider.compiledCloudFormationTemplate) {
      throw new this.serverless.classes
        .Error('This plugin needs access to the compiled CloudFormation template');
    }

    // validate that path and method exists for each http event in service
    _.forEach(this.serverless.service.functions, (functionObject, functionName) => {
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
