'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

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
              this.serverless.service.getFunction(authorizer);
              authorizerArn = `",{"Fn::GetAtt" : ["${authorizer}", "Arn"]},"`;
              authorizerName = authorizer;
            } else {
              authorizerArn = authorizer;
              const splittedAuthorizerArn = authorizerArn.split(':');
              const splittedLambdaName = splittedAuthorizerArn[splittedAuthorizerArn
                .length - 1].split('-');
              authorizerName = splittedLambdaName[splittedLambdaName.length - 1];
            }
            resultTtlInSeconds = 300;
            identitySource = 'method.request.header.Auth';
          } else if (typeof authorizer === 'object') {
            if (authorizer.arn) {
              authorizerArn = authorizer.arn;
              const splittedAuthorizerArn = authorizerArn.split(':');
              const splittedLambdaName = splittedAuthorizerArn[splittedAuthorizerArn
                .length - 1].split('-');
              authorizerName = splittedLambdaName[splittedLambdaName.length - 1];
            } else if (authorizer.name) {
              this.serverless.service.getFunction(authorizer.name);
              authorizerArn = `",{"Fn::GetAtt" : ["${authorizer.name}", "Arn"]},"`;
              authorizerName = authorizer.name;
            } else {
              throw new this.serverless.classes
                .Error('Please provide either an authorizer name or ARN');
            }
            resultTtlInSeconds = Number.parseInt(authorizer.resultTtlInSeconds, 10) || 300;
            identitySource = authorizer.identitySource || 'method.request.header.Auth';
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
                "RestApiId" : { "Ref": "RestApiApigEvent" },
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
            [`${authorizerName}Authorizer`]: authorizerTemplateJson,
          };

          _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
            authorizerObject);
        }
      });
    });
    return BbPromise.resolve();
  },
};
