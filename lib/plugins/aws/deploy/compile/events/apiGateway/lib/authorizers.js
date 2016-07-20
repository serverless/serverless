'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  compileAuthorizers() {
    _.forEach(this.serverless.service.functions, (functionObject) => {
      functionObject.events.forEach(event => {
        if (event.http && event.http.authorizer) {
          let resultTtlInSeconds;
          let functionName;
          let identitySource;
          const serviceName = this.serverless.service.service;
          const stageName = this.options.stage;

          const extractedResourceId = this.resourceLogicalIds[event.http.path].match(/\d+$/)[0];
          const normalizedMethod = event.http.method[0].toUpperCase() +
            event.http.method.substr(1).toLowerCase();

          if (typeof event.http.authorizer === 'string') {
            functionName = event.http.authorizer;
            resultTtlInSeconds = '300';
            identitySource = 'method.request.header.Auth';
          } else if (typeof event.http.authorizer === 'object') {
            functionName = event.http.authorizer.name;
            resultTtlInSeconds = event.http.authorizer.resultTtlInSeconds || '300';
            identitySource = event.http.authorizer.identitySource || 'method.request.header.Auth';
          } else {
            const errorMessage = [
              `Authorizer property in function ${functionName} is not an object nor a string.`,
              ' The correct syntax is: authorizer: functionName',
              ' OR an object with "name" property.',
              ' Please check the docs for more info.',
            ].join('');
            throw new this.serverless.classes
              .Error(errorMessage);
          }

          // validate referenced authorizer
          // function exists in service
          this.serverless.service.getFunction(functionName);

          const authorizerTemplate = `
            {
              "Type" : "AWS::ApiGateway::Authorizer",
              "Properties" : {
                "AuthorizerResultTtlInSeconds" : "${resultTtlInSeconds}",
                "AuthorizerUri" : {"Fn::Join" : ["", [
                  "arn:aws:apigateway:",
                  {"Ref" : "AWS::Region"},
                  ":lambda:path/2015-03-31/functions/",
                  {"Fn::GetAtt" : ["${serviceName}-${
            stageName}-${functionName}", "Arn"]}, "/invocations"
                ]]},
                "IdentitySource" : "${identitySource}",
                "Name" : "${event.http.method} ${event.http.path} Authorizer",
                "RestApiId" : { "Ref": "RestApiApigEvent" },
                "Type" : "TOKEN"
              }
            }
          `;

          const authorizerObject = {
            [`${normalizedMethod}MethodApigEvent${extractedResourceId}Authorizer`]:
              JSON.parse(authorizerTemplate),
          };

          _.merge(this.serverless.service.resources.Resources,
            authorizerObject);
        }
      });
    });
    return BbPromise.resolve();
  },
};
