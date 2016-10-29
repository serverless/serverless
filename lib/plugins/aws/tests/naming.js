'use strict';

const expect = require('chai').expect;

const SDK = require('../provider/awsProvider');
const Serverless = require('../../../Serverless');

describe('#naming()', () => {
  let options;
  let serverless;
  let sdk;

  beforeEach(() => {
    options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless(options);
    sdk = new SDK(serverless, options);
  });

  it('#normalizeName()', () => {
    it('should capitalize the first letter', () => {
      expect(sdk.naming.normalizeName('name')).to.equal('Name');
    });
    it('should have no effect on caps', () => {
      expect(sdk.naming.normalizeName('Name')).to.equal('Name');
    });
    it('should have no effect on the rest of the name', () => {
      expect(sdk.naming.normalizeName('nAME')).to.equal('NAME');
    });
  });
  it('#normalizeNameToAlphaNumericOnly()', () => {
    it('should strip non-alpha-numeric characters', () => {
      expect(sdk.naming
        .normalizeNameToAlphaNumericOnly('`!@#$%^&*()-={}|[]\\:";\'<>?,./')).to.be('');
    });
    it('should apply normalizeName to the remaining characters', () => {
      expect(sdk.naming.normalizeNameToAlphaNumericOnly('a-b-c')).to.be('Abc');
    });
  });
  it('#normalizeNameToCapitalAlphaNumbericOnly()', () => {
    it('converts `-` to `Dash`', () => {
      expect(sdk.naming.normalizePathtoCapitalAlphaNumbericOnlyWithReplacement(
        'a-path'
      )).to.equal('ADashpath');
    });
    it('converts variable declarations (`${var}`) to `1Var`', () => {
      expect(sdk.naming.normalizePathtoCapitalAlphaNumbericOnlyWithReplacement(
        '${variable}'
      )).to.equal('1Var');
    });
    it('converts variable declarations prefixes to `1Var`', () => {
      expect(sdk.naming.normalizePathtoCapitalAlphaNumbericOnlyWithReplacement(
        '${variable}Path'
      )).to.equal('1VarPath');
    });
    it('converts variable declarations suffixes to `1Var`', () => {
      expect(sdk.naming.normalizePathtoCapitalAlphaNumbericOnlyWithReplacement(
        'path${variable}'
      )).to.equal('Path1Var');
    });
    it('converts variable declarations in center to `1Var`', () => {
      expect(sdk.naming.normalizePathtoCapitalAlphaNumbericOnlyWithReplacement(
        'path${variable}Dir'
      )).to.equal('Path1VarDir');
    });
  });
  it('#getServiceEndpointRegex()', () => {
    it('should match the prefix', () => {
      expect(sdk.naming.getServiceEndpointRegex().match('ServiceEndpoint')).to.be(true);
    });
    it('should not match a name without the prefix', () => {
      expect(sdk.naming.getServiceEndpointRegex().match('NotThePrefixServiceEndpoint')).to.be(true);
    });
    it('should match a name with the prefix', () => {
      expect(sdk.naming.getServiceEndpointRegex().match('ServiceEndpointForAService')).to.be(true);
    });
  });
  it('#getStackName()', () => {
    it('should use the service name and stage from the service and config', () => {
      serverless.service.service = 'myService';
      expect(sdk.naming.getStackName()).to.equal(`${serverless.service.service}-${options.stage}`);
    });
    it('should handle undefined service name', () => {
      serverless.service.service = 'myService';
      expect(sdk.naming.getStackName()).to.equal(`${undefined}-${options.stage}`);
    });
    it('should handle undefined stage', () => {
      serverless.service.service = 'myService';
      delete serverless.config.stage;
      expect(sdk.naming.getStackName()).to.equal(`${serverless.service.service}-${undefined}`);
    });
  });
  it('#getRolePath()', () => {
    it('should return `/`', () => {
      expect(sdk.naming.getRolePath()).to.equal('/');
    });
  });
  it('#getRoleName()', () => {
    it('uses the service name, stage, and region to generate a role name', () => {
      serverless.service.service = 'myService';
      expect(sdk.naming.getRoleName()).to.eql({
        'Fn::Join': [
          '-',
          [
            serverless.service.service,
            options.stage,
            options.region,
            'lambdaRole',
          ],
        ],
      });
    });
    it('handles undefined service name', () => {
      expect(sdk.naming.getRoleName()).to.eql({
        'Fn::Join': [
          '-',
          [
            undefined,
            options.stage,
            options.region,
            'lambdaRole',
          ],
        ],
      });
    });
    it('handles undefined stage', () => {
      serverless.service.service = 'myService';
      delete serverless.config.stage;
      expect(sdk.naming.getRoleName()).to.eql({
        'Fn::Join': [
          '-',
          [
            serverless.service.service,
            undefined,
            options.region,
            'lambdaRole',
          ],
        ],
      });
    });
    it('handles undefined region', () => {
      serverless.service.service = 'myService';
      delete serverless.config.region;
      expect(sdk.naming.getRoleName()).to.eql({
        'Fn::Join': [
          '-',
          [
            serverless.service.service,
            options.stage,
            undefined,
            'lambdaRole',
          ],
        ],
      });
    });
  });
  it('#getLogicalRoleName()', () => {
    it('should return the expected role name (IamRoleLambdaExecution)', () => {
      expect(sdk.naming.getLogicalRoleName()).to.equal('IamRoleLambdaExecution');
    });
  });
  it('#getPolicyName()', () => {
    it('should use the stage and service name', () => {
      serverless.service.service = 'myService';
      expect(sdk.naming.getRoleName()).to.eql({
        'Fn::Join': [
          '-',
          [
            options.stage,
            serverless.service.service,
            'lambda',
          ],
        ],
      });
    });
    it('handles undefined stage', () => {
      serverless.service.service = 'myService';
      delete serverless.config.stage;
      expect(sdk.naming.getRoleName()).to.eql({
        'Fn::Join': [
          '-',
          [
            undefined,
            serverless.service.service,
            'lambda',
          ],
        ],
      });
    });
    it('handles undefined service name', () => {
      expect(sdk.naming.getRoleName()).to.eql({
        'Fn::Join': [
          '-',
          [
            options.stage,
            undefined,
            'lambda',
          ],
        ],
      });
    });
  });
  it('#getLogicalPolicyName()', () => {
    it('should return the expected policy name (IamPolicyLambdaExecution)', () => {
      expect(sdk.naming.getLogicalPolicyName()).to.equal('IamPolicyLambdaExecution');
    });
  });
  it('#getLogGroupName()', () => {
    it('should add the function name to the log group name', () => {
      expect(sdk.naming.getLogGroupName('functionName')).to.equal('/aws/lambda/functionName');
    });
  });
  it('#getNormalizedLambdaName()', () => {
    it('should normalize the given functionName', () => {
      expect(sdk.naming.getNormalizedLambdaName('functionName')).to.equal('FunctionName');
    });
  });
  it('#extractLambdaNameFromArn()', () => {
    it('should extract everything after the last colon and dash', () => {
      const arn = 'arn:aws:lambda:us-east-1:0123456789:my-dev-lambda';
      expect(sdk.naming.extractLambdaNameFromArn(arn)).to.equal('lambda');
    });
  });
  it('#extractLambdaNameFromArn2()', () => {
    it('should extract everything after the last colon', () => {
      const arn = 'arn:aws:lambda:us-east-1:0123456789:my-dev-lambda';
      expect(sdk.naming.extractLambdaNameFromArn(arn)).to.equal('my-dev-lambda');
    });
  });
  it('#getLogicalLambdaName()', () => {
    it('should normalize the function name and add the logical suffix', () => {
      expect(sdk.naming.getNormalizedLambdaName('functionName'))
        .to.equal('FunctionNameLambdaFunction');
    });
  });
  it('#getLogicalLambdaNameRegex()', () => {
    it('should match the suffix', () => {
      expect(sdk.naming.getLogicalLambdaNameRegex().match('LambdaFunction')).to.be(true);
    });
    it('should not match a name without the suffix', () => {
      expect(sdk.naming.getLogicalLambdaNameRegex()
        .match('LambdaFunctionNotTheSuffix')).to.be(false);
    });
    it('should match a name with the suffix', () => {
      expect(sdk.naming.getLogicalLambdaNameRegex()
        .match('AFunctionNameLambdaFunction')).to.be(true);
    });
  });
  it('#getLogicalLambdaArnName()', () => {
    it('should normalize the function name and add the logical arn suffix', () => {
      expect(
        sdk.naming.getLogicalLambdaArnName('functionName')
      ).to.equal('FunctionNameLambdaFunctionArn');
    });
  });
  it('#getLogicalLambdaArnNameRegex()', () => {
    it('should match the suffix', () => {
      expect(sdk.naming.getLogicalLambdaArnNameRegex().match('aLambdaFunctionArn')).to.be(true);
    });
    it('should not match a name without the suffix', () => {
      expect(sdk.naming.getLogicalLambdaArnNameRegex()
        .match('LambdaFunctionArnNotTheSuffix'))
        .to.be(false);
    });
    it('should match a name with the suffix', () => {
      expect(sdk.naming.getLogicalLambdaArnNameRegex()
        .match('AFunctionArnNameLambdaFunctionArn'))
        .to.be(true);
    });
  });
  it('#getApiGatewayName()', () => {
    it('should return the composition of stage and service name', () => {
      serverless.service.service = 'myService';
      expect(sdk.naming.getApiGatewayName())
        .to.equal(`${options.stage}-${serverless.service.service}`);
    });
    it('should handle undefined stage', () => {
      serverless.service.service = 'myService';
      delete serverless.config.stage;
      expect(sdk.naming.getApiGatewayName()).to.equal(`${undefined}-${serverless.service.service}`);
    });
    it('should handle undefined service name', () => {
      expect(sdk.naming.getApiGatewayName()).to.equal(`${options.stage}-${undefined}`);
    });
  });
  it('#getApiGatewayDeploymentId()', () => {
    it('should return ApiGatewayDeployment with a date based suffix', () => {
      expect(sdk.naming.getApiGatewayDeploymentId().match(/ApiGatewayDeployment(.*)/).length)
        .to.be.greaterThan(1);
    });
  });
  it('#getLogicalApiGatewayName()', () => {
    it('should return ApiGatewayRestApi', () => {
      expect(sdk.naming.getLogicalApiGatewayName()).to.equal('ApiGatewayRestApi');
    });
  });
  it('#getNormalizedAuthorizerName()', () => {
    it('normalize the authorizer name', () => {
      expect(sdk.naming.getNormalizedAuthorizerName('authorizerName')).to('AuthorizerName');
    });
  });
  it('#getLogicalAuthorizerName()', () => {
    it('should normalize the authorizer name and add the standard suffix', () => {
      expect('authorizerName').to.equal('AuthorizerNameApiGatewayAuthorizer');
    });
  });
  it('#extractAuthorizerIdFromArn()', () => {
    it('should extract the authorizer name from an ARN', () => {
      const arn = 'arn:aws:lambda:us-east-1:0123456789:my-dev-lambda';
      expect(sdk.naming.extractAuthorizerIdFromArn(arn)).to.equal('lambda');
    });
  });
  it('#getLogicalAuthorizerArnName()', () => {
    it('should normalize the authorizer name and add the standard arn suffix', () => {
      expect('authorizerName').to.equal('AuthorizerNameApiGatewayAuthorizerArn');
    });
  });
  it('#getNormalizedApiGatewayResourceName()', () => {
    it('should normalize each part of the resource path and remove non-alpha-numeric characters',
      () => {
        expect(sdk.naming.getNormalizedApiGatewayResourceName(
          'my/path/to/a-${var}-resource'
        )).to.equal('MyPathToADash1VarDashResource');
      });
  });
  it('#getLogicalApiGatewayResourceName()', () => {
    it('should normalize the resource and add the standard suffix', () => {
      expect(sdk.naming.getLogicalApiGatewayResourceName(
        'my/path/to/a-${var}-resource'
      )).to.equal('ApiGatewayResourceMyPathToADash1VarDashResource');
    });
  });
  it('#extractResourceId()', () => {
    it('should extract the normalized resource name', () => {
      expect(sdk.naming.extractResourceId(
        'ApiGatewayResourceMyPathToADash1VarDashResource'
      )).to.equal('ResourceMyPathToADash1VarDashResource');
    });
  });
  it('#getNormalizedApiGatewayMethodName()', () => {
    it('should capitalize the first letter and lowercase any other characters', () => {
      expect(sdk.naming.getNormalizedApiGatewayMethodName('gET')).to.equal('Get');
    });
  });
  it('#getLogicalApiGatewayMethodName()', () => {
    it('', () => {
      expect(sdk.naming.getLogicalApiGatewayMethodName(
        'ResourceId'
      )).to.equal('ApiGatewayMethodResourceIdGet');
    });
  });
  it('#getLogicalApiGatewayApiKeyRegex()', () => {
    it('should match the prefix', () => {
      expect(sdk.naming.getLogicalApiGatewayApiKeyRegex().match('ApiGatewayApiKey')).to.be(true);
    });
    it('should not match a name without the prefix', () => {
      expect(sdk.naming.getLogicalApiGatewayApiKeyRegex()
        .match('NotThePrefixApiGatewayApiKey'))
        .to.be(false);
    });
    it('should match a name with the prefix', () => {
      expect(sdk.naming.getLogicalApiGatewayApiKeyRegex()
        .match('ApiGatewayApiKeySuffix')).to.be(true);
    });
  });

  it('#getLogicalDeploymentBucketName()', () => {
    it('should return "ServerlessDeploymentBucket"', () => {
      expect(sdk.naming.getLogicalRoleName()).to.equal('ServerlessDeploymentBucket');
    });
  });
  it('#getLogicalDeploymentBucketOutputVariableName()', () => {
    it('should return "ServerlessDeploymentBucketName"', () => {
      expect(sdk.naming.getLogicalRoleName()).to.equal('ServerlessDeploymentBucketName');
    });
  });
  it('#getNormalizedBucketName()', () => {
    it('should remove all non-alpha-numeric characters and capitalize the first letter', () => {
      expect(sdk.naming.getNormalizedBucketName('b!u@c#k$e%t^N&a*m(e')).to.equal('BucketName');
    });
  });
  it('#getLogicalBucketName()', () => {
    it('should normalize the bucket name and add the standard prefix', () => {
      expect(sdk.naming.getLogicalBucketName('b!u@c#k$e%t^N&a*m(e')).to.equal('S3BucketBucketName');
    });
  });
  it('#getNormalizedSnsTopicName()', () => {
    it('should remove all non-alpha-numeric characters and capitalize the first letter', () => {
      expect(sdk.naming.getNormalizedSnsTopicName('t!o@p#i$c%N^a&m*e')).to.equal('TopicName');
    });
  });
  it('#getLogicalSnsTopicName()', () => {
    it('should remove all non-alpha-numeric characters and capitalize the first letter', () => {
      expect(sdk.naming.getLogicalSnsTopicName('t!o@p#i$c%N^a&m*e')).to.equal('SNSTopicTopicName');
    });
  });
  it('#getCloudWatchEventId()', () => {
    it('should add the standard suffix', () => {
      expect(sdk.naming.getCloudWatchEventId('functionName')).to.equal('functionNameSchedule');
    });
  });
  it('#getCloudWatchEventName()', () => {
    it('should normalize the function name and add the standard suffix including the index', () => {
      expect(sdk.naming.getCloudWatchEventName('functionName', 0))
        .to.equal('FunctionNameEventsRuleSchedule0');
    });
  });
  it('#getLambdaS3PermissionName()', () => {
    it('should normalize the function name and add the standard suffix', () => {
      expect('functionName').to.equal('FunctionNameLambdaPermissionS3');
    });
  });
  it('#getLambdaSnsTopicPermissionName()', () => {
    it('should normalize the function and topic names and add them as prefix and suffix to the ' +
      'standard permission center', () => {
      expect(sdk.naming.getLambdaSnsTopicPermissionName('functionName', 'topicName'))
        .to.equal('FunctionNameLambdaPermissionTopicName');
    });
  });
  it('#getLambdaCloudWatchEventPermissionName()', () => {
    it('should normalize the function name and add the standard suffix including event index',
      () => {
        expect(sdk.naming.getLambdaCloudWatchEventPermissionName('functionName', 0))
          .to.equal('FunctionNameLambdaPermissionEventsRuleSchedule0');
      });
  });
  it('#getLambdaApiGatewayPermissionName()', () => {
    it('should normalize the function name and append the standard suffix', () => {
      expect(sdk.naming.getLambdaApiGatewayPermissionName('functionName'))
        .to.equal('FunctionNameLambdaPermissionApiGateway');
    });
  });
});
