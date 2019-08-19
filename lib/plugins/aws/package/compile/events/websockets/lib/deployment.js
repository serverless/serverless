'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileDeployment() {
    const routeLogicalIds = this.validated.events.map(event => {
      const routeLogicalId = this.provider.naming.getWebsocketsRouteLogicalId(event.route);
      return routeLogicalId;
    });
    this.websocketsDeploymentLogicalId = this.provider.naming.getWebsocketsDeploymentLogicalId(
      this.serverless.instanceId
    );

    const resources = this.serverless.service.provider.compiledCloudFormationTemplate.Resources;
    _.merge(resources, {
      [this.websocketsDeploymentLogicalId]: {
        Type: 'AWS::ApiGatewayV2::Deployment',
        DependsOn: routeLogicalIds,
        Properties: {
          ApiId: this.provider.getApiGatewayWebsocketApiId(),
          Description:
            this.serverless.service.provider.websocketsDescription || 'Serverless Websockets',
        },
      },
    });
    const { apiGateway } = this.serverless.service.provider;
    if (apiGateway && apiGateway.websocketApiId) {
      resources[this.websocketsDeploymentLogicalId].Properties.StageName = this.provider.getStage();
    }

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Outputs, {
      ServiceEndpointWebsocket: {
        Description: 'URL of the service endpoint',
        Value: {
          'Fn::Join': [
            '',
            [
              'wss://',
              this.provider.getApiGatewayWebsocketApiId(),
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
