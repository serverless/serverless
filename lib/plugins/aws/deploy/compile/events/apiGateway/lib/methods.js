'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');
const fs = require('fs');
const path = require('path');

module.exports = {
  compileMethods() {
    const defaultPath = path.resolve(__dirname, '../templates/default.tmpl');
    _.forEach(this.serverless.service.functions, (functionObject, functionName) => {
      functionObject.events.forEach(event => {
        if (event.http) {
          let method;
          let requestPath;
          if (typeof event.http === 'object') {
            method = event.http.method;
            requestPath = event.http.path;
          } else if (typeof event.http === 'string') {
            method = event.http.split(' ')[0];
            requestPath = event.http.split(' ')[1];
          } else {
            const errorMessage = [
              `HTTP event of function ${functionName} is not an object nor a string.`,
              ' The correct syntax is: http: get users/list',
              ' OR an object with "path" and "method" proeprties.',
              ' Please check the docs for more info.',
            ].join('');
            throw new this.serverless.classes
              .Error(errorMessage);
          }

          const resourceLogicalId = this.resourceLogicalIds[requestPath];
          const normalizedMethod = method[0].toUpperCase() +
            method.substr(1).toLowerCase();

          const extractedResourceId = resourceLogicalId.match(/\d+$/)[0];

          const requestTemplates = [];
          if (event.requestMappings && event.requestMappings.length) {
            // Validate that the input is in the correct format
            event.requestMappings.forEach(mapping => {
              if (typeof mapping !== 'object') {
                const errorMessage = [
                  `requestMappings in HTTP event of function ${functionName} is not an object.`,
                  ' The correct syntax is: \'header-type: path-to-template\'',
                ].join('');
                throw new this.serverless.classes
                  .Error(errorMessage);
              }
              const keys = Object.keys(mapping);
              if (keys.length !== 1 || typeof mapping[keys[0]] !== 'string') {
                const errorMessage = [
                  `A mapping in ${functionName} is not an object with a single key: string value.`,
                  ' The correct syntax is: {header-type: path-to-template}',
                  ` The provided mapping began with '${keys[0]}:'.`,
                ].join('');
                throw new this.serverless.classes
                  .Error(errorMessage);
              }
              // Check that the expected files are present
              const fname = mapping[keys[0]];
              if (keys[0] === 'application/json' && fname === 'default') {
                const template = fs.readFileSync(defaultPath, 'utf-8');
                requestTemplates.push(`"application/json" : ${JSON.stringify(template)}`);
              } else {
                const templatePath = path.resolve(
                  this.serverless.config.servicePath.concat('/templates/').concat(fname));
                if (!fs.existsSync(templatePath)) {
                  const errorMessage = [
                    `A mapping in ${functionName} does not correspond to a template within the`
                    `project. The provided mapping began with '${keys[0]}:' and targeted`
                    `'${templatePath}'.`,
                  ].join('');
                  throw new this.serverless.classes
                    .Error(errorMessage);
                }
                const template = `${fs.readFileSync(templatePath, 'utf-8')}`;
                requestTemplates.push(`"${keys[0]}" : ${JSON.stringify(template)}`);
              }
            });
          }

          const methodTemplate = `
            {
              "Type" : "AWS::ApiGateway::Method",
              "Properties" : {
                "AuthorizationType" : "NONE",
                "HttpMethod" : "${method.toUpperCase()}",
                "MethodResponses" : [
                  {
                    "ResponseModels" : {},
                    "ResponseParameters" : {},
                    "StatusCode" : "200"
                  }
                ],
                "RequestParameters" : {},
                "Integration" : {
                  "IntegrationHttpMethod" : "POST",
                  "Type" : "AWS",
                  "Uri" : {
                    "Fn::Join": [ "",
                      [
                        "arn:aws:apigateway:",
                        {"Ref" : "AWS::Region"},
                        ":lambda:path/2015-03-31/functions/",
                        {"Fn::GetAtt" : ["${functionName}", "Arn"]},
                        "/invocations"
                      ]
                    ]
                  },
                  "RequestTemplates" : {
                    ${requestTemplates}
                  },
                  "IntegrationResponses" : [
                    {
                      "StatusCode" : "200",
                      "ResponseParameters" : {},
                      "ResponseTemplates" : {
                        "application/json": ""
                      }
                    }
                  ]
                },
                "ResourceId" : { "Ref": "${resourceLogicalId}" },
                "RestApiId" : { "Ref": "RestApiApigEvent" }
              }
            }
          `;

          const methodTemplateJson = JSON.parse(methodTemplate);

          // set authorizer config if available
          if (event.http.authorizer) {
            let authorizerName;
            if (typeof event.http.authorizer === 'string') {
              if (event.http.authorizer.indexOf(':') === -1) {
                authorizerName = event.http.authorizer;
              } else {
                const authorizerArn = event.http.authorizer;
                const splittedAuthorizerArn = authorizerArn.split(':');
                const splittedLambdaName = splittedAuthorizerArn[splittedAuthorizerArn
                  .length - 1].split('-');
                authorizerName = splittedLambdaName[splittedLambdaName.length - 1];
              }
            } else if (typeof event.http.authorizer === 'object') {
              if (event.http.authorizer.arn) {
                const authorizerArn = event.http.authorizer.arn;
                const splittedAuthorizerArn = authorizerArn.split(':');
                const splittedLambdaName = splittedAuthorizerArn[splittedAuthorizerArn
                  .length - 1].split('-');
                authorizerName = splittedLambdaName[splittedLambdaName.length - 1];
              } else if (event.http.authorizer.name) {
                authorizerName = event.http.authorizer.name;
              }
            }

            const AuthorizerLogicalId = `${authorizerName}Authorizer`;

            methodTemplateJson.Properties.AuthorizationType = 'CUSTOM';
            methodTemplateJson.Properties.AuthorizerId = {
              Ref: AuthorizerLogicalId,
            };
            methodTemplateJson.DependsOn = AuthorizerLogicalId;
          }

          if (event.http.private) methodTemplateJson.Properties.ApiKeyRequired = true;

          const methodObject = {
            [`${normalizedMethod}MethodApigEvent${extractedResourceId}`]:
            methodTemplateJson,
          };

          _.merge(this.serverless.service.resources.Resources,
            methodObject);

          // store a method logical id in memory to be used
          // by Deployment resources "DependsOn" property
          if (!this.methodDep) {
            this.methodDep = `${normalizedMethod}MethodApigEvent${extractedResourceId}`;
          }
        }
      });
    });
    return BbPromise.resolve();
  },
};
