'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  compileAuthorizers() {
    _.forEach(this.serverless.service.functions, (functionObject, functionName) => {
      functionObject.events.forEach(event => {
        if (event.http && event.http.authorizers) {
          event.http.authorizers.forEach(authorizer => {
            let resultTtlInSeconds;
            let authorizerName;
            let identitySource;

            const extractedResourceId = this.resourceLogicalIds[event.http.path].match(/\d+$/)[0];
            const normalizedMethod = event.http.method[0].toUpperCase() +
              event.http.method.substr(1).toLowerCase();

            if (typeof authorizer === 'string') {
              authorizerName = authorizer;
              resultTtlInSeconds = '300';
              identitySource = 'method.request.header.Auth';
            } else if (typeof authorizer === 'object') {
              authorizerName = authorizer.name;
              resultTtlInSeconds = authorizer.resultTtlInSeconds || '300';
              identitySource = authorizer.identitySource || 'method.request.header.Auth';
            } else {
              const errorMessage = [
                `Authorizer item in function ${functionName} is not an object nor a string.`,
                ' Please make sure each authorizer in the "authorizers"',
                ' array is a string or an object.',
                ' Please check the docs for more info.',
              ].join('');
              throw new this.serverless.classes
                .Error(errorMessage);
            }

            // validate referenced authorizer
            // function exists in service
            this.serverless.service.getFunction(authorizerName);

            const authorizerTemplate = `
            {
              "Type" : "AWS::ApiGateway::Authorizer",
              "Properties" : {
                "AuthorizerResultTtlInSeconds" : "${resultTtlInSeconds}",
                "AuthorizerUri" : {"Fn::Join" : ["", [
                  "arn:aws:apigateway:",
                  {"Ref" : "AWS::Region"},
                  ":lambda:path/2015-03-31/functions/",
                  {"Fn::GetAtt" : ["${authorizerName}", "Arn"]}, "/invocations"
                ]]},
                "IdentitySource" : "${identitySource}",
                "Name" : "${authorizerName}",
                "RestApiId" : { "Ref": "RestApiApigEvent" },
                "Type" : "TOKEN"
              }
            }
          `;

            const authorizerObject = {
              [`${authorizerName}Authorizer`]:
                JSON.parse(authorizerTemplate),
            };

            _.merge(this.serverless.service.resources.Resources,
              authorizerObject);
          });
        }
      });
    });
    return BbPromise.resolve();
  },
};
