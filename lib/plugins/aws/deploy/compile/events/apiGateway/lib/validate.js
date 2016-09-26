'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  validate() {
    // validate that path and method exists for each http event in service
    _.forEach(this.serverless.service.functions, (functionObject, functionName) => {
      functionObject.events.forEach(event => {
        if (event.http) {
          let method;
          let path;

          if (typeof event.http === 'object') {
            method = event.http.method;
            path = event.http.path;
          } else if (typeof event.http === 'string') {
            method = event.http.split(' ')[0];
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
          method = method.toLowerCase();

          const allowedMethods = [
            'get', 'post', 'put', 'patch', 'options', 'head', 'delete', 'any',
          ];
          if (allowedMethods.indexOf(method) === -1) {
            const errorMessage = [
              `Invalid APIG method "${method}" in function "${functionName}".`,
              ` AWS supported methods are: ${allowedMethods.join(', ')}.`,
            ].join('');
            throw new this.serverless.classes.Error(errorMessage);
          }
        } else {
          const errorMessage = [
            `Empty http event in function "${functionName}"`,
            ' in serverless.yml.',
            ' If you define an http event, make sure you pass a valid value for it,',
            ' either as string syntax, or object syntax.',
            ' Please check the docs for more options.',
          ].join('');
          throw new this.serverless.classes.Error(errorMessage);
        }
      });
    });

    return BbPromise.resolve();
  },
};
