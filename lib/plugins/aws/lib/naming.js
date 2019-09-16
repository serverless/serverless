'use strict';

const _ = require('lodash');
const crypto = require('crypto');

/**
 * A centralized naming object that provides naming standards for the AWS provider plugin.  The
 * intent is for this to enable naming standards to be configured using a custom naming plugin or
 * a naming configuration feature, based on which of those is determined to in the best approach.
 *
 * There are two main concepts:
 * 1. normalization - normalization of a name comprises removing any unacceptable characters and
 * changing the name to comply with capitalization expectations.
 * 2. logicalization - logicalization of a name comprises preparing it for use as an attribute name
 * for a resource within the Service's CloudFormation Template.  Notably, a suffix or prefix should
 * be added to the name of resources.  These help to disambiguate attributes identifying or
 * declaring different aspects or data about the same resource.  (e.g. MyFuncLambdaFunction vs.
 * MyFuncLambdaFunctionArn)  Generally, normalization of the name also occurs.
 *
 * Sometimes, it is important to deconstruct the names that are created via this centralized
 * utility.  As a result, the regular expressions used for identifying specific resource types using
 * their names or the logic to extract a name components from a logical name are things that must
 * also be centralized so that they co-occur and are more correlated spatially within the code base.
 * That is to say that they are easier to change together.
 */
module.exports = {
  // General
  normalizeName(name) {
    return `${_.upperFirst(name)}`;
  },
  normalizeNameToAlphaNumericOnly(name) {
    return this.normalizeName(name.replace(/[^0-9A-Za-z]/g, ''));
  },
  normalizePathPart(path) {
    return _.upperFirst(
      _.capitalize(path)
        .replace(/-/g, 'Dash')
        .replace(/\{(.*)\}/g, '$1Var')
        .replace(/[^0-9A-Za-z]/g, '')
    );
  },

  getServiceEndpointRegex() {
    return /^ServiceEndpoint/;
  },

  // Stack
  getStackName() {
    if (
      this.provider.serverless.service.provider.stackName &&
      _.isString(this.provider.serverless.service.provider.stackName)
    ) {
      return `${this.provider.serverless.service.provider.stackName}`;
    }
    return `${this.provider.serverless.service.service}-${this.provider.getStage()}`;
  },

  getServiceArtifactName() {
    return `${this.provider.serverless.service.service}.zip`;
  },

  getFunctionArtifactName(functionName) {
    return `${functionName}.zip`;
  },

  getLayerArtifactName(layerName) {
    return `${layerName}.zip`;
  },

  getServiceStateFileName() {
    return 'serverless-state.json';
  },

  getCompiledTemplateFileName() {
    return 'cloudformation-template-update-stack.json';
  },

  getCoreTemplateFileName() {
    return 'cloudformation-template-create-stack.json';
  },

  // Role
  getRolePath() {
    return '/';
  },
  getRoleName() {
    return {
      'Fn::Join': [
        '-',
        [
          this.provider.serverless.service.service,
          this.provider.getStage(),
          { Ref: 'AWS::Region' },
          'lambdaRole',
        ],
      ],
    };
  },
  getRoleLogicalId() {
    return 'IamRoleLambdaExecution';
  },

  // Policy
  getPolicyName() {
    return {
      // TODO should probably have name ordered and altered as above - see AWS docs
      'Fn::Join': [
        '-',
        [
          this.provider.getStage(),
          // TODO is it a bug here in that the role is not specific to the region?
          this.provider.serverless.service.service,
          'lambda',
        ],
      ],
    };
  },

  // Log Group
  getLogGroupLogicalId(functionName) {
    return `${this.getNormalizedFunctionName(functionName)}LogGroup`;
  },
  getLogGroupName(functionName) {
    return `/aws/lambda/${functionName}`;
  },

  // Lambda
  getNormalizedFunctionName(functionName) {
    return this.normalizeName(functionName.replace(/-/g, 'Dash').replace(/_/g, 'Underscore'));
  },
  extractLambdaNameFromArn(functionArn) {
    return functionArn.substring(functionArn.lastIndexOf(':') + 1);
  },
  extractAuthorizerNameFromArn(functionArn) {
    const splitArn = functionArn.split(':');
    // TODO the following two lines assumes default function naming?  Is there a better way?
    // TODO (see ~/lib/classes/Service.js:~155)
    const splitName = splitArn[splitArn.length - 1].split('-');
    return splitName[splitName.length - 1];
  },
  getLambdaLogicalId(functionName) {
    return `${this.getNormalizedFunctionName(functionName)}LambdaFunction`;
  },
  getLambdaLayerLogicalId(layerName) {
    return `${this.getNormalizedFunctionName(layerName)}LambdaLayer`;
  },
  getLambdaLayerPermissionLogicalId(layerName, account) {
    return `${this.getNormalizedFunctionName(layerName)}${account.replace(
      '*',
      'Wild'
    )}LambdaLayerPermission`;
  },
  getLambdaLogicalIdRegex() {
    return /LambdaFunction$/;
  },
  getLambdaVersionLogicalId(functionName, sha) {
    return `${this.getNormalizedFunctionName(functionName)}LambdaVersion${sha.replace(
      /[^0-9a-z]/gi,
      ''
    )}`;
  },
  getLambdaVersionOutputLogicalId(functionName) {
    return `${this.getLambdaLogicalId(functionName)}QualifiedArn`;
  },
  getLambdaLayerOutputLogicalId(layerName) {
    return `${this.getLambdaLayerLogicalId(layerName)}QualifiedArn`;
  },

  // Websockets API
  getWebsocketsApiName() {
    if (
      this.provider.serverless.service.provider.websocketsApiName &&
      _.isString(this.provider.serverless.service.provider.websocketsApiName)
    ) {
      return `${this.provider.serverless.service.provider.websocketsApiName}`;
    }
    return `${this.provider.getStage()}-${this.provider.serverless.service.service}-websockets`;
  },
  getWebsocketsApiLogicalId() {
    return 'WebsocketsApi';
  },
  getWebsocketsIntegrationLogicalId(functionName) {
    return `${this.getNormalizedFunctionName(functionName)}WebsocketsIntegration`;
  },

  getLambdaWebsocketsPermissionLogicalId(functionName) {
    return `${this.getNormalizedFunctionName(functionName)}LambdaPermissionWebsockets`;
  },

  getNormalizedWebsocketsRouteKey(route) {
    return route
      .replace('$', 'S') // dollar sign
      .replace('/', 'Slash')
      .replace('-', 'Dash')
      .replace('_', 'Underscore')
      .replace('.', 'Period');
  },

  getWebsocketsRouteLogicalId(route) {
    return `${this.getNormalizedWebsocketsRouteKey(route)}WebsocketsRoute`;
  },

  getWebsocketsDeploymentLogicalId(id) {
    return `WebsocketsDeployment${id}`;
  },

  getWebsocketsStageLogicalId() {
    return 'WebsocketsDeploymentStage';
  },

  getWebsocketsAuthorizerLogicalId(functionName) {
    return `${this.getNormalizedAuthorizerName(functionName)}WebsocketsAuthorizer`;
  },
  getWebsocketsLogGroupLogicalId() {
    return 'WebsocketsLogGroup';
  },

  // API Gateway
  getApiGatewayName() {
    if (
      this.provider.serverless.service.provider.apiName &&
      _.isString(this.provider.serverless.service.provider.apiName)
    ) {
      return `${this.provider.serverless.service.provider.apiName}`;
    }
    return `${this.provider.getStage()}-${this.provider.serverless.service.service}`;
  },
  generateApiGatewayDeploymentLogicalId(id) {
    return `ApiGatewayDeployment${id}`;
  },
  getRestApiLogicalId() {
    return 'ApiGatewayRestApi';
  },
  getNormalizedAuthorizerName(functionName) {
    return this.getNormalizedFunctionName(functionName);
  },
  getAuthorizerLogicalId(functionName) {
    return `${this.getNormalizedAuthorizerName(functionName)}ApiGatewayAuthorizer`;
  },
  normalizePath(resourcePath) {
    return resourcePath
      .split('/')
      .map(this.normalizePathPart.bind(this))
      .join('');
  },
  getResourceLogicalId(resourcePath) {
    return `ApiGatewayResource${this.normalizePath(resourcePath)}`;
  },
  extractResourceId(resourceLogicalId) {
    return resourceLogicalId.match(/ApiGatewayResource(.*)/)[1];
  },
  normalizeMethodName(methodName) {
    return this.normalizeName(methodName.toLowerCase());
  },
  getMethodLogicalId(resourceId, methodName) {
    return `ApiGatewayMethod${resourceId}${this.normalizeMethodName(methodName)}`;
  },
  getValidatorLogicalId(resourceId, methodName) {
    return `${this.getMethodLogicalId(resourceId, methodName)}Validator`;
  },
  getModelLogicalId(resourceId, methodName, contentType) {
    return `${this.getMethodLogicalId(resourceId, methodName)}${_.startCase(contentType).replace(
      ' ',
      ''
    )}Model`;
  },
  getApiKeyLogicalId(apiKeyNumber, apiKeyName) {
    if (apiKeyName) {
      return `ApiGatewayApiKey${this.normalizeName(apiKeyName)}${apiKeyNumber}`;
    }
    return `ApiGatewayApiKey${apiKeyNumber}`;
  },
  getApiKeyLogicalIdRegex() {
    return /^ApiGatewayApiKey/;
  },
  getUsagePlanLogicalId(name) {
    if (name) {
      return `ApiGatewayUsagePlan${this.normalizeName(name)}`;
    }
    return 'ApiGatewayUsagePlan';
  },
  getUsagePlanKeyLogicalId(usagePlanKeyNumber, usagePlanKeyName) {
    if (usagePlanKeyName) {
      return `ApiGatewayUsagePlanKey${this.normalizeName(usagePlanKeyName)}${usagePlanKeyNumber}`;
    }
    return `ApiGatewayUsagePlanKey${usagePlanKeyNumber}`;
  },
  getStageLogicalId() {
    return 'ApiGatewayStage';
  },
  getApiGatewayLogGroupLogicalId() {
    return 'ApiGatewayLogGroup';
  },

  // S3
  getDeploymentBucketLogicalId() {
    return 'ServerlessDeploymentBucket';
  },
  getDeploymentBucketOutputLogicalId() {
    return 'ServerlessDeploymentBucketName';
  },
  normalizeBucketName(bucketName) {
    return this.normalizeNameToAlphaNumericOnly(bucketName);
  },
  getBucketLogicalId(bucketName) {
    return `S3Bucket${this.normalizeBucketName(bucketName)}`;
  },

  // SNS
  normalizeTopicName(topicName) {
    return this.normalizeNameToAlphaNumericOnly(topicName);
  },
  getTopicLogicalId(topicName) {
    return `SNSTopic${this.normalizeTopicName(topicName)}`;
  },

  // Schedule
  getScheduleId(functionName) {
    return `${functionName}Schedule`;
  },
  getScheduleLogicalId(functionName, scheduleIndex) {
    return `${this.getNormalizedFunctionName(functionName)}EventsRuleSchedule${scheduleIndex}`;
  },

  // Stream
  getStreamLogicalId(functionName, streamType, streamName) {
    return `${this.getNormalizedFunctionName(functionName)}EventSourceMapping${this.normalizeName(
      streamType
    )}${this.normalizeNameToAlphaNumericOnly(streamName)}`;
  },

  // IoT
  getIotLogicalId(functionName, iotIndex) {
    return `${this.getNormalizedFunctionName(functionName)}IotTopicRule${iotIndex}`;
  },
  getLambdaIotPermissionLogicalId(functionName, iotIndex) {
    return `${this.getNormalizedFunctionName(functionName)}LambdaPermissionIotTopicRule${iotIndex}`;
  },

  // CloudWatch Event
  getCloudWatchEventId(functionName) {
    return `${functionName}CloudWatchEvent`;
  },
  getCloudWatchEventLogicalId(functionName, cloudWatchIndex) {
    return `${this.getNormalizedFunctionName(
      functionName
    )}EventsRuleCloudWatchEvent${cloudWatchIndex}`;
  },

  // CloudWatch Log
  getCloudWatchLogLogicalId(functionName, logsIndex) {
    return `${this.getNormalizedFunctionName(
      functionName
    )}LogsSubscriptionFilterCloudWatchLog${logsIndex}`;
  },

  // Cognito User Pool
  getCognitoUserPoolLogicalId(poolId) {
    return `CognitoUserPool${this.normalizeNameToAlphaNumericOnly(poolId)}`;
  },

  // SQS
  getQueueLogicalId(functionName, queueName) {
    return `${this.getNormalizedFunctionName(
      functionName
    )}EventSourceMappingSQS${this.normalizeNameToAlphaNumericOnly(queueName)}`;
  },

  // ALB
  getAlbTargetGroupLogicalId(functionName) {
    return `${this.getNormalizedFunctionName(functionName)}AlbTargetGroup`;
  },
  getAlbTargetGroupNameTagValue(functionName) {
    return `${
      this.provider.serverless.service.service
    }-${functionName}-${this.provider.getStage()}`;
  },
  getAlbTargetGroupName(functionName) {
    return crypto
      .createHash('md5')
      .update(this.getAlbTargetGroupNameTagValue(functionName))
      .digest('hex');
  },
  getAlbListenerRuleLogicalId(functionName, idx) {
    return `${this.getNormalizedFunctionName(functionName)}AlbListenerRule${idx}`;
  },

  // Permissions
  getLambdaS3PermissionLogicalId(functionName, bucketName) {
    return `${this.getNormalizedFunctionName(
      functionName
    )}LambdaPermission${this.normalizeBucketName(bucketName)}S3`;
  },
  getLambdaSnsPermissionLogicalId(functionName, topicName) {
    return `${this.getNormalizedFunctionName(
      functionName
    )}LambdaPermission${this.normalizeTopicName(topicName)}SNS`;
  },
  getLambdaSnsSubscriptionLogicalId(functionName, topicName) {
    return `${this.getNormalizedFunctionName(functionName)}SnsSubscription${this.normalizeTopicName(
      topicName
    )}`;
  },
  getLambdaSchedulePermissionLogicalId(functionName, scheduleIndex) {
    return `${this.getNormalizedFunctionName(
      functionName
    )}LambdaPermissionEventsRuleSchedule${scheduleIndex}`;
  },
  getLambdaCloudWatchEventPermissionLogicalId(functionName, cloudWatchIndex) {
    return `${this.getNormalizedFunctionName(
      functionName
    )}LambdaPermissionEventsRuleCloudWatchEvent${cloudWatchIndex}`;
  },
  getLambdaApiGatewayPermissionLogicalId(functionName) {
    return `${this.getNormalizedFunctionName(functionName)}LambdaPermissionApiGateway`;
  },
  getLambdaAlexaSkillPermissionLogicalId(functionName, alexaSkillIndex) {
    return `${this.getNormalizedFunctionName(
      functionName
    )}LambdaPermissionAlexaSkill${alexaSkillIndex || '0'}`;
  },
  getLambdaAlexaSmartHomePermissionLogicalId(functionName, alexaSmartHomeIndex) {
    return `${this.getNormalizedFunctionName(
      functionName
    )}LambdaPermissionAlexaSmartHome${alexaSmartHomeIndex}`;
  },
  getLambdaCloudWatchLogPermissionLogicalId(functionName) {
    return `${this.getNormalizedFunctionName(
      functionName
    )}LambdaPermissionLogsSubscriptionFilterCloudWatchLog`;
  },
  getLambdaCognitoUserPoolPermissionLogicalId(functionName, poolId, triggerSource) {
    return `${this.getNormalizedFunctionName(
      functionName
    )}LambdaPermissionCognitoUserPool${this.normalizeNameToAlphaNumericOnly(
      poolId
    )}TriggerSource${triggerSource}`;
  },
  getLambdaAlbPermissionLogicalId(functionName) {
    return `${this.getNormalizedFunctionName(functionName)}LambdaPermissionAlb`;
  },

  // Custom Resources
  getCustomResourcesArtifactDirectoryName() {
    return 'custom-resources';
  },
  getCustomResourcesRoleLogicalId() {
    return 'IamRoleCustomResourcesLambdaExecution';
  },
  // S3
  getCustomResourceS3HandlerFunctionName() {
    return 'custom-resource-existing-s3';
  },
  getCustomResourceS3HandlerFunctionLogicalId() {
    return this.getLambdaLogicalId(
      `${this.getNormalizedFunctionName(this.getCustomResourceS3HandlerFunctionName())}`
    );
  },
  getCustomResourceS3ResourceLogicalId(functionName) {
    // NOTE: we have to keep the 1 at the end to ensure backwards compatibility
    // previously we've used an index to allow the creation of multiple custom S3 resources
    // we're now using one resource to handle multiple S3 event definitions
    return `${this.getNormalizedFunctionName(functionName)}CustomS31`;
  },
  // Cognito User Pool
  getCustomResourceCognitoUserPoolHandlerFunctionName() {
    return 'custom-resource-existing-cup';
  },
  getCustomResourceCognitoUserPoolHandlerFunctionLogicalId() {
    return this.getLambdaLogicalId(
      `${this.getNormalizedFunctionName(
        this.getCustomResourceCognitoUserPoolHandlerFunctionName()
      )}`
    );
  },
  getCustomResourceCognitoUserPoolResourceLogicalId(functionName) {
    // NOTE: we have to keep the 1 at the end to ensure backwards compatibility
    // previously we've used an index to allow the creation of multiple custom
    // Cognito User Pool resources
    // we're now using one resource to handle multiple Cognito User Pool event definitions
    return `${this.getNormalizedFunctionName(functionName)}CustomCognitoUserPool1`;
  },
  // Event Bridge
  getCustomResourceEventBridgeHandlerFunctionName() {
    return 'custom-resource-event-bridge';
  },
  getCustomResourceEventBridgeHandlerFunctionLogicalId() {
    return this.getLambdaLogicalId(
      `${this.getNormalizedFunctionName(this.getCustomResourceEventBridgeHandlerFunctionName())}`
    );
  },
  getCustomResourceEventBridgeResourceLogicalId(functionName, idx) {
    return `${this.getNormalizedFunctionName(functionName)}CustomEventBridge${idx}`;
  },

  // API Gateway Account Logs Write Role
  getCustomResourceApiGatewayAccountCloudWatchRoleHandlerFunctionName() {
    return 'custom-resource-apigw-cw-role';
  },
  getCustomResourceApiGatewayAccountCloudWatchRoleHandlerFunctionLogicalId() {
    return this.getLambdaLogicalId(
      `${this.getNormalizedFunctionName(
        this.getCustomResourceApiGatewayAccountCloudWatchRoleHandlerFunctionName()
      )}`
    );
  },
  getCustomResourceApiGatewayAccountCloudWatchRoleResourceLogicalId() {
    return 'CustomApiGatewayAccountCloudWatchRole';
  },

  // CloudFront
  getCloudFrontDistributionLogicalId() {
    return 'CloudFrontDistribution';
  },
  getCloudFrontDistributionDomainNameLogicalId() {
    return 'CloudFrontDistributionDomainName';
  },
  getLambdaAtEdgeInvokePermissionLogicalId(functionName) {
    return `${this.getLambdaLogicalId(functionName)}InvokePermission`;
  },
  getCloudFrontOriginId(functionName, path) {
    let originId = this.getNormalizedFunctionName(functionName);
    if (path) {
      originId = `${originId}${path}`;
    }
    return originId;
  },

  // VPC
  getVpcLogicalId() {
    return 'VPC';
  },
  getInternetGatewayLogicalId() {
    return 'InternetGateway';
  },
  getVpcGatewayAttachmentLogicalId() {
    return 'VPCGatewayAttachment';
  },
  getRouteTableLogicalId() {
    return 'RouteTable';
  },
  getRouteLogicalId() {
    return 'Route';
  },
  getSubnetLogicalIdRegex() {
    return /Subnet.+/;
  },
  getSubnetLogicalId(name) {
    return `Subnet${this.normalizeNameToAlphaNumericOnly(name)}`;
  },
  getSubnetRouteTableAssociationLogicalId(subnetLogicalId) {
    return `${subnetLogicalId}RouteTableAssociation`;
  },
  getEipLogicalId() {
    return 'NatPublicIp';
  },
};
