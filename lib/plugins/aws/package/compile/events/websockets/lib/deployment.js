'use strict';

const _ = require('lodash');
const crypto = require('crypto');
const pickWebsocketsTemplatePart = require('./pick-websockets-template-part');

module.exports = {
  compileDeployment() {
    const dependentResourceIds = _.flatten(
      this.validated.events.map((event) => {
        const result = [];
        if (event.routeResponseSelectionExpression) {
          result.push(this.provider.naming.getWebsocketsRouteResponseLogicalId(event.route));
        }
        result.push(this.provider.naming.getWebsocketsRouteLogicalId(event.route));
        return result;
      })
    );
    const websocketsTemplatePart = pickWebsocketsTemplatePart(
      this.serverless.service.provider.compiledCloudFormationTemplate,
      this.provider.naming.getWebsocketsApiLogicalId()
    );
    const cfTemplateHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(websocketsTemplatePart))
      .digest('base64');
    this.websocketsDeploymentLogicalId =
      this.provider.naming.getWebsocketsDeploymentLogicalId(cfTemplateHash);

    const resources = this.serverless.service.provider.compiledCloudFormationTemplate.Resources;
    _.merge(resources, {
      [this.websocketsDeploymentLogicalId]: {
        Type: 'AWS::ApiGatewayV2::Deployment',
        DependsOn: dependentResourceIds,
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

    if (resources.WebsocketsDeploymentStage && resources.WebsocketsDeploymentStage.Properties) {
      resources.WebsocketsDeploymentStage.Properties.DeploymentId = {
        Ref: this.websocketsDeploymentLogicalId,
      };
    }
  },
};
