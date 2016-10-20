'use strict';

const _ = require('lodash');

module.exports = {
  validate() {
    const events = [];

    _.forEach(this.serverless.service.functions, (functionObject, functionName) => {
      _.forEach(functionObject.events, (event) => {
        if (_.has(event, 'http')) {
          const http = this.getHttp(event, functionName);

          http.path = this.getHttpPath(http, functionName);
          http.method = this.getHttpMethod(http, functionName);

          if (http.authorizer) {
            http.authorizer = this.getAuthorizer(http, functionName);
          }

          events.push({
            functionName,
            http,
          });
        }
      });
    });

    return {
      events,
    };
  },

  getHttp(event, functionName) {
    if (typeof event.http === 'object') {
      return event.http;
    } else if (typeof event.http === 'string') {
      return {
        method: event.http.split(' ')[0],
        path: event.http.split(' ')[1],
      };
    }
    const errorMessage = [
      `Invalid http event in function "${functionName}"`,
      ' in serverless.yml.',
      ' If you define an http event, make sure you pass a valid value for it,',
      ' either as string syntax, or object syntax.',
      ' Please check the docs for more options.',
    ].join('');
    throw new this.serverless.classes.Error(errorMessage);
  },

  getHttpPath(http, functionName) {
    if (typeof http.path === 'string') {
      return http.path.replace(/^\//, '').replace(/\/$/, '');
    }
    const errorMessage = [
      `Missing or invalid "path" property in function "${functionName}"`,
      ' for http event in serverless.yml.',
      ' If you define an http event, make sure you pass a valid value for it,',
      ' either as string syntax, or object syntax.',
      ' Please check the docs for more options.',
    ].join('');
    throw new this.serverless.classes.Error(errorMessage);
  },

  getHttpMethod(http, functionName) {
    if (typeof http.method === 'string') {
      const method = http.method.toLowerCase();

      const allowedMethods = [
        'get', 'post', 'put', 'patch', 'options', 'head', 'delete', 'any',
      ];
      if (allowedMethods.indexOf(method) === -1) {
        const errorMessage = [
          `Invalid APIG method "${http.method}" in function "${functionName}".`,
          ` AWS supported methods are: ${allowedMethods.join(', ')}.`,
        ].join('');
        throw new this.serverless.classes.Error(errorMessage);
      }
      return method;
    }
    const errorMessage = [
      `Missing or invalid "method" property in function "${functionName}"`,
      ' for http event in serverless.yml.',
      ' If you define an http event, make sure you pass a valid value for it,',
      ' either as string syntax, or object syntax.',
      ' Please check the docs for more options.',
    ].join('');
    throw new this.serverless.classes.Error(errorMessage);
  },

  getAuthorizer(http, functionName) {
    const authorizer = http.authorizer;

    let name;
    let arn;
    let identitySource;
    let resultTtlInSeconds;
    let identityValidationExpression;

    if (typeof authorizer === 'string') {
      if (authorizer.indexOf(':') === -1) {
        name = authorizer;
        arn = this.getLambdaArn(authorizer);
      } else {
        arn = authorizer;
        name = this.getLambdaName(arn);
      }
    } else if (typeof authorizer === 'object') {
      if (authorizer.arn) {
        arn = authorizer.arn;
        name = this.getLambdaName(arn);
      } else if (authorizer.name) {
        name = authorizer.name;
        arn = this.getLambdaArn(name);
      } else {
        throw new this.serverless.classes.Error('Please provide either an authorizer name or ARN');
      }

      if (authorizer.resultTtlInSeconds) {
        resultTtlInSeconds = Number.parseInt(authorizer.resultTtlInSeconds, 10);
      }

      identitySource = authorizer.identitySource;
      identityValidationExpression = authorizer.identityValidationExpression;
    } else {
      const errorMessage = [
        `authorizer property in function ${functionName} is not an object nor a string.`,
        ' The correct format is: authorizer: functionName',
        ' OR an object containing a name property.',
        ' Please check the docs for more info.',
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }

    if (typeof resultTtlInSeconds === 'undefined') {
      resultTtlInSeconds = 300;
    }

    if (typeof identitySource === 'undefined') {
      identitySource = 'method.request.header.Authorization';
    }

    return {
      name,
      arn,
      resultTtlInSeconds,
      identitySource,
      identityValidationExpression,
    };
  },

  getLambdaArn(name) {
    this.serverless.service.getFunction(name);
    const normalizedName = name[0].toUpperCase() + name.substr(1);
    return { 'Fn::GetAtt': [`${normalizedName}LambdaFunction`, 'Arn'] };
  },

  getLambdaName(arn) {
    const splitArn = arn.split(':');
    const splitLambdaName = splitArn[splitArn.length - 1].split('-');
    return splitLambdaName[splitLambdaName.length - 1];
  },
};
