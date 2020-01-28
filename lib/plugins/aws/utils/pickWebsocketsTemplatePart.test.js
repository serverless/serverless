'use strict';

const expect = require('chai').expect;
const pickWebsocketsTemplatePart = require('./pickWebsocketsTemplatePart');

describe('#pickWebsocketsTemplatePart', () => {
  it('picks resources from a CloudFormation template related to WebsocketsApi', () => {
    const initialCloudFormationTemplate = {
      Resources: {
        ConnectLambdaFunction: {
          Type: 'AWS::Lambda::Function',
        },
        ConnectLambdaVersionvrs0fircL2xSCvlNyt7PIt2ARu2EKctxNJziUZEeHs: {
          Type: 'AWS::Lambda::Version',
          DeletionPolicy: 'Retain',
        },
        WebsocketsApi: {
          Type: 'AWS::ApiGatewayV2::Api',
          Properties: {
            ProtocolType: 'WEBSOCKET',
          },
        },
        DefaultLambdaPermissionWebsockets: {
          Type: 'AWS::Lambda::Permission',
          DependsOn: ['WebsocketsApi'],
        },
        WebsocketsDeploymentEK71B71TYkf46fa7a93cdhrp6Cq60x04DYWMuJQM: {
          Type: 'AWS::ApiGatewayV2::Deployment',
          Properties: {
            ApiId: {
              Ref: 'WebsocketsApi',
            },
            Description: 'Serverless Websockets',
          },
        },
      },
    };

    const expectedTemplatePart = {
      WebsocketsApi: {
        Type: 'AWS::ApiGatewayV2::Api',
        Properties: {
          ProtocolType: 'WEBSOCKET',
        },
      },
      DefaultLambdaPermissionWebsockets: {
        Type: 'AWS::Lambda::Permission',
        DependsOn: ['WebsocketsApi'],
      },
      WebsocketsDeploymentEK71B71TYkf46fa7a93cdhrp6Cq60x04DYWMuJQM: {
        Type: 'AWS::ApiGatewayV2::Deployment',
        Properties: {
          ApiId: {
            Ref: 'WebsocketsApi',
          },
          Description: 'Serverless Websockets',
        },
      },
    };

    expect(
      pickWebsocketsTemplatePart(initialCloudFormationTemplate, 'WebsocketsApi')
    ).to.deep.equal(expectedTemplatePart);
  });
});
