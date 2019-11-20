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
      expect(
        sdk.naming.normalizeNameToAlphaNumericOnly('`!@#$%^&*()-={}|[]\\:";\'<>?,./')
      ).to.equal('');
    });

    it('should apply normalizeName to the remaining characters', () => {
      expect(sdk.naming.normalizeNameToAlphaNumericOnly('a-b-c')).to.equal('Abc');
    });
  });

  describe('#normalizePathPart()', () => {
    it('converts `-` to `Dash`', () => {
      expect(sdk.naming.normalizePathPart('a-path')).to.equal('ADashpath');
    });

    it('converts variable declarations (`${var}`) to `VariableVar`', () => {
      expect(sdk.naming.normalizePathPart('${variable}')).to.equal('VariableVar');
    });

    it('converts variable declarations prefixes to `VariableVarpath`', () => {
      expect(sdk.naming.normalizePathPart('${variable}Path')).to.equal('VariableVarpath');
    });

    it('converts variable declarations suffixes to `PathvariableVar`', () => {
      expect(sdk.naming.normalizePathPart('path${variable}')).to.equal('PathvariableVar');
    });

    it('converts variable declarations in center to `PathvariableVardir`', () => {
      expect(sdk.naming.normalizePathPart('path${variable}Dir')).to.equal('PathvariableVardir');
    });
  });

  describe('#getServiceEndpointRegex()', () => {
    it('should match the prefix', () => {
      expect(sdk.naming.getServiceEndpointRegex().test('ServiceEndpoint')).to.equal(true);
    });

    it('should not match a name without the prefix', () => {
      expect(sdk.naming.getServiceEndpointRegex().test('NotThePrefixServiceEndpoint')).to.equal(
        false
      );
    });

    it('should match a name with the prefix', () => {
      expect(sdk.naming.getServiceEndpointRegex().test('ServiceEndpointForAService')).to.equal(
        true
      );
    });
  });

  describe('#getStackName()', () => {
    it('should use the service name & stage if custom stack name not provided', () => {
      serverless.service.service = 'myService';
      expect(sdk.naming.getStackName()).to.equal(
        `${serverless.service.service}-${sdk.naming.provider.getStage()}`
      );
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
            { Ref: 'AWS::Region' },
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
        'Fn::Join': ['-', [sdk.naming.provider.getStage(), serverless.service.service, 'lambda']],
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
      expect(sdk.naming.getNormalizedFunctionName('functionName')).to.equal('FunctionName');
    });

    it('should normalize the given functionName with an underscore', () => {
      expect(sdk.naming.getNormalizedFunctionName('hello_world')).to.equal('HelloUnderscoreworld');
    });

    it('should normalize the given functionName with a dash', () => {
      expect(sdk.naming.getNormalizedFunctionName('hello-world')).to.equal('HelloDashworld');
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
      expect(sdk.naming.getLambdaLogicalId('functionName')).to.equal('FunctionNameLambdaFunction');
    });
  });

  describe('#getLambdaLogicalIdRegex()', () => {
    it('should match the suffix', () => {
      expect(sdk.naming.getLambdaLogicalIdRegex().test('LambdaFunction')).to.equal(true);
    });

    it('should not match a name without the suffix', () => {
      expect(sdk.naming.getLambdaLogicalIdRegex().test('LambdaFunctionNotTheSuffix')).to.equal(
        false
      );
    });

    it('should match a name with the suffix', () => {
      expect(sdk.naming.getLambdaLogicalIdRegex().test('AFunctionNameLambdaFunction')).to.equal(
        true
      );
    });
  });

  describe('#getWebsocketsApiName()', () => {
    it('should return the composition of stage & service name if custom name not provided', () => {
      serverless.service.service = 'myService';
      expect(sdk.naming.getWebsocketsApiName()).to.equal(
        `${sdk.naming.provider.getStage()}-${serverless.service.service}-websockets`
      );
    });

    it('should return the custom api name if provided', () => {
      serverless.service.provider.websocketsApiName = 'app-dev-websockets-testApi';
      serverless.service.service = 'myService';
      serverless.service.provider.stage = sdk.naming.provider.getStage();
      expect(sdk.naming.getWebsocketsApiName()).to.equal('app-dev-websockets-testApi');
    });
  });

  describe('#getWebsocketsApiLogicalId()', () => {
    it('should return the websocket API logical id', () => {
      expect(sdk.naming.getWebsocketsApiLogicalId()).to.equal('WebsocketsApi');
    });
  });

  describe('#getWebsocketsIntegrationLogicalId()', () => {
    it('should return the integrations logical id', () => {
      expect(sdk.naming.getWebsocketsIntegrationLogicalId('myFunc')).to.equal(
        'MyFuncWebsocketsIntegration'
      );
    });
  });

  describe('#getLambdaWebsocketsPermissionLogicalId()', () => {
    it('should return the lambda websocket permission logical id', () => {
      expect(sdk.naming.getLambdaWebsocketsPermissionLogicalId('myFunc')).to.equal(
        'MyFuncLambdaPermissionWebsockets'
      );
    });
  });

  describe('#getNormalizedWebsocketsRouteKey()', () => {
    it('should return a normalized version of the route key', () => {
      expect(sdk.naming.getNormalizedWebsocketsRouteKey('$connect')).to.equal('Sconnect');

      expect(sdk.naming.getNormalizedWebsocketsRouteKey('foo/bar')).to.equal('fooSlashbar');

      expect(sdk.naming.getNormalizedWebsocketsRouteKey('foo-bar')).to.equal('fooDashbar');

      expect(sdk.naming.getNormalizedWebsocketsRouteKey('foo_bar')).to.equal('fooUnderscorebar');

      expect(sdk.naming.getNormalizedWebsocketsRouteKey('foo.bar')).to.equal('fooPeriodbar');
    });
  });

  describe('#getWebsocketsRouteLogicalId()', () => {
    it('should return the websockets route logical id', () => {
      expect(sdk.naming.getWebsocketsRouteLogicalId('$connect')).to.equal(
        'SconnectWebsocketsRoute'
      );
    });
  });

  describe('#getWebsocketsDeploymentLogicalId()', () => {
    it('should return the websockets deployment logical id', () => {
      expect(sdk.naming.getWebsocketsDeploymentLogicalId(1234)).to.equal(
        'WebsocketsDeployment1234'
      );
    });
  });

  describe('#getWebsocketsStageLogicalId()', () => {
    it('should return the websockets stage logical id', () => {
      expect(sdk.naming.getWebsocketsStageLogicalId()).to.equal('WebsocketsDeploymentStage');
    });
  });

  describe('#getWebsocketsAuthorizerLogicalId()', () => {
    it('should return the websockets authorizer logical id', () => {
      expect(sdk.naming.getWebsocketsAuthorizerLogicalId('auth')).to.equal(
        'AuthWebsocketsAuthorizer'
      );
    });
  });

  describe('#getWebsocketsLogGroupLogicalId()', () => {
    it('should return the Websockets log group logical id', () => {
      expect(sdk.naming.getWebsocketsLogGroupLogicalId()).to.equal('WebsocketsLogGroup');
    });
  });

  describe('#getApiGatewayName()', () => {
    it('should return the composition of stage & service name if custom name not provided', () => {
      serverless.service.service = 'myService';
      expect(sdk.naming.getApiGatewayName()).to.equal(
        `${sdk.naming.provider.getStage()}-${serverless.service.service}`
      );
    });

    it('should return the custom api name if provided', () => {
      serverless.service.provider.apiName = 'app-dev-testApi';
      serverless.service.service = 'myService';
      serverless.service.provider.stage = sdk.naming.provider.getStage();
      expect(sdk.naming.getApiGatewayName()).to.equal('app-dev-testApi');
    });
  });

  describe('#generateApiGatewayDeploymentLogicalId()', () => {
    it('should return ApiGatewayDeployment with a suffix', () => {
      expect(sdk.naming.generateApiGatewayDeploymentLogicalId(1234)).to.equal(
        'ApiGatewayDeployment1234'
      );
    });
  });

  describe('#getRestApiLogicalId()', () => {
    it('should return ApiGatewayRestApi', () => {
      expect(sdk.naming.getRestApiLogicalId()).to.equal('ApiGatewayRestApi');
    });
  });

  describe('#getNormalizedAuthorizerName()', () => {
    it('normalize the authorizer name', () => {
      expect(sdk.naming.getNormalizedAuthorizerName('authorizerName')).to.equal('AuthorizerName');
    });
  });

  describe('#getAuthorizerLogicalId()', () => {
    it('should normalize the authorizer name and add the standard suffix', () => {
      expect(sdk.naming.getAuthorizerLogicalId('authorizerName')).to.equal(
        'AuthorizerNameApiGatewayAuthorizer'
      );
    });
  });

  describe('#extractAuthorizerNameFromArn()', () => {
    it('should extract the authorizer name from an ARN', () => {
      const arn = 'arn:aws:lambda:us-east-1:0123456789:my-dev-lambda';
      expect(sdk.naming.extractAuthorizerNameFromArn(arn)).to.equal('lambda');
    });
  });

  describe('#normalizePath()', () => {
    it('should normalize each part of the resource path and remove non-alpha-numeric characters', () => {
      expect(sdk.naming.normalizePath('my/path/to/a-${var}-resource')).to.equal(
        'MyPathToADashvarVarDashresource'
      );
    });
  });

  describe('#getResourceLogicalId()', () => {
    it('should normalize the resource and add the standard suffix', () => {
      expect(sdk.naming.getResourceLogicalId('my/path/to/a-${var}-resource')).to.equal(
        'ApiGatewayResourceMyPathToADashvarVarDashresource'
      );
    });
  });

  describe('#extractResourceId()', () => {
    it('should extract the normalized resource name', () => {
      expect(
        sdk.naming.extractResourceId('ApiGatewayResourceMyPathToADashvarVarDashResource')
      ).to.equal('MyPathToADashvarVarDashResource');
    });
  });

  describe('#normalizeMethodName()', () => {
    it('should capitalize the first letter and lowercase any other characters', () => {
      expect(sdk.naming.normalizeMethodName('gET')).to.equal('Get');
    });
  });

  describe('#getMethodLogicalId()', () => {
    it('', () => {
      expect(sdk.naming.getMethodLogicalId('ResourceId', 'get')).to.equal(
        'ApiGatewayMethodResourceIdGet'
      );
    });
  });

  describe('#getValidatorLogicalId()', () => {
    it('', () => {
      expect(sdk.naming.getValidatorLogicalId('ResourceId', 'get')).to.equal(
        'ApiGatewayMethodResourceIdGetValidator'
      );
    });
  });

  describe('#getModelLogicalId()', () => {
    it('', () => {
      expect(sdk.naming.getModelLogicalId('ResourceId', 'get', 'application/json')).to.equal(
        'ApiGatewayMethodResourceIdGetApplicationJsonModel'
      );
    });
  });

  describe('#getApiKeyLogicalId(keyIndex)', () => {
    it('should produce the given index with ApiGatewayApiKey as a prefix', () => {
      expect(sdk.naming.getApiKeyLogicalId(1)).to.equal('ApiGatewayApiKey1');
    });

    it('should support API Key names', () => {
      expect(sdk.naming.getApiKeyLogicalId(1, 'free')).to.equal('ApiGatewayApiKeyFree1');
    });
  });

  describe('#getApiKeyLogicalIdRegex()', () => {
    it('should match the prefix', () => {
      expect(sdk.naming.getApiKeyLogicalIdRegex().test('ApiGatewayApiKey')).to.equal(true);
    });

    it('should not match a name without the prefix', () => {
      expect(sdk.naming.getApiKeyLogicalIdRegex().test('NotThePrefixApiGatewayApiKey')).to.equal(
        false
      );
    });

    it('should match a name with the prefix', () => {
      expect(sdk.naming.getApiKeyLogicalIdRegex().test('ApiGatewayApiKeySuffix')).to.equal(true);
    });
  });

  describe('#getUsagePlanLogicalId()', () => {
    it('should return the default ApiGateway usage plan logical id', () => {
      expect(sdk.naming.getUsagePlanLogicalId()).to.equal('ApiGatewayUsagePlan');
    });

    it('should return the named ApiGateway usage plan logical id', () => {
      expect(sdk.naming.getUsagePlanLogicalId('free')).to.equal('ApiGatewayUsagePlanFree');
    });
  });

  describe('#getUsagePlanKeyLogicalId()', () => {
    it('should produce the given index with ApiGatewayUsagePlanKey as a prefix', () => {
      expect(sdk.naming.getUsagePlanKeyLogicalId(1)).to.equal('ApiGatewayUsagePlanKey1');
    });

    it('should support API Key names', () => {
      expect(sdk.naming.getUsagePlanKeyLogicalId(1, 'free')).to.equal(
        'ApiGatewayUsagePlanKeyFree1'
      );
    });
  });

  describe('#getStageLogicalId()', () => {
    it('should return the API Gateway stage logical id', () => {
      expect(sdk.naming.getStageLogicalId()).to.equal('ApiGatewayStage');
    });
  });

  describe('#getApiGatewayLogGroupLogicalId()', () => {
    it('should return the API Gateway log group logical id', () => {
      expect(sdk.naming.getApiGatewayLogGroupLogicalId()).to.equal('ApiGatewayLogGroup');
    });
  });

  describe('#getDeploymentBucketLogicalId()', () => {
    it('should return "ServerlessDeploymentBucket"', () => {
      expect(sdk.naming.getDeploymentBucketLogicalId()).to.equal('ServerlessDeploymentBucket');
    });
  });

  describe('#getDeploymentBucketOutputLogicalId()', () => {
    it('should return "ServerlessDeploymentBucketName"', () => {
      expect(sdk.naming.getDeploymentBucketOutputLogicalId()).to.equal(
        'ServerlessDeploymentBucketName'
      );
    });
  });

  describe('#getDeploymentBucketPolicyLogicalId()', () => {
    it('should return "ServerlessDeploymentBucketPolicy"', () => {
      expect(sdk.naming.getDeploymentBucketPolicyLogicalId()).to.equal(
        'ServerlessDeploymentBucketPolicy'
      );
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
      expect(sdk.naming.getScheduleLogicalId('functionName', 0)).to.equal(
        'FunctionNameEventsRuleSchedule0'
      );
    });
  });

  describe('#getCloudWatchEventId()', () => {
    it('should add the standard suffix', () => {
      expect(sdk.naming.getCloudWatchEventId('functionName')).to.equal(
        'functionNameCloudWatchEvent'
      );
    });
  });

  describe('#getCloudWatchEventLogicalId()', () => {
    it('should normalize the function name and add the standard suffix including the index', () => {
      expect(sdk.naming.getCloudWatchEventLogicalId('functionName', 0)).to.equal(
        'FunctionNameEventsRuleCloudWatchEvent0'
      );
    });
  });

  describe('#getCloudWatchLogLogicalId()', () => {
    it('should normalize the function name and add the standard suffix including the index', () => {
      expect(sdk.naming.getCloudWatchLogLogicalId('functionName', 0)).to.equal(
        'FunctionNameLogsSubscriptionFilterCloudWatchLog0'
      );
    });
  });

  describe('#getCognitoUserPoolLogicalId()', () => {
    it('should normalize the user pool name and add the standard prefix', () => {
      expect(sdk.naming.getCognitoUserPoolLogicalId('us-east-1_v123sDAS1')).to.equal(
        'CognitoUserPoolUseast1v123sDAS1'
      );
    });
  });

  describe('#getLambdaS3PermissionLogicalId()', () => {
    it('should normalize the function name and add the standard suffix', () => {
      expect(sdk.naming.getLambdaS3PermissionLogicalId('functionName', 'bucket')).to.equal(
        'FunctionNameLambdaPermissionBucketS3'
      );
    });
  });

  describe('#getLambdaSnsPermissionLogicalId()', () => {
    it(
      'should normalize the function and topic names and add them as prefix and suffix to the ' +
        'standard permission center',
      () => {
        expect(sdk.naming.getLambdaSnsPermissionLogicalId('functionName', 'topic')).to.equal(
          'FunctionNameLambdaPermissionTopicSNS'
        );
      }
    );
  });

  describe('#getLambdaSchedulePermissionLogicalId()', () => {
    it('should normalize the function name and add the standard suffix including event index', () => {
      expect(sdk.naming.getLambdaSchedulePermissionLogicalId('functionName', 0)).to.equal(
        'FunctionNameLambdaPermissionEventsRuleSchedule0'
      );
    });
  });

  describe('#getLambdaCloudWatchEventPermissionLogicalId()', () => {
    it('should normalize the function name and add the standard suffix including event index', () => {
      expect(sdk.naming.getLambdaCloudWatchEventPermissionLogicalId('functionName', 0)).to.equal(
        'FunctionNameLambdaPermissionEventsRuleCloudWatchEvent0'
      );
    });
  });

  describe('#getLambdaApiGatewayPermissionLogicalId()', () => {
    it('should normalize the function name and append the standard suffix', () => {
      expect(sdk.naming.getLambdaApiGatewayPermissionLogicalId('functionName')).to.equal(
        'FunctionNameLambdaPermissionApiGateway'
      );
    });
  });

  describe('#getIotLogicalId()', () => {
    it('should normalize the function name and add the standard suffix including the index', () => {
      expect(sdk.naming.getIotLogicalId('functionName', 0)).to.equal('FunctionNameIotTopicRule0');
    });
  });

  describe('#getLambdaIotPermissionLogicalId()', () => {
    it('should normalize the function name and add the standard suffix including event index', () => {
      expect(sdk.naming.getLambdaIotPermissionLogicalId('functionName', 0)).to.equal(
        'FunctionNameLambdaPermissionIotTopicRule0'
      );
    });
  });

  describe('#getLambdaAlexaSkillPermissionLogicalId()', () => {
    it('should normalize the function name and append the standard suffix', () => {
      expect(sdk.naming.getLambdaAlexaSkillPermissionLogicalId('functionName', 2)).to.equal(
        'FunctionNameLambdaPermissionAlexaSkill2'
      );
    });

    it('should normalize the function name and append a default suffix if not defined', () => {
      expect(sdk.naming.getLambdaAlexaSkillPermissionLogicalId('functionName')).to.equal(
        'FunctionNameLambdaPermissionAlexaSkill0'
      );
    });
  });

  describe('#getLambdaAlexaSmartHomePermissionLogicalId()', () => {
    it('should normalize the function name and append the standard suffix', () => {
      expect(sdk.naming.getLambdaAlexaSmartHomePermissionLogicalId('functionName', 0)).to.equal(
        'FunctionNameLambdaPermissionAlexaSmartHome0'
      );
    });
  });

  describe('#getLambdaSnsSubscriptionLogicalId()', () => {
    it('should normalize the function name and append the standard suffix', () => {
      expect(sdk.naming.getLambdaSnsSubscriptionLogicalId('functionName', 'topicName')).to.equal(
        'FunctionNameSnsSubscriptionTopicName'
      );
    });
  });

  describe('#getLambdaCloudWatchLogPermissionLogicalId()', () => {
    it('should normalize the function name and add the standard suffix including event index', () => {
      expect(sdk.naming.getLambdaCloudWatchLogPermissionLogicalId('functionName')).to.equal(
        'FunctionNameLambdaPermissionLogsSubscriptionFilterCloudWatchLog'
      );
    });
  });

  describe('#getLambdaCognitoUserPoolPermissionLogicalId()', () => {
    it('should normalize the function name and add the standard suffix', () => {
      expect(
        sdk.naming.getLambdaCognitoUserPoolPermissionLogicalId(
          'functionName',
          'Pool1',
          'CustomMessage'
        )
      ).to.equal('FunctionNameLambdaPermissionCognitoUserPoolPool1TriggerSourceCustomMessage');
    });

    describe('#getLambdaAlbPermissionLogicalId()', () => {
      it('should normalize the function name', () => {
        expect(sdk.naming.getLambdaAlbPermissionLogicalId('functionName')).to.equal(
          'FunctionNameLambdaPermissionAlb'
        );
      });
    });

    describe('#getLambdaRegisterTargetPermissionLogicalId()', () => {
      it('should normalize the function name and add the correct suffix', () => {
        expect(sdk.naming.getLambdaRegisterTargetPermissionLogicalId('functionName')).to.equal(
          'FunctionNameLambdaPermissionRegisterTarget'
        );
      });
    });
  });

  describe('#getQueueLogicalId()', () => {
    it('should normalize the function name and add the standard suffix', () => {
      expect(sdk.naming.getQueueLogicalId('functionName', 'MyQueue')).to.equal(
        'FunctionNameEventSourceMappingSQSMyQueue'
      );
    });
  });

  describe('#getAlbTargetGroupLogicalId()', () => {
    it('should normalize the function name', () => {
      expect(sdk.naming.getAlbTargetGroupLogicalId('functionName', 'abc123')).to.equal(
        'FunctionNameAlbTargetGroupabc123'
      );
    });

    it('should normalize the function name and add MultiValue prefix if multiValueHeader is true', () => {
      expect(sdk.naming.getAlbTargetGroupLogicalId('functionName', 'abc123', true)).to.equal(
        'FunctionNameAlbMultiValueTargetGroupabc123'
      );
    });
  });

  describe('#getAlbListenerRuleLogicalId()', () => {
    it('should normalize the function name and add an index', () => {
      expect(sdk.naming.getAlbListenerRuleLogicalId('functionName', 0)).to.equal(
        'FunctionNameAlbListenerRule0'
      );
    });
  });

  describe('#getAlbTargetGroupName()', () => {
    it('should return a unique identifier based on the service name, function name, alb id, multi-value attribute and stage', () => {
      serverless.service.service = 'myService';
      expect(sdk.naming.getAlbTargetGroupName('functionName', 'abc123', true)).to.equal(
        '79039bd239ac0b3f6ff6d9296f23e27c'
      );
    });
  });

  describe('#getAlbTargetGroupNameTagValue()', () => {
    it('should return the composition of service name, function name, alb id, multi-value attribute and stage', () => {
      serverless.service.service = 'myService';
      expect(sdk.naming.getAlbTargetGroupNameTagValue('functionName', 'abc123', true)).to.equal(
        `${
          serverless.service.service
        }-functionName-abc123-multi-value-${sdk.naming.provider.getStage()}`
      );
    });
  });

  describe('#getCustomResourcesArtifactDirectoryName()', () => {
    it('should return the custom resources artifact directory name', () => {
      expect(sdk.naming.getCustomResourcesArtifactDirectoryName()).to.equal('custom-resources');
    });
  });

  describe('#getCustomResourcesRoleLogicalId()', () => {
    it('should return the custom resources role logical id', () => {
      expect(sdk.naming.getCustomResourcesRoleLogicalId()).to.equal(
        'IamRoleCustomResourcesLambdaExecution'
      );
    });
  });

  describe('#getCustomResourceS3HandlerFunctionName()', () => {
    it('should return the name of the S3 custom resource handler function', () => {
      expect(sdk.naming.getCustomResourceS3HandlerFunctionName()).to.equal(
        'custom-resource-existing-s3'
      );
    });
  });

  describe('#getCustomResourceS3HandlerFunctionLogicalId()', () => {
    it('should return the logical id of the S3 custom resource handler function', () => {
      expect(sdk.naming.getCustomResourceS3HandlerFunctionLogicalId()).to.equal(
        'CustomDashresourceDashexistingDashs3LambdaFunction'
      );
    });
  });

  describe('#getCustomResourceS3ResourceLogicalId()', () => {
    it('should return the logical id of the S3 custom resource', () => {
      const functionName = 'my-function';
      expect(sdk.naming.getCustomResourceS3ResourceLogicalId(functionName)).to.equal(
        'MyDashfunctionCustomS31'
      );
    });
  });

  describe('#getCustomResourceCognitoUserPoolHandlerFunctionName()', () => {
    it('should return the name of the Cognito User Pool custom resource handler function', () => {
      expect(sdk.naming.getCustomResourceCognitoUserPoolHandlerFunctionName()).to.equal(
        'custom-resource-existing-cup'
      );
    });
  });

  describe('#getCustomResourceCognitoUserPoolHandlerFunctionLogicalId()', () => {
    it('should return the logical id of the Cognito User Pool custom resource handler function', () => {
      expect(sdk.naming.getCustomResourceCognitoUserPoolHandlerFunctionLogicalId()).to.equal(
        'CustomDashresourceDashexistingDashcupLambdaFunction'
      );
    });
  });

  describe('#getCustomResourceCognitoUserPoolResourceLogicalId()', () => {
    it('should return the logical id of the Cognito User Pool custom resource', () => {
      const functionName = 'my-function';
      expect(sdk.naming.getCustomResourceCognitoUserPoolResourceLogicalId(functionName)).to.equal(
        'MyDashfunctionCustomCognitoUserPool1'
      );
    });
  });

  describe('#getCustomResourceEventBridgeHandlerFunctionName()', () => {
    it('should return the name of the Event Bridge custom resource handler function', () => {
      expect(sdk.naming.getCustomResourceEventBridgeHandlerFunctionName()).to.equal(
        'custom-resource-event-bridge'
      );
    });
  });

  describe('#getCustomResourceEventBridgeHandlerFunctionLogicalId()', () => {
    it('should return the logical id of the Event Bridge custom resource handler function', () => {
      expect(sdk.naming.getCustomResourceEventBridgeHandlerFunctionLogicalId()).to.equal(
        'CustomDashresourceDasheventDashbridgeLambdaFunction'
      );
    });
  });

  describe('#getCustomResourceEventBridgeResourceLogicalId()', () => {
    it('should return the logical id of the Event Bridge custom resource', () => {
      const functionName = 'my-function';
      const index = 1;
      expect(
        sdk.naming.getCustomResourceEventBridgeResourceLogicalId(functionName, index)
      ).to.equal('MyDashfunctionCustomEventBridge1');
    });
  });

  describe('#getCustomResourceApiGatewayAccountCloudWatchRoleHandlerFunctionName()', () => {
    it('should return the name of the APIGW Account CloudWatch role custom resource handler function', () => {
      expect(
        sdk.naming.getCustomResourceApiGatewayAccountCloudWatchRoleHandlerFunctionName()
      ).to.equal('custom-resource-apigw-cw-role');
    });
  });

  describe('#getCustomResourceApiGatewayAccountCloudWatchRoleHandlerFunctionLogicalId()', () => {
    it('should return the logical id of the APIGW Account CloudWatch role custom resource handler function', () => {
      expect(
        sdk.naming.getCustomResourceApiGatewayAccountCloudWatchRoleHandlerFunctionLogicalId()
      ).to.equal('CustomDashresourceDashapigwDashcwDashroleLambdaFunction');
    });
  });

  describe('#getCustomResourceApiGatewayAccountCloudWatchRoleResourceLogicalId()', () => {
    it('should return the logical id of the APIGW Account CloudWatch role custom resource', () => {
      expect(
        sdk.naming.getCustomResourceApiGatewayAccountCloudWatchRoleResourceLogicalId()
      ).to.equal('CustomApiGatewayAccountCloudWatchRole');
    });
  });

  describe('#getCloudFrontDistributionLogicalId()', () => {
    it('should return CloudFront distribution logical id', () => {
      expect(sdk.naming.getCloudFrontDistributionLogicalId()).to.equal('CloudFrontDistribution');
    });
  });

  describe('#getCloudFrontDistributionDomainNameLogicalId()', () => {
    it('should return CloudFront distribution domain name logical id', () => {
      expect(sdk.naming.getCloudFrontDistributionDomainNameLogicalId()).to.equal(
        'CloudFrontDistributionDomainName'
      );
    });
  });

  describe('#getLambdaAtEdgeInvokePermissionLogicalId()', () => {
    it('should return lambda@edge invoke permission logical id', () => {
      expect(sdk.naming.getLambdaAtEdgeInvokePermissionLogicalId('functionName')).to.equal(
        'FunctionNameLambdaFunctionInvokePermission'
      );
    });
  });

  describe('#getCloudFrontOriginId()', () => {
    it('should return CloudFront origin id', () => {
      expect(sdk.naming.getCloudFrontOriginId('functionName', '/path')).to.equal(
        'FunctionName/path'
      );
    });
  });
});
