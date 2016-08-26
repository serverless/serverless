'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  compileMethods() {
    const corsConfig = {};
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
          } else {
            const errorMessage = [
              `HTTP event of function ${functionName} is not an object nor a string.`,
              ' The correct syntax is: http: get users/list',
              ' OR an object with "path" and "method" properties.',
              ' Please check the docs for more info.',
            ].join('');
            throw new this.serverless.classes
              .Error(errorMessage);
          }

          // add the default request and response templates to the CloudFormation "Mappings" section
          const DEFAULT_JSON_REQUEST_TEMPLATE = `
            #define( $loop )
              {
              #foreach($key in $map.keySet())
                  "$util.escapeJavaScript($key)":
                    "$util.escapeJavaScript($map.get($key))"
                    #if( $foreach.hasNext ) , #end
              #end
              }
            #end

            {
              "body": $input.json("$"),
              "method": "$context.httpMethod",
              "principalId": "$context.authorizer.principalId",
              "stage": "$context.stage",

              #set( $map = $input.params().header )
              "headers": $loop,

              #set( $map = $input.params().querystring )
              "query": $loop,

              #set( $map = $input.params().path )
              "path": $loop,

              #set( $map = $context.identity )
              "identity": $loop,

              #set( $map = $stageVariables )
              "stageVariables": $loop
            }
          `;

          const DEFAULT_FORM_URL_ENCODED_REQUEST_TEMPLATE = `
            #define( $body )
              {
              #foreach( $token in $input.path('$').split('&') )
                #set( $keyVal = $token.split('=') )
                #set( $keyValSize = $keyVal.size() )
                #if( $keyValSize >= 1 )
                  #set( $key = $util.urlDecode($keyVal[0]) )
                  #if( $keyValSize >= 2 )
                    #set( $val = $util.urlDecode($keyVal[1]) )
                  #else
                    #set( $val = '' )
                  #end
                  "$key": "$val"#if($foreach.hasNext),#end
                #end
              #end
              }
            #end

            #define( $loop )
              {
              #foreach($key in $map.keySet())
                  "$util.escapeJavaScript($key)":
                    "$util.escapeJavaScript($map.get($key))"
                    #if( $foreach.hasNext ) , #end
              #end
              }
            #end

            {
              "body": $body,
              "method": "$context.httpMethod",
              "principalId": "$context.authorizer.principalId",
              "stage": "$context.stage",
              
              #set( $map = $input.params().header )
              "headers": $loop,
              
              #set( $map = $input.params().querystring )
              "query": $loop,
              
              #set( $map = $input.params().path )
              "path": $loop,
              
              #set( $map = $context.identity )
              "identity": $loop,
              
              #set( $map = $stageVariables )
              "stageVariables": $loop
            }
          `;

          const apiGatewayMappings = `
            {
              "ApiGateway": {
                "RequestTemplates": {
                  "Json": ${JSON.stringify(DEFAULT_JSON_REQUEST_TEMPLATE)},
                  "FormUrlEncoded": ${JSON.stringify(DEFAULT_FORM_URL_ENCODED_REQUEST_TEMPLATE)}
                }
              }
            }
          `;

          _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Mappings,
            JSON.parse(apiGatewayMappings));

          // setup CORS
          let cors;
          let corsEnabled = false;

          if (Boolean(event.http.cors) === true) {
            corsEnabled = true;
            const headers = [
              'Content-Type',
              'X-Amz-Date',
              'Authorization',
              'X-Api-Key',
              'X-Amz-Security-Token'];

            cors = {
              origins: ['*'],
              methods: ['OPTIONS'],
              headers,
            };

            if (typeof event.http.cors === 'object') {
              cors = event.http.cors;
              cors.methods = [];
              if (cors.headers && !Array.isArray(cors.headers)) {
                const errorMessage = [
                  'CORS header values must be provided as an array.',
                  ' Please check the docs for more info.',
                ].join('');
                throw new this.serverless.classes
                .Error(errorMessage);
              } else {
                cors.headers = headers;
              }

              if (!cors.methods.indexOf('OPTIONS') > -1) {
                cors.methods.push('OPTIONS');
              }

              if (!cors.methods.indexOf(method.toUpperCase()) > -1) {
                cors.methods.push(method.toUpperCase());
              }
            } else {
              cors.methods.push(method.toUpperCase());
            }

            if (corsConfig[path]) {
              corsConfig[path] = _.merge(corsConfig[path], cors);
            } else {
              corsConfig[path] = cors;
            }
          }

          const resourceLogicalId = this.resourceLogicalIds[path];
          const normalizedMethod = method[0].toUpperCase() +
            method.substr(1).toLowerCase();
          const extractedResourceId = resourceLogicalId.match(/ResourceApigEvent(.*)/)[1];

          const allowOrigin = '"method.response.header.Access-Control-Allow-Origin"';
          const corsMethodResponseTemplate =
          corsEnabled ? `${allowOrigin} : ${allowOrigin}` : '';

          const corsMethodIntegrationTemplate =
          corsEnabled ? `${allowOrigin}: "'${cors.origins.join(',')}'"` : '';

          const methodTemplate = `
            {
              "Type" : "AWS::ApiGateway::Method",
              "Properties" : {
                "AuthorizationType" : "NONE",
                "HttpMethod" : "${method.toUpperCase()}",
                "MethodResponses" : [
                  {
                    "ResponseModels" : {},
                    "ResponseParameters" : {
                      ${corsMethodResponseTemplate}
                    },
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
                    "application/json" : {
                      "Fn::FindInMap": [ "ApiGateway", "RequestTemplates", "Json" ]
                    },
                    "application/x-www-form-urlencoded" : {
                      "Fn::FindInMap": [ "ApiGateway", "RequestTemplates", "FormUrlEncoded" ]
                    }
                  },
                  "IntegrationResponses" : [
                    {
                      "StatusCode" : "200",
                      "ResponseParameters" : {
                        ${corsMethodIntegrationTemplate}
                      },
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

          _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
            methodObject);

          // store a method logical id in memory to be used
          // by Deployment resources "DependsOn" property
          if (this.methodDependencies) {
            this.methodDependencies
              .push(`${normalizedMethod}MethodApigEvent${extractedResourceId}`);
          } else {
            this.methodDependencies =
              [`${normalizedMethod}MethodApigEvent${extractedResourceId}`];
          }
        }
      });
    });

    // If no paths have CORS settings, then CORS isn't required.
    if (!_.isEmpty(corsConfig)) {
      const allowOrigin = '"method.response.header.Access-Control-Allow-Origin"';
      const allowHeaders = '"method.response.header.Access-Control-Allow-Headers"';
      const allowMethods = '"method.response.header.Access-Control-Allow-Methods"';

      const preflightMethodResponse = `
        ${allowOrigin}: true,
        ${allowHeaders}: true,
        ${allowMethods}: true
      `;

      let configIndex = 0;
      _.forOwn(corsConfig, (config, path) => {
        const resourceLogicalId = this.resourceLogicalIds[path];
        const preflightIntegrationResponse =
        `
          ${allowOrigin}: "'${config.origins.join(',')}'",
          ${allowHeaders}: "'${config.headers.join(',')}'",
          ${allowMethods}: "'${config.methods.join(',')}'"
        `;

        const preflightTemplate = `
          {
            "Type" : "AWS::ApiGateway::Method",
            "Properties" : {
              "AuthorizationType" : "NONE",
              "HttpMethod" : "OPTIONS",
              "MethodResponses" : [
                {
                  "ResponseModels" : {},
                  "ResponseParameters" : {
                    ${preflightMethodResponse}
                  },
                  "StatusCode" : "200"
                }
              ],
              "RequestParameters" : {},
              "Integration" : {
                "Type" : "MOCK",
                "RequestTemplates" : {
                  "application/json": "{statusCode:200}"
                },
                "IntegrationResponses" : [
                  {
                    "StatusCode" : "200",
                    "ResponseParameters" : {
                      ${preflightIntegrationResponse}
                    },
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

        const preflightObject = {
          [`PreflightMethodApigEvent${configIndex++}`]:
            JSON.parse(preflightTemplate),
        };

        _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
          preflightObject);
      });
    }

    return BbPromise.resolve();
  },
};
