'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileDeployment() {
    const routeLogicalIds = this.validated.events.map(event => {
      const routeLogicalId = this.provider.naming
        .getWebsocketsRouteLogicalId(event.route);
      return routeLogicalId;
    });
    this.websocketsDeploymentLogicalId = this.provider.naming
      .getWebsocketsDeploymentLogicalId(this.serverless.instanceId);

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
      [this.websocketsDeploymentLogicalId]: {
        Type: 'AWS::ApiGatewayV2::Deployment',
        DependsOn: routeLogicalIds,
        Properties: {
          ApiId: {
            Ref: this.websocketsApiLogicalId,
          },
          Description: this.serverless.service.provider
            .websocketsDescription || 'Serverless Websockets',
        },
      },
    });

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Outputs, {
      ServiceEndpointWebsocket: {
        Description: 'URL of the service endpoint',
        Value: {
          'Fn::Join': ['',
            [
              'wss://',
              { Ref: this.provider.naming.getWebsocketsApiLogicalId() },
              '.execute-api.',
              { Ref: 'AWS::Region' },
              '.',
              { Ref: 'AWS::URLSuffix' },
              `/${this.provider.getStage()}`,
            ],
          ],
        },
      },
    });

    return BbPromise.resolve();
  },
};
