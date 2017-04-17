'use strict';

const _ = require('lodash');

const DEFAULT_COMMON_TEMPLATE = `
  #define( $loop )
    {
    #foreach($key in $map.keySet())
        #set( $k = $util.escapeJavaScript($key) )
        #set( $v = $util.escapeJavaScript($map.get($key)).replaceAll("\\\\'", "'") )
        "$k":
          "$v"
          #if( $foreach.hasNext ) , #end
    #end
    }
  #end

  {
    "body": $body,
    "method": "$context.httpMethod",
    "principalId": "$context.authorizer.principalId",
    "stage": "$context.stage",

    "cognitoPoolClaims" : {
       extraCognitoPoolClaims
       "sub": "$context.authorizer.claims.sub"
    },

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

module.exports = {
  getMethodIntegration(http, lambdaLogicalId) {
    const integration = {
      IntegrationHttpMethod: 'POST',
      Type: http.integration,
      Uri: {
        'Fn::Join': ['',
          [
            'arn:aws:apigateway:',
            { Ref: 'AWS::Region' },
            ':lambda:path/2015-03-31/functions/',
            { 'Fn::GetAtt': [lambdaLogicalId, 'Arn'] },
            '/invocations',
          ],
        ],
      },
    };

    if (http.integration === 'AWS') {
      _.assign(integration, {
        PassthroughBehavior: http.request && http.request.passThrough,
        RequestTemplates: this.getIntegrationRequestTemplates(http),
        IntegrationResponses: this.getIntegrationResponses(http),
      });
    }

    return {
      Properties: {
        Integration: integration,
      },
    };
  },

  getIntegrationResponses(http) {
    const integrationResponses = [];

    if (http.response) {
      const integrationResponseHeaders = [];

      if (http.cors) {
        _.merge(integrationResponseHeaders, {
          'Access-Control-Allow-Origin': `'${http.cors.origins.join(',')}'`,
        });
      }

      if (http.response.headers) {
        _.merge(integrationResponseHeaders, http.response.headers);
      }

      _.each(http.response.statusCodes, (config, statusCode) => {
        const responseParameters = _.mapKeys(integrationResponseHeaders,
          (value, header) => `method.response.header.${header}`);

        const integrationResponse = {
          StatusCode: parseInt(statusCode, 10),
          SelectionPattern: config.pattern || '',
          ResponseParameters: responseParameters,
          ResponseTemplates: {},
        };

        if (config.headers) {
          _.merge(integrationResponse.ResponseParameters, _.mapKeys(config.headers,
            (value, header) => `method.response.header.${header}`));
        }

        if (http.response.template) {
          _.merge(integrationResponse.ResponseTemplates, {
            'application/json': http.response.template,
          });
        }

        if (config.template) {
          const template = typeof config.template === 'string' ?
            { 'application/json': config.template }
            : config.template;

          _.merge(integrationResponse.ResponseTemplates, template);
        }

        integrationResponses.push(integrationResponse);
      });
    }

    return integrationResponses;
  },

  getIntegrationRequestTemplates(http) {
    // default request templates
    const integrationRequestTemplates = {
      'application/json': this.DEFAULT_JSON_REQUEST_TEMPLATE,
      'application/x-www-form-urlencoded': this.DEFAULT_FORM_URL_ENCODED_REQUEST_TEMPLATE,
    };

    // set custom request templates if provided
    if (http.request && typeof http.request.template === 'object') {
      _.assign(integrationRequestTemplates, http.request.template);
    }

    return integrationRequestTemplates;
  },

  DEFAULT_JSON_REQUEST_TEMPLATE: `
    #set( $body = $input.json("$") )

    ${DEFAULT_COMMON_TEMPLATE}
  `,

  DEFAULT_FORM_URL_ENCODED_REQUEST_TEMPLATE: `
    #define( $body )
      {
      #foreach( $token in $input.path('$').split('&') )
        #set( $keyVal = $token.split('=') )
        #set( $keyValSize = $keyVal.size() )
        #if( $keyValSize >= 1 )
          #set( $key = $util.escapeJavaScript($util.urlDecode($keyVal[0])) )
          #if( $keyValSize >= 2 )
            #set($val = $util.escapeJavaScript($util.urlDecode($keyVal[1])).replaceAll("\\\\'","'"))
          #else
            #set( $val = '' )
          #end
          "$key": "$val"#if($foreach.hasNext),#end
        #end
      #end
      }
    #end

    ${DEFAULT_COMMON_TEMPLATE}
  `,
};
