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
  toStartCase(name) {
    return _.startCase(name).replace(/\s+/g, '');
  },
  normalizePathPart(rawPath) {
    return _.upperFirst(
      _.capitalize(rawPath)
        .replace(/-/g, 'Dash')
        .replace(/\{(.*)\}/g, '$1Var')
        .replace(/[^0-9A-Za-z]/g, '')
    );
  },

  getServiceEndpointRegex() {
    return /^(ServiceEndpoint|HttpApiUrl)/;
  },

  // Stack
  getStackName() {
    if (
      this.provider.serverless.service.provider.stackName &&
      typeof this.provider.serverless.service.provider.stackName === 'string'
    ) {
      return this.provider.serverless.service.provider.stackName;
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

  getCompiledTemplateS3Suffix() {
    return 'compiled-cloudformation-template.json';
  },

  getCoreTemplateFileName() {
    return 'cloudformation-template-create-stack.json';
  },

  // Role
  getRolePath() {
    const customRolePath = _.get(this.provider, 'serverless.service.provider.iam.role.path');
    return customRolePath || '/';
  },
  getRoleName() {
    const customRoleName = _.get(this.provider, 'serverless.service.provider.iam.role.name');
    return (
      customRoleName || {
        'Fn::Join': [
          '-',
          [
            this.provider.serverless.service.service,
            this.provider.getStage(),
            { Ref: 'AWS::Region' },
            'lambdaRole',
          ],
        ],
      }
    );
  },
  getRoleLogicalId() {
    return 'IamRoleLambdaExecution';
  },

  // Policy
  getPolicyName() {
    return {
      'Fn::Join': [
        '-',
        [this.provider.serverless.service.service, this.provider.getStage(), 'lambda'],
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
    return this.getNormalizedResourceName(functionName);
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
  getLambdaEventConfigLogicalId(functionName) {
    return `${this.getNormalizedFunctionName(functionName)}LambdaEvConf`;
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
  getCodeDeployApplicationLogicalId() {
    return 'CodeDeployApplication';
  },
  getCodeDeployDeploymentGroupLogicalId() {
    return 'CodeDeployDeploymentGroup';
  },
  getCodeDeployRoleLogicalId() {
    return 'CodeDeployRole';
  },
  getLambdaProvisionedConcurrencyAliasLogicalId(functionName) {
    return `${this.getNormalizedFunctionName(functionName)}ProvConcLambdaAlias`;
  },
  getLambdaProvisionedConcurrencyAliasName() {
    return 'provisioned';
  },
  getLambdaVersionOutputLogicalId(functionName) {
    return `${this.getLambdaLogicalId(functionName)}QualifiedArn`;
  },
  getLambdaLayerOutputLogicalId(layerName) {
    return `${this.getLambdaLayerLogicalId(layerName)}QualifiedArn`;
  },
  getLambdaLayerHashOutputLogicalId(layerName) {
    return `${this.getLambdaLayerLogicalId(layerName)}Hash`;
  },
  getLambdaLayerS3KeyOutputLogicalId(layerName) {
    return `${this.getLambdaLayerLogicalId(layerName)}S3Key`;
  },

  // Websockets API
  getWebsocketsApiName() {
    if (
      this.provider.serverless.service.provider.websocketsApiName &&
      typeof this.provider.serverless.service.provider.websocketsApiName === 'string'
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
      .replace(/\$/g, 'S') // dollar sign
      .replace(/\//g, 'Slash')
      .replace(/-/g, 'Dash')
      .replace(/_/g, 'Underscore')
      .replace(/\./g, 'Period');
  },

  getWebsocketsRouteLogicalId(route) {
    return `${this.getNormalizedWebsocketsRouteKey(route)}WebsocketsRoute`;
  },

  getWebsocketsDeploymentLogicalId(sha) {
    return `WebsocketsDeployment${sha.replace(/[^0-9a-z]/gi, '')}`;
  },

  getWebsocketsRouteResponseLogicalId(route) {
    return `${this.getWebsocketsRouteLogicalId(route)}Response`;
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
    if (this.provider.serverless.service.provider.apiName) {
      return `${this.provider.serverless.service.provider.apiName}`;
    }

    return _.get(this.provider.serverless.service.provider.apiGateway, 'shouldStartNameWithService')
      ? `${this.provider.serverless.service.service}-${this.provider.getStage()}`
      : `${this.provider.getStage()}-${this.provider.serverless.service.service}`;
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
    return resourcePath.split('/').map(this.normalizePathPart.bind(this)).join('');
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
  getValidatorLogicalId() {
    return `ApiGateway${this.normalizeNameToAlphaNumericOnly(
      this.provider.serverless.service.service
    )}RequestValidator`;
  },
  getModelLogicalId(schemaId) {
    return `ApiGateway${_.upperFirst(_.camelCase(schemaId))}Model`;
  },
  getEndpointModelLogicalId(resourceId, methodName, contentType) {
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
  getDeploymentBucketPolicyLogicalId() {
    return 'ServerlessDeploymentBucketPolicy';
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
  getTopicDLQPolicyLogicalId(functionName, topicName) {
    return `${this.normalizeTopicName(topicName)}To${this.getNormalizedFunctionName(
      functionName
    )}DLQPolicy`;
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
  getStreamConsumerName(functionName, streamName) {
    return `${functionName}${streamName}Consumer`;
  },
  getStreamConsumerLogicalId(streamConsumerName) {
    return `${this.getNormalizedFunctionName(streamConsumerName)}StreamConsumer`;
  },

  // IoT
  getIotLogicalId(functionName, iotIndex) {
    return `${this.getNormalizedFunctionName(functionName)}IotTopicRule${iotIndex}`;
  },
  getLambdaIotPermissionLogicalId(functionName, iotIndex) {
    return `${this.getNormalizedFunctionName(functionName)}LambdaPermissionIotTopicRule${iotIndex}`;
  },

  // IoT Fleet Provisioning
  getIotFleetProvisioningLogicalId(functionName) {
    return `${this.getNormalizedFunctionName(functionName)}IotProvisioningTemplate`;
  },
  getLambdaIotFleetProvisioningPermissionLogicalId(functionName) {
    return `${this.getNormalizedFunctionName(functionName)}LambdaPermissionIotProvisioningTemplate`;
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

  // MSK
  getMSKEventLogicalId(functionName, clusterName, topicName) {
    const normalizedFunctionName = this.getNormalizedFunctionName(functionName);
    // Both clusterName and topicName are trimmed to 79 chars to avoid going over 255 character limit
    const normalizedClusterName = this.normalizeNameToAlphaNumericOnly(clusterName).slice(0, 79);
    const normalizedTopicName = this.normalizeNameToAlphaNumericOnly(topicName).slice(0, 79);
    return `${normalizedFunctionName}EventSourceMappingMSK${normalizedClusterName}${normalizedTopicName}`;
  },

  // Kafka
  getKafkaEventLogicalId(functionName, topicName) {
    const normalizedFunctionName = this.getNormalizedFunctionName(functionName);
    // TopicName is trimmed to 158 chars to avoid going over 255 character limit
    const normalizedTopicName = this.normalizeNameToAlphaNumericOnly(topicName).slice(0, 158);
    return `${normalizedFunctionName}EventSourceMappingKafka${normalizedTopicName}`;
  },

  // ALB
  getAlbTargetGroupLogicalId(functionName, albId, multiValueHeaders) {
    return `${this.getNormalizedFunctionName(functionName)}Alb${
      multiValueHeaders ? 'MultiValue' : ''
    }TargetGroup${albId}`;
  },
  getAlbTargetGroupNameTagValue(functionName, albId, multiValueHeaders) {
    return `${this.provider.serverless.service.service}-${functionName}-${albId}-${
      multiValueHeaders ? 'multi-value-' : ''
    }${this.provider.getStage()}`;
  },
  generateAlbTargetGroupName(functionName, albId, multiValueHeaders) {
    const hash = crypto
      .createHash('md5')
      .update(this.getAlbTargetGroupNameTagValue(functionName, albId, multiValueHeaders))
      .digest('hex');

    const albTargetGroupName = this.provider.getAlbTargetGroupPrefix() + hash;
    return albTargetGroupName.slice(0, 32);
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
  getLambdaHttpApiPermissionLogicalId(functionName) {
    return `${this.getNormalizedFunctionName(functionName)}LambdaPermissionHttpApi`;
  },
  getLambdaAuthorizerHttpApiPermissionLogicalId(authorizerName) {
    return `${this.getNormalizedResourceName(authorizerName)}LambdaAuthorizerPermissionHttpApi`;
  },
  getLambdaAlexaSkillPermissionLogicalId(functionName, alexaSkillIndex) {
    return `${this.getNormalizedFunctionName(functionName)}LambdaPermissionAlexaSkill${
      alexaSkillIndex || '0'
    }`;
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
    )}TriggerSource${this.normalizeNameToAlphaNumericOnly(triggerSource)}`;
  },
  getLambdaAlbPermissionLogicalId(functionName) {
    return `${this.getNormalizedFunctionName(functionName)}LambdaPermissionAlb`;
  },
  getLambdaRegisterTargetPermissionLogicalId(functionName) {
    return `${this.getNormalizedFunctionName(functionName)}LambdaPermissionRegisterTarget`;
  },

  // Custom Resources
  getCustomResourcesArtifactName() {
    return 'custom-resources.zip';
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
  getNormalizedResourceName(resourceName) {
    return this.normalizeName(resourceName.replace(/-/g, 'Dash').replace(/_/g, 'Underscore'));
  },
  getEventBridgeEventBusLogicalId(eventBusName) {
    return `${this.getNormalizedResourceName(eventBusName)}EventBridgeEventBus`;
  },
  getEventBridgeRuleLogicalId(ruleName) {
    return `${this.normalizeNameToAlphaNumericOnly(ruleName)}EventBridgeRule`;
  },
  getEventBridgeLambdaPermissionLogicalId(functionName, idx) {
    return `${this.getNormalizedFunctionName(functionName)}EventBridgeLambdaPermission${idx}`;
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
  getCloudFrontOriginId(originObj) {
    const isS3Origin = Boolean(originObj.S3OriginConfig);
    const domain = originObj.DomainName;
    const originPath = originObj.OriginPath;

    let originId = isS3Origin ? 's3' : 'custom';
    const domainName =
      typeof domain === 'string'
        ? domain
        : this.normalizeNameToAlphaNumericOnly(JSON.stringify(domain));

    originId = `${originId}/${domainName}`;
    if (originPath) {
      originId = `${originId}${originPath}`;
    }
    return originId;
  },
  getCloudFrontCachePolicyLogicalId(cachePolicyName) {
    return `CloudFrontCachePolicy${this.getNormalizedFunctionName(cachePolicyName)}`;
  },
  getCloudFrontCachePolicyName(cachePolicyName) {
    const serviceName = this.provider.serverless.service.getServiceName();
    const stage = this.provider.getStage();
    return `${serviceName}-${stage}-${cachePolicyName}`;
  },

  // HTTP API
  getHttpApiName() {
    if (
      this.provider.serverless.service.provider.httpApi &&
      this.provider.serverless.service.provider.httpApi.name
    ) {
      return `${String(this.provider.serverless.service.provider.httpApi.name)}`;
    }

    return _.get(this.provider.serverless.service.provider.httpApi, 'shouldStartNameWithService')
      ? `${this.provider.serverless.service.service}-${this.provider.getStage()}`
      : `${this.provider.getStage()}-${this.provider.serverless.service.service}`;
  },
  getHttpApiLogicalId() {
    return 'HttpApi';
  },
  getHttpApiStageLogicalId() {
    return 'HttpApiStage';
  },
  getHttpApiIntegrationLogicalId(functionName) {
    return `HttpApiIntegration${this.getNormalizedFunctionName(functionName)}`;
  },
  getHttpApiRouteLogicalId(routeKey) {
    if (routeKey === '*') return 'HttpApiRouteDefault';
    return `HttpApiRoute${this.normalizePath(routeKey)}`;
  },
  getHttpApiAuthorizerLogicalId(authorizerName) {
    return `HttpApiAuthorizer${this.getNormalizedFunctionName(authorizerName)}`;
  },
  getHttpApiLogGroupLogicalId() {
    return 'HttpApiLogGroup';
  },
  getHttpApiLogGroupName() {
    return `/aws/http-api/${this.getStackName()}`;
  },
  getEcrRepositoryName() {
    const serviceName = this.provider.serverless.service.getServiceName();
    const stage = this.provider.getStage();
    // Ensure no consecutive dashes are present and that there is to trailing slash left
    // TODO: Remove that with next major, assuming that issue #7056 (https://github.com/serverless/serverless/issues/7056) has been addressed
    return `serverless-${serviceName}-${stage}`.toLowerCase().replace(/-+/g, '-').replace(/-$/, '');
  },
};
