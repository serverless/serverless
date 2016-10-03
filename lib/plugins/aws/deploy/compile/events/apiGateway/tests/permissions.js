'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('#awsCompilePermissions()', () => {
  let serverless;
  let awsCompileApigEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };

    awsCompileApigEvents = new AwsCompileApigEvents(serverless);
    awsCompileApigEvents.restApiLogicalId = 'ApiGatewayRestApi';
  });

  it('should create permission resource when http events are given', () =>
    awsCompileApigEvents.compilePermissions({
      events: [
        {
          functionName: 'First',
          path: 'foo/bar',
          method: 'post',
        },
        {
          functionName: 'First',
          path: 'foo/bar',
          method: 'get',
        },
        {
          functionName: 'Second',
          path: 'bar/foo',
          method: 'get',
        },
      ],
    }).then(() => {
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FirstLambdaPermissionApiGateway
        .Properties.FunctionName['Fn::GetAtt'][0]).to.equal('FirstLambdaFunction');
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.SecondLambdaPermissionApiGateway
        .Properties.FunctionName['Fn::GetAtt'][0]).to.equal('SecondLambdaFunction');
    })
  );

  it('should create permission resources for authorizers', () =>
    awsCompileApigEvents.compilePermissions({
      events: [
        {
          authorizer: {
            name: 'authorizer',
            arn: { 'Fn::GetAtt': ['AuthorizerLambdaFunction', 'Arn'] },
          },
          functionName: 'First',
          path: 'foo/bar',
          method: 'post',
        },
      ],
    }).then(() => {
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.AuthorizerLambdaPermissionApiGateway
        .Properties.FunctionName['Fn::GetAtt'][0]).to.equal('AuthorizerLambdaFunction');
    })
  );

  it('should not create permission resources when http events are not given', () =>
    awsCompileApigEvents.compilePermissions({
      events: [],
    }).then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources
      ).to.deep.equal({});
    })
  );
});
