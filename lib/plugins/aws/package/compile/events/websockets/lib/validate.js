'use strict';

const _ = require('lodash');

module.exports = {
  validate() {
    const events = [];

    const getAuthorizerNameFromArn = arn => {
      const splitArn = arn.split(':');
      return splitArn[splitArn.length - 1];
    };

    _.forEach(this.serverless.service.functions, (functionObject, functionName) => {
      _.forEach(functionObject.events, event => {
        // check if we have both, `http` and `websocket` events which is not supported
        if (_.has(event, 'websocket') && _.has(event, 'http')) {
          const errorMessage = 'The event type can either be "http" or "websocket" but not both.';
          throw new this.serverless.classes.Error(errorMessage);
        }
        if (_.has(event, 'websocket')) {
          // dealing with the extended object definition
          if (_.isObject(event.websocket)) {
            if (!event.websocket.route) {
              const errorMessage = 'You need to set the "route" when using the websocket event.';
              throw new this.serverless.classes.Error(errorMessage);
            }

            const websocketObj = {
              functionName,
              route: event.websocket.route,
            };

            // authorizers
            if (_.isString(event.websocket.authorizer)) {
              if (event.websocket.authorizer.includes(':')) {
                // arn
                websocketObj.authorizer = {
                  name: getAuthorizerNameFromArn(event.websocket.authorizer),
                  uri: {
                    'Fn::Join': [
                      '',
                      [
                        'arn:',
                        { Ref: 'AWS::Partition' },
                        ':apigateway:',
                        { Ref: 'AWS::Region' },
                        ':lambda:path/2015-03-31/functions/',
                        event.websocket.authorizer,
                        '/invocations',
                      ],
                    ],
                  },
                  identitySource: ['route.request.header.Auth'],
                  permission: event.websocket.authorizer,
                };
              } else {
                // reference function
                const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(
                  event.websocket.authorizer
                );
                websocketObj.authorizer = {
                  name: event.websocket.authorizer,
                  uri: {
                    'Fn::Join': [
                      '',
                      [
                        'arn:',
                        { Ref: 'AWS::Partition' },
                        ':apigateway:',
                        { Ref: 'AWS::Region' },
                        ':lambda:path/2015-03-31/functions/',
                        { 'Fn::GetAtt': [lambdaLogicalId, 'Arn'] },
                        '/invocations',
                      ],
                    ],
                  },
                  identitySource: ['route.request.header.Auth'],
                  permission: lambdaLogicalId,
                };
              }
            } else if (_.isObject(event.websocket.authorizer)) {
              websocketObj.authorizer = {};
              if (event.websocket.authorizer.arn) {
                websocketObj.authorizer.name = getAuthorizerNameFromArn(
                  event.websocket.authorizer.arn
                );
                websocketObj.authorizer.uri = {
                  'Fn::Join': [
                    '',
                    [
                      'arn:',
                      { Ref: 'AWS::Partition' },
                      ':apigateway:',
                      { Ref: 'AWS::Region' },
                      ':lambda:path/2015-03-31/functions/',
                      event.websocket.authorizer.arn,
                      '/invocations',
                    ],
                  ],
                };
                websocketObj.authorizer.permission = event.websocket.authorizer.arn;
              } else if (event.websocket.authorizer.name) {
                websocketObj.authorizer.name = event.websocket.authorizer.name;
                const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(
                  event.websocket.authorizer.name
                );
                websocketObj.authorizer.uri = {
                  'Fn::Join': [
                    '',
                    [
                      'arn:',
                      { Ref: 'AWS::Partition' },
                      ':apigateway:',
                      { Ref: 'AWS::Region' },
                      ':lambda:path/2015-03-31/functions/',
                      { 'Fn::GetAtt': [lambdaLogicalId, 'Arn'] },
                      '/invocations',
                    ],
                  ],
                };
                websocketObj.authorizer.permission = lambdaLogicalId;
              } else {
                const errorMessage =
                  'You must specify name or arn properties when using a websocket authorizer';
                throw new this.serverless.classes.Error(errorMessage);
              }

              if (!event.websocket.authorizer.identitySource) {
                websocketObj.authorizer.identitySource = ['route.request.header.Auth'];
              } else {
                websocketObj.authorizer.identitySource = event.websocket.authorizer.identitySource;
              }
            }
            events.push(websocketObj);
            // dealing with the simplified string representation
          } else if (_.isString(event.websocket)) {
            events.push({
              functionName,
              route: event.websocket,
            });
          }
        }
      });
    });

    return {
      events,
    };
  },
};
