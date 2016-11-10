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

  describe('#normalizeName()', () => {
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
  describe('#normalizeNameToAlphaNumericOnly()', () => {
    it('should strip non-alpha-numeric characters', () => {
      expect(sdk.naming
        .normalizeNameToAlphaNumericOnly('`!@#$%^&*()-={}|[]\\:";\'<>?,./')).to.equal('');
    });
    it('should apply normalizeName to the remaining characters', () => {
      expect(sdk.naming.normalizeNameToAlphaNumericOnly('a-b-c')).to.equal('Abc');
    });
  });
  describe('#normalizeNameToCapitalAlphaNumbericOnly()', () => {
    it('converts `-` to `Dash`', () => {
      expect(sdk.naming.normalizePathtoCapitalAlphaNumbericOnlyWithReplacement(
        'a-path'
      )).to.equal('ADashpath');
    });
    it('converts variable declarations (`${var}`) to `VariableVar`', () => {
      expect(sdk.naming.normalizePathtoCapitalAlphaNumbericOnlyWithReplacement(
        '${variable}'
      )).to.equal('VariableVar');
    });
    it('converts variable declarations prefixes to `VariableVarPath`', () => {
      expect(sdk.naming.normalizePathtoCapitalAlphaNumbericOnlyWithReplacement(
        '${variable}Path'
      )).to.equal('VariableVarPath');
    });
    it('converts variable declarations suffixes to `PathvariableVar`', () => {
      expect(sdk.naming.normalizePathtoCapitalAlphaNumbericOnlyWithReplacement(
        'path${variable}'
      )).to.equal('PathvariableVar');
    });
    it('converts variable declarations in center to `PathvariableVarDir`', () => {
      expect(sdk.naming.normalizePathtoCapitalAlphaNumbericOnlyWithReplacement(
        'path${variable}Dir'
      )).to.equal('PathvariableVarDir');
    });
  });
  describe('#getServiceEndpointRegex()', () => {
    it('should match the prefix', () => {
      expect(sdk.naming.getServiceEndpointRegex().test('ServiceEndpoint'))
        .to.equal(true);
    });
    it('should not match a name without the prefix', () => {
      expect(sdk.naming.getServiceEndpointRegex()
        .test('NotThePrefixServiceEndpoint')).to.equal(false);
    });
    it('should match a name with the prefix', () => {
      expect(sdk.naming.getServiceEndpointRegex()
        .test('ServiceEndpointForAService')).to.equal(true);
    });
  });
  describe('#getStackName()', () => {
    it('should use the service name and stage from the service and config', () => {
      serverless.service.service = 'myService';
      expect(sdk.naming.getStackName()).to.equal(`${serverless.service.service}-${options.stage}`);
    });
  });
  describe('#getNormalizedLambdaName()', () => {
    it('should normalize the given functionName', () => {
      expect(sdk.naming.getNormalizedLambdaName('functionName'))
        .to.equal('FunctionName');
    });
  });
  describe('#extractAuthorizerNameFromArn()', () => {
    it('should extract everything after the last colon and dash', () => {
      const arn = 'arn:aws:lambda:us-east-1:0123456789:my-dev-lambda';
      expect(sdk.naming.extractAuthorizerNameFromArn(arn)).to.equal('lambda');
    });
  });
  describe('#extractLambdaNameFromArn()', () => {
    it('should extract everything after the last colon', () => {
      const arn = 'arn:aws:lambda:us-east-1:0123456789:my-dev-lambda';
      expect(sdk.naming.extractLambdaNameFromArn(arn)).to.equal('my-dev-lambda');
    });
  });
  describe('#getLogicalLambdaName()', () => {
    it('should normalize the function name and add the logical suffix', () => {
      expect(sdk.naming.getLogicalLambdaName('functionName'))
        .to.equal('FunctionNameLambdaFunction');
    });
  });
  describe('#getLogicalLambdaNameRegex()', () => {
    it('should match the suffix', () => {
      expect(sdk.naming.getLogicalLambdaNameRegex()
        .test('LambdaFunction')).to.equal(true);
    });
    it('should not match a name without the suffix', () => {
      expect(sdk.naming.getLogicalLambdaNameRegex()
        .test('LambdaFunctionNotTheSuffix')).to.equal(false);
    });
    it('should match a name with the suffix', () => {
      expect(sdk.naming.getLogicalLambdaNameRegex()
        .test('AFunctionNameLambdaFunction')).to.equal(true);
    });
  });
  describe('#getLogicalLambdaArnName()', () => {
    it('should normalize the function name and add the logical arn suffix', () => {
      expect(
        sdk.naming.getLogicalLambdaArnName('functionName')
      ).to.equal('FunctionNameLambdaFunctionArn');
    });
  });
  describe('#getLogicalLambdaArnNameRegex()', () => {
    it('should match the suffix', () => {
      expect(sdk.naming.getLogicalLambdaArnNameRegex()
        .test('aLambdaFunctionArn')).to.equal(true);
    });
    it('should not match a name without the suffix', () => {
      expect(sdk.naming.getLogicalLambdaArnNameRegex()
        .test('LambdaFunctionArnNotTheSuffix'))
        .to.equal(false);
    });
    it('should match a name with the suffix', () => {
      expect(sdk.naming.getLogicalLambdaArnNameRegex()
        .test('AFunctionArnNameLambdaFunctionArn'))
        .to.equal(true);
    });
  });
  describe('#getApiGatewayName()', () => {
    it('should return the composition of stage and service name', () => {
      serverless.service.service = 'myService';
      expect(sdk.naming.getApiGatewayName())
        .to.equal(`dev-${serverless.service.service}`);
    });
  });
  describe('#getApiGatewayDeploymentId()', () => {
    it('should return ApiGatewayDeployment with a date based suffix', () => {
      expect(sdk.naming.getApiGatewayDeploymentId().match(/ApiGatewayDeployment(.*)/).length)
        .to.be.greaterThan(1);
    });
  });
  describe('#getLogicalApiGatewayName()', () => {
    it('should return ApiGatewayRestApi', () => {
      expect(sdk.naming.getLogicalApiGatewayName()).to.equal('ApiGatewayRestApi');
    });
  });
  describe('#getNormalizedAuthorizerName()', () => {
    it('normalize the authorizer name', () => {
      expect(sdk.naming.getNormalizedAuthorizerName('authorizerName'))
        .to.equal('AuthorizerName');
    });
  });
  describe('#getLogicalAuthorizerName()', () => {
    it('should normalize the authorizer name and add the standard suffix', () => {
      expect(sdk.naming.getLogicalAuthorizerName('authorizerName'))
        .to.equal('AuthorizerNameApiGatewayAuthorizer');
    });
  });
  describe('#extractAuthorizerNameFromArn()', () => {
    it('should extract the authorizer name from an ARN', () => {
      const arn = 'arn:aws:lambda:us-east-1:0123456789:my-dev-lambda';
      expect(sdk.naming.extractAuthorizerNameFromArn(arn)).to.equal('lambda');
    });
  });
  describe('#getLogicalAuthorizerArnName()', () => {
    it('should normalize the authorizer name and add the standard arn suffix', () => {
      expect(sdk.naming.getLogicalAuthorizerArnName('authorizerName'))
        .to.equal('AuthorizerNameApiGatewayAuthorizerArn');
    });
  });
  describe('#getNormalizedApiGatewayResourceName()', () => {
    it('should normalize each part of the resource path and remove non-alpha-numeric characters',
      () => {
        expect(sdk.naming.getNormalizedApiGatewayResourceName(
          'my/path/to/a-${var}-resource'
        )).to.equal('MyPathToADashvarVarDashresource');
      });
  });
  describe('#getLogicalApiGatewayResourceName()', () => {
    it('should normalize the resource and add the standard suffix', () => {
      expect(sdk.naming.getLogicalApiGatewayResourceName(
        'my/path/to/a-${var}-resource'
      )).to.equal('ApiGatewayResourceMyPathToADashvarVarDashresource');
    });
  });
  describe('#extractResourceId()', () => {
    it('should extract the normalized resource name', () => {
      expect(sdk.naming.extractResourceId(
        'ApiGatewayResourceMyPathToADashvarVarDashResource'
      )).to.equal('MyPathToADashvarVarDashResource');
    });
  });
  describe('#getNormalizedApiGatewayMethodName()', () => {
    it('should capitalize the first letter and lowercase any other characters', () => {
      expect(sdk.naming.getNormalizedApiGatewayMethodName('gET')).to.equal('Get');
    });
  });
  describe('#getLogicalApiGatewayMethodName()', () => {
    it('', () => {
      expect(sdk.naming.getLogicalApiGatewayMethodName(
        'ResourceId', 'get'
      )).to.equal('ApiGatewayMethodResourceIdGet');
    });
  });
  describe('#getLogicalApiGatewayApiKeyRegex()', () => {
    it('should match the prefix', () => {
      expect(sdk.naming.getLogicalApiGatewayApiKeyRegex()
        .test('ApiGatewayApiKey')).to.equal(true);
    });
    it('should not match a name without the prefix', () => {
      expect(sdk.naming.getLogicalApiGatewayApiKeyRegex()
        .test('NotThePrefixApiGatewayApiKey')).to.equal(false);
    });
    it('should match a name with the prefix', () => {
      expect(sdk.naming.getLogicalApiGatewayApiKeyRegex()
        .test('ApiGatewayApiKeySuffix')).to.equal(true);
    });
  });

  describe('#getLogicalDeploymentBucketName()', () => {
    it('should return "ServerlessDeploymentBucket"', () => {
      expect(sdk.naming.getLogicalDeploymentBucketName()).to.equal('ServerlessDeploymentBucket');
    });
  });
  describe('#getLogicalDeploymentBucketOutputVariableName()', () => {
    it('should return "ServerlessDeploymentBucketName"', () => {
      expect(sdk.naming.getLogicalDeploymentBucketOutputVariableName())
        .to.equal('ServerlessDeploymentBucketName');
    });
  });
  describe('#getNormalizedBucketName()', () => {
    it('should remove all non-alpha-numeric characters and capitalize the first letter', () => {
      expect(sdk.naming.getNormalizedBucketName('b!u@c#k$e%t^N&a*m(e')).to.equal('BucketName');
    });
  });
  describe('#getLogicalBucketName()', () => {
    it('should normalize the bucket name and add the standard prefix', () => {
      expect(sdk.naming.getLogicalBucketName('b!u@c#k$e%t^N&a*m(e')).to.equal('S3BucketBucketName');
    });
  });
  describe('#getNormalizedSnsTopicName()', () => {
    it('should remove all non-alpha-numeric characters and capitalize the first letter', () => {
      expect(sdk.naming.getNormalizedSnsTopicName('t!o@p#i$c%N^a&m*e')).to.equal('TopicName');
    });
  });
  describe('#getLogicalSnsTopicName()', () => {
    it('should remove all non-alpha-numeric characters and capitalize the first letter', () => {
      expect(sdk.naming.getLogicalSnsTopicName('t!o@p#i$c%N^a&m*e')).to.equal('SNSTopicTopicName');
    });
  });
  describe('#getCloudWatchEventId()', () => {
    it('should add the standard suffix', () => {
      expect(sdk.naming.getCloudWatchEventId('functionName')).to.equal('functionNameSchedule');
    });
  });
  describe('#getCloudWatchEventName()', () => {
    it('should normalize the function name and add the standard suffix including the index', () => {
      expect(sdk.naming.getCloudWatchEventName('functionName', 0))
        .to.equal('FunctionNameEventsRuleSchedule0');
    });
  });
  describe('#getLambdaS3PermissionName()', () => {
    it('should normalize the function name and add the standard suffix', () => {
      expect(sdk.naming.getLambdaS3PermissionName('functionName'))
        .to.equal('FunctionNameLambdaPermissionS3');
    });
  });
  describe('#getLambdaSnsTopicPermissionName()', () => {
    it('should normalize the function and topic names and add them as prefix and suffix to the ' +
      'standard permission center', () => {
      expect(sdk.naming.getLambdaSnsTopicPermissionName('functionName', 'topicName'))
        .to.equal('FunctionNameLambdaPermissionTopicName');
    });
  });
  describe('#getLambdaCloudWatchEventPermissionName()', () => {
    it('should normalize the function name and add the standard suffix including event index',
      () => {
        expect(sdk.naming.getLambdaCloudWatchEventPermissionName('functionName', 0))
          .to.equal('FunctionNameLambdaPermissionEventsRuleSchedule0');
      });
  });
  describe('#getLambdaApiGatewayPermissionName()', () => {
    it('should normalize the function name and append the standard suffix', () => {
      expect(sdk.naming.getLambdaApiGatewayPermissionName('functionName'))
        .to.equal('FunctionNameLambdaPermissionApiGateway');
    });
  });
});
