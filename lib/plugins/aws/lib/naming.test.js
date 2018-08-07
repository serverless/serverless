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

  describe('#normalizePathPart()', () => {
    it('converts `-` to `Dash`', () => {
      expect(sdk.naming.normalizePathPart(
        'a-path'
      )).to.equal('ADashpath');
    });

    it('converts variable declarations (`${var}`) to `VariableVar`', () => {
      expect(sdk.naming.normalizePathPart(
        '${variable}'
      )).to.equal('VariableVar');
    });

    it('converts variable declarations prefixes to `VariableVarpath`', () => {
      expect(sdk.naming.normalizePathPart(
        '${variable}Path'
      )).to.equal('VariableVarpath');
    });

    it('converts variable declarations suffixes to `PathvariableVar`', () => {
      expect(sdk.naming.normalizePathPart(
        'path${variable}'
      )).to.equal('PathvariableVar');
    });

    it('converts variable declarations in center to `PathvariableVardir`', () => {
      expect(sdk.naming.normalizePathPart(
        'path${variable}Dir'
      )).to.equal('PathvariableVardir');
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
    it('should use the service name & stage if custom stack name not provided', () => {
      serverless.service.service = 'myService';
      expect(sdk.naming.getStackName()).to.equal(`${serverless.service.service}-${
        sdk.naming.provider.getStage()}`);
    });

    it('should use the custom stack name if provided', () => {
      serverless.service.provider.stackName = 'app-dev-testApp';
      serverless.service.service = 'myService';
      serverless.service.provider.stage = sdk.naming.provider.getStage();
      expect(sdk.naming.getStackName()).to.equal('app-dev-testApp');
    });
  });

  describe('#getRolePath()', () => {
    it('should return `/`', () => {
      expect(sdk.naming.getRolePath()).to.equal('/');
    });
  });

  describe('#getRoleName()', () => {
    it('uses the service name, stage, and region to generate a role name', () => {
      serverless.service.service = 'myService';
      expect(sdk.naming.getRoleName()).to.eql({
        'Fn::Join': [
          '-',
          [
            serverless.service.service,
            sdk.naming.provider.getStage(),
            sdk.naming.provider.getRegion(),
            'lambdaRole',
          ],
        ],
      });
    });
  });

  describe('#getRoleLogicalId()', () => {
    it('should return the expected role name (IamRoleLambdaExecution)', () => {
      expect(sdk.naming.getRoleLogicalId()).to.equal('IamRoleLambdaExecution');
    });
  });

  describe('#getPolicyName()', () => {
    it('should use the stage and service name', () => {
      serverless.service.service = 'myService';
      expect(sdk.naming.getPolicyName()).to.eql({
        'Fn::Join': [
          '-',
          [
            sdk.naming.provider.getStage(),
            serverless.service.service,
            'lambda',
          ],
        ],
      });
    });
  });

  describe('#getLogicalLogGroupName()', () => {
    it('should prefix the normalized function name to "LogGroup"', () => {
      expect(sdk.naming.getLogGroupLogicalId('functionName')).to.equal('FunctionNameLogGroup');
    });
  });

  describe('#getLogGroupName()', () => {
    it('should add the function name to the log group name', () => {
      expect(sdk.naming.getLogGroupName('functionName')).to.equal('/aws/lambda/functionName');
    });
  });

  describe('#getNormalizedFunctionName()', () => {
    it('should normalize the given functionName', () => {
      expect(sdk.naming.getNormalizedFunctionName('functionName'))
        .to.equal('FunctionName');
    });

    it('should normalize the given functionName with an underscore', () => {
      expect(sdk.naming.getNormalizedFunctionName('hello_world'))
        .to.equal('HelloUnderscoreworld');
    });

    it('should normalize the given functionName with a dash', () => {
      expect(sdk.naming.getNormalizedFunctionName('hello-world'))
        .to.equal('HelloDashworld');
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

  describe('#getLambdaLogicalId()', () => {
    it('should normalize the function name and add the logical suffix', () => {
      expect(sdk.naming.getLambdaLogicalId('functionName'))
        .to.equal('FunctionNameLambdaFunction');
    });
  });

  describe('#getLambdaLogicalIdRegex()', () => {
    it('should match the suffix', () => {
      expect(sdk.naming.getLambdaLogicalIdRegex()
        .test('LambdaFunction')).to.equal(true);
    });

    it('should not match a name without the suffix', () => {
      expect(sdk.naming.getLambdaLogicalIdRegex()
        .test('LambdaFunctionNotTheSuffix')).to.equal(false);
    });

    it('should match a name with the suffix', () => {
      expect(sdk.naming.getLambdaLogicalIdRegex()
        .test('AFunctionNameLambdaFunction')).to.equal(true);
    });
  });

  describe('#getApiGatewayName()', () => {
    it('should return the composition of stage & service name if custom name not provided', () => {
      serverless.service.service = 'myService';
      expect(sdk.naming.getApiGatewayName())
        .to.equal(`${sdk.naming.provider.getStage()}-${serverless.service.service}`);
    });

    it('should return the custom api name if provided', () => {
      serverless.service.provider.apiName = 'app-dev-testApi';
      serverless.service.service = 'myService';
      serverless.service.provider.stage = sdk.naming.provider.getStage();
      expect(sdk.naming.getApiGatewayName()).to.equal('app-dev-testApi');
    });
  });

  describe('#generateApiGatewayDeploymentLogicalId()', () => {
    it('should return ApiGatewayDeployment with a date based suffix', () => {
      expect(sdk.naming.generateApiGatewayDeploymentLogicalId()
        .match(/ApiGatewayDeployment(.*)/).length)
        .to.be.greaterThan(1);
    });
  });

  describe('#getRestApiLogicalId()', () => {
    it('should return ApiGatewayRestApi', () => {
      expect(sdk.naming.getRestApiLogicalId()).to.equal('ApiGatewayRestApi');
    });
  });

  describe('#getNormalizedAuthorizerName()', () => {
    it('normalize the authorizer name', () => {
      expect(sdk.naming.getNormalizedAuthorizerName('authorizerName'))
        .to.equal('AuthorizerName');
    });
  });

  describe('#getAuthorizerLogicalId()', () => {
    it('should normalize the authorizer name and add the standard suffix', () => {
      expect(sdk.naming.getAuthorizerLogicalId('authorizerName'))
        .to.equal('AuthorizerNameApiGatewayAuthorizer');
    });
  });

  describe('#extractAuthorizerNameFromArn()', () => {
    it('should extract the authorizer name from an ARN', () => {
      const arn = 'arn:aws:lambda:us-east-1:0123456789:my-dev-lambda';
      expect(sdk.naming.extractAuthorizerNameFromArn(arn)).to.equal('lambda');
    });
  });

  describe('#normalizePath()', () => {
    it('should normalize each part of the resource path and remove non-alpha-numeric characters',
      () => {
        expect(sdk.naming.normalizePath(
          'my/path/to/a-${var}-resource'
        )).to.equal('MyPathToADashvarVarDashresource');
      });
  });

  describe('#getResourceLogicalId()', () => {
    it('should normalize the resource and add the standard suffix', () => {
      expect(sdk.naming.getResourceLogicalId(
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

  describe('#normalizeMethodName()', () => {
    it('should capitalize the first letter and lowercase any other characters', () => {
      expect(sdk.naming.normalizeMethodName('gET')).to.equal('Get');
    });
  });

  describe('#getMethodLogicalId()', () => {
    it('', () => {
      expect(sdk.naming.getMethodLogicalId(
        'ResourceId', 'get'
      )).to.equal('ApiGatewayMethodResourceIdGet');
    });
  });

  describe('#getApiKeyLogicalId(keyIndex)', () => {
    it('should produce the given index with ApiGatewayApiKey as a prefix', () => {
      expect(sdk.naming.getApiKeyLogicalId(1)).to.equal('ApiGatewayApiKey1');
    });
  });

  describe('#getApiKeyLogicalIdRegex()', () => {
    it('should match the prefix', () => {
      expect(sdk.naming.getApiKeyLogicalIdRegex()
        .test('ApiGatewayApiKey')).to.equal(true);
    });

    it('should not match a name without the prefix', () => {
      expect(sdk.naming.getApiKeyLogicalIdRegex()
        .test('NotThePrefixApiGatewayApiKey')).to.equal(false);
    });

    it('should match a name with the prefix', () => {
      expect(sdk.naming.getApiKeyLogicalIdRegex()
        .test('ApiGatewayApiKeySuffix')).to.equal(true);
    });
  });

  describe('#getUsagePlanLogicalId()', () => {
    it('should return ApiGateway usage plan logical id', () => {
      expect(sdk.naming.getUsagePlanLogicalId())
        .to.equal('ApiGatewayUsagePlan');
    });
  });

  describe('#getUsagePlanKeyLogicalId(keyIndex)', () => {
    it('should produce the given index with ApiGatewayUsagePlanKey as a prefix', () => {
      expect(sdk.naming.getUsagePlanKeyLogicalId(1)).to.equal('ApiGatewayUsagePlanKey1');
    });
  });

  describe('#getDeploymentBucketLogicalId()', () => {
    it('should return "ServerlessDeploymentBucket"', () => {
      expect(sdk.naming.getDeploymentBucketLogicalId()).to.equal('ServerlessDeploymentBucket');
    });
  });

  describe('#getDeploymentBucketOutputLogicalId()', () => {
    it('should return "ServerlessDeploymentBucketName"', () => {
      expect(sdk.naming.getDeploymentBucketOutputLogicalId())
        .to.equal('ServerlessDeploymentBucketName');
    });
  });

  describe('#normalizeBucketName()', () => {
    it('should remove all non-alpha-numeric characters and capitalize the first letter', () => {
      expect(sdk.naming.normalizeBucketName('b!u@c#k$e%t^N&a*m(e')).to.equal('BucketName');
    });
  });

  describe('#getBucketLogicalId()', () => {
    it('should normalize the bucket name and add the standard prefix', () => {
      expect(sdk.naming.getBucketLogicalId('b!u@c#k$e%t^N&a*m(e')).to.equal('S3BucketBucketName');
    });
  });

  describe('#normalizeTopicName()', () => {
    it('should remove all non-alpha-numeric characters and capitalize the first letter', () => {
      expect(sdk.naming.normalizeTopicName('t!o@p#i$c%N^a&m*e')).to.equal('TopicName');
    });
  });

  describe('#getTopicLogicalId()', () => {
    it('should remove all non-alpha-numeric characters and capitalize the first letter', () => {
      expect(sdk.naming.getTopicLogicalId('t!o@p#i$c%N^a&m*e')).to.equal('SNSTopicTopicName');
    });
  });

  describe('#getScheduleId()', () => {
    it('should add the standard suffix', () => {
      expect(sdk.naming.getScheduleId('functionName')).to.equal('functionNameSchedule');
    });
  });

  describe('#getScheduleLogicalId()', () => {
    it('should normalize the function name and add the standard suffix including the index', () => {
      expect(sdk.naming.getScheduleLogicalId('functionName', 0))
        .to.equal('FunctionNameEventsRuleSchedule0');
    });
  });

  describe('#getCloudWatchEventId()', () => {
    it('should add the standard suffix', () => {
      expect(sdk.naming.getCloudWatchEventId('functionName'))
        .to.equal('functionNameCloudWatchEvent');
    });
  });

  describe('#getCloudWatchEventLogicalId()', () => {
    it('should normalize the function name and add the standard suffix including the index', () => {
      expect(sdk.naming.getCloudWatchEventLogicalId('functionName', 0))
        .to.equal('FunctionNameEventsRuleCloudWatchEvent0');
    });
  });

  describe('#getCloudWatchLogLogicalId()', () => {
    it('should normalize the function name and add the standard suffix including the index', () => {
      expect(sdk.naming.getCloudWatchLogLogicalId('functionName', 0))
        .to.equal('FunctionNameLogsSubscriptionFilterCloudWatchLog0');
    });
  });

  describe('#getCognitoUserPoolLogicalId()', () => {
    it('should normalize the user pool name and add the standard prefix', () => {
      expect(sdk.naming.getCognitoUserPoolLogicalId('us-east-1_v123sDAS1'))
        .to.equal('CognitoUserPoolUseast1v123sDAS1');
    });
  });

  describe('#getLambdaS3PermissionLogicalId()', () => {
    it('should normalize the function name and add the standard suffix', () => {
      expect(sdk.naming.getLambdaS3PermissionLogicalId('functionName', 'bucket'))
        .to.equal('FunctionNameLambdaPermissionBucketS3');
    });
  });

  describe('#getLambdaSnsPermissionLogicalId()', () => {
    it('should normalize the function and topic names and add them as prefix and suffix to the ' +
      'standard permission center', () => {
      expect(sdk.naming.getLambdaSnsPermissionLogicalId('functionName', 'topic'))
        .to.equal('FunctionNameLambdaPermissionTopicSNS');
    });
  });

  describe('#getLambdaSchedulePermissionLogicalId()', () => {
    it('should normalize the function name and add the standard suffix including event index',
      () => {
        expect(sdk.naming.getLambdaSchedulePermissionLogicalId('functionName', 0))
          .to.equal('FunctionNameLambdaPermissionEventsRuleSchedule0');
      });
  });

  describe('#getLambdaCloudWatchEventPermissionLogicalId()', () => {
    it('should normalize the function name and add the standard suffix including event index',
      () => {
        expect(sdk.naming.getLambdaCloudWatchEventPermissionLogicalId('functionName', 0))
          .to.equal('FunctionNameLambdaPermissionEventsRuleCloudWatchEvent0');
      });
  });

  describe('#getLambdaApiGatewayPermissionLogicalId()', () => {
    it('should normalize the function name and append the standard suffix', () => {
      expect(sdk.naming.getLambdaApiGatewayPermissionLogicalId('functionName'))
        .to.equal('FunctionNameLambdaPermissionApiGateway');
    });
  });

  describe('#getIotLogicalId()', () => {
    it('should normalize the function name and add the standard suffix including the index', () => {
      expect(sdk.naming.getIotLogicalId('functionName', 0))
        .to.equal('FunctionNameIotTopicRule0');
    });
  });

  describe('#getLambdaIotPermissionLogicalId()', () => {
    it('should normalize the function name and add the standard suffix including event index',
      () => {
        expect(sdk.naming.getLambdaIotPermissionLogicalId('functionName', 0))
          .to.equal('FunctionNameLambdaPermissionIotTopicRule0');
      });
  });

  describe('#getLambdaAlexaSkillPermissionLogicalId()', () => {
    it('should normalize the function name and append the standard suffix',
      () => {
        expect(sdk.naming.getLambdaAlexaSkillPermissionLogicalId('functionName', 2))
          .to.equal('FunctionNameLambdaPermissionAlexaSkill2');
      });

    it('should normalize the function name and append a default suffix if not defined',
      () => {
        expect(sdk.naming.getLambdaAlexaSkillPermissionLogicalId('functionName'))
          .to.equal('FunctionNameLambdaPermissionAlexaSkill0');
      });
  });

  describe('#getLambdaAlexaSmartHomePermissionLogicalId()', () => {
    it('should normalize the function name and append the standard suffix',
      () => {
        expect(sdk.naming.getLambdaAlexaSmartHomePermissionLogicalId('functionName', 0))
          .to.equal('FunctionNameLambdaPermissionAlexaSmartHome0');
      });
  });

  describe('#getLambdaSnsSubscriptionLogicalId()', () => {
    it('should normalize the function name and append the standard suffix', () => {
      expect(sdk.naming.getLambdaSnsSubscriptionLogicalId('functionName', 'topicName'))
        .to.equal('FunctionNameSnsSubscriptionTopicName');
    });
  });

  describe('#getLambdaCloudWatchLogPermissionLogicalId()', () => {
    it('should normalize the function name and add the standard suffix including event index',
      () => {
        expect(sdk.naming.getLambdaCloudWatchLogPermissionLogicalId('functionName', 0))
          .to.equal('FunctionNameLambdaPermissionLogsSubscriptionFilterCloudWatchLog0');
      });
  });

  describe('#getLambdaCognitoUserPoolPermissionLogicalId()', () => {
    it('should normalize the function name and add the standard suffix', () => {
      expect(sdk.naming.getLambdaCognitoUserPoolPermissionLogicalId(
        'functionName',
        'Pool1',
        'CustomMessage'
      )).to.equal('FunctionNameLambdaPermissionCognitoUserPoolPool1TriggerSourceCustomMessage');
    });
  });

  describe('#getQueueLogicalId()', () => {
    it('should normalize the function name and add the standard suffix', () => {
      expect(sdk.naming.getQueueLogicalId('functionName', 'MyQueue'))
        .to.equal('FunctionNameEventSourceMappingSQSMyQueue');
    });
  });
});
