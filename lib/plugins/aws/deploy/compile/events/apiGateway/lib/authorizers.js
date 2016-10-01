'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

const naming = require('./../../../../../lib/naming.js');

module.exports = {
  compileAuthorizers() {
    _.forEach(this.serverless.service.functions, (functionObject, functionName) => {
      functionObject.events.forEach(event => {
        if (event.http && event.http.authorizer) {
          const authorizer = event.http.authorizer;
          let resultTtlInSeconds;
          let authorizerName;
          let authorizerArn;
          let identitySource;

          if (typeof authorizer === 'string') {
            if (authorizer.indexOf(':') === -1) {
              authorizerName = authorizer;
              authorizerArn = `",{"Fn::GetAtt" : ["${
                naming.getLogicalLambdaName(authorizerName)}", "Arn"]},"`;
            } else {
              authorizerArn = authorizer;
              authorizerName = naming.extractLambdaNameFromArn(authorizerArn);
            }
            resultTtlInSeconds = 300;
            identitySource = 'method.request.header.Authorization';
          } else if (typeof authorizer === 'object') {
            if (authorizer.arn) {
              authorizerArn = authorizer.arn;
              authorizerName = naming.extractLambdaNameFromArn(authorizerArn);
            } else if (authorizer.name) {
              authorizerArn = `",{"Fn::GetAtt" : ["${
                naming.getLogicalLambdaName(authorizer.name)}", "Arn"]},"`;
              authorizerName = authorizer.name;
            } else {
              throw new this.serverless.classes
                .Error('Please provide either an authorizer name or ARN');
            }
            resultTtlInSeconds = Number.parseInt(authorizer.resultTtlInSeconds, 10) || 300;
            identitySource = authorizer.identitySource || 'method.request.header.Authorization';
          } else {
            const errorMessage = [
              `authorizer property in function ${functionName} is not an object nor a string.`,
              ' The correct format is: authorizer: functionName',
              ' OR an object containing a name property.',
              ' Please check the docs for more info.',
            ].join('');
            throw new this.serverless.classes
              .Error(errorMessage);
          }

          const authorizerTemplate = `
            {
              "Type" : "AWS::ApiGateway::Authorizer",
              "Properties" : {
                "AuthorizerResultTtlInSeconds" : ${resultTtlInSeconds},
                "AuthorizerUri" : {"Fn::Join" : ["", [
                  "arn:aws:apigateway:",
                  {"Ref" : "AWS::Region"},
                  ":lambda:path/2015-03-31/functions/${authorizerArn}/invocations"
                ]]},
                "IdentitySource" : "${identitySource}",
                "Name" : "${authorizerName}",
                "RestApiId" : { "Ref": "${naming.getLogicalApiGatewayName()}" },
                "Type" : "TOKEN"
              }
            }
          `;


          const authorizerTemplateJson = JSON.parse(authorizerTemplate);

          if (authorizer.identityValidationExpression
            && typeof authorizer.identityValidationExpression === 'string') {
            authorizerTemplateJson.Properties.IdentityValidationExpression =
              authorizer.identityValidationExpression;
          }

          const authorizerObject = {
            [naming.getLogicalAuthorizerName(authorizerName)]: authorizerTemplateJson,
          };

          _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
            authorizerObject);
        }
      });
    });
    return BbPromise.resolve();
  },
};
