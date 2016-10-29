'use strict';

const _ = require('lodash');

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
  /*
   * General Name Normalization
   */
  normalizeName(name) {
    return `${_.upperFirst(name)}`;
  },
  normalizeNameToAlphaNumericOnly(name) {
    return this.normalizeName(name.replace(/[^0-9A-Za-z]/g, ''));
  },
  normalizePathtoCapitalAlphaNumbericOnlyWithReplacement(path) {
    return this.normalizeNameToAlphaNumericOnly(
      path.replace(/-/g, 'Dash')
          .replace(/\{(.*)\}/g, '$1Var'));
  },

  // Probably belongs in a non-aws-specific code asset
  getServiceEndpointRegex() {
    return /^ServiceEndpoint/;
  },

  /*
   * Stack Naming
   */
  getStackName() {
    return `${this.sdk.serverless.service.service}-${this.sdk.getStage()}`;
  },

  /*
   * IAM (Role and Policy) Naming
   */
  getRolePath() {
    return '/';
  },
  getRoleName() {
    return {
      'Fn::Join': [
        '-',
        [
          this.sdk.serverless.service.service,
          this.sdk.getStage(),
          this.sdk.getRegion(),
          'lambdaRole',
        ],
      ],
    };
  },
  getLogicalRoleName() {
    return 'IamRoleLambdaExecution';
  },
  getPolicyName() {
    return { // TODO should probably have name ordered and altered as above - see AWS docs
      'Fn::Join': [
        '-',
        [
          this.sdk.getStage(),
          // TODO is it a bug here in that the role is not specific to the region?
          this.sdk.serverless.service.service,
          'lambda',
        ],
      ],
    };
  },
  getLogicalPolicyName() {
    return 'IamPolicyLambdaExecution';
  },

  getLogGroupName(functionName) {
    return `/aws/lambda/${functionName}`;
  },

  /*
   * Lambda Function Naming
   */
  getNormalizedLambdaName(functionName) {
    return this.normalizeName(functionName);
  },
  extractLambdaNameFromArn(functionArn) {
    const splitArn = functionArn.split(':');
    // TODO the following two lines assumes default function naming?  Is there a better way?
    // TODO (see ~/lib/classes/Service.js:~155)
    const splitName = splitArn[splitArn.length - 1].split('-');
    return splitName[splitName.length - 1];
  },
  // TODO rectify this with the above and the code that uses both
  // TODO (see ~/lib/plugins/aws/info/index.js)
  extractLambdaNameFromArn2(functionArn) {
    return functionArn.substring(functionArn.lastIndexOf(':') + 1);
  },
  getLogicalLambdaName(functionName) {
    return `${this.getNormalizedLambdaName(functionName)}LambdaFunction`;
  },
  getLogicalLambdaNameRegex() {
    return /LambdaFunction$/;
  },
  getLogicalLambdaArnName(functionName) {
    return `${this.getLogicalLambdaName(functionName)}Arn`;
  },
  getLogicalLambdaArnNameRegex() {
    return /LambdaFunctionArn$/;
  },

  /*
   * ApiGateway Authorizer Lambda & Method Naming
   */
  getApiGatewayName() {
    return `${this.sdk.getStage()}-${this.sdk.serverless.service.service}`;
  },
  getApiGatewayDeploymentId() {
    return `ApiGatewayDeployment${(new Date()).getTime().toString()}`;
  },
  getLogicalApiGatewayName() {
    return 'ApiGatewayRestApi';
  },
  getNormalizedAuthorizerName(functionName) {
    return this.getNormalizedLambdaName(functionName);
  },
  getLogicalAuthorizerName(functionName) {
    return `${this.getNormalizedAuthorizerName(functionName)}ApiGatewayAuthorizer`;
  },
  extractAuthorizerIdFromArn(authorizerArn) {
    return this.extractLambdaNameFromArn(authorizerArn);
  },
  getLogicalAuthorizerArnName(functionName) {
    return `${this.getLogicalAuthorizerName(functionName)}Arn`;
  },
  getNormalizedApiGatewayResourceName(resourcePath) {
    return resourcePath.split('/').map(
      this.normalizePathtoCapitalAlphaNumbericOnlyWithReplacement.bind(this)
    ).join('');
  },
  getLogicalApiGatewayResourceName(resourcePath) {
    return `ApiGatewayResource${this.getNormalizedApiGatewayResourceName(resourcePath)}`;
  },
  extractResourceId(logicalApiGatewayResourceName) {
    return logicalApiGatewayResourceName.match(/ApiGatewayResource(.*)/)[1];
  },
  getNormalizedApiGatewayMethodName(methodName) {
    return this.normalizeName(methodName.toLowerCase());
  },
  getLogicalApiGatewayMethodName(resourceId, methodName) {
    return `ApiGatewayMethod${resourceId}${this.getNormalizedApiGatewayMethodName(methodName)}`;
  },
  getLogicalApiGatewayApiKeyRegex() {
    return /^ApiGatewayApiKey/;
  },

  /*
   * S3 Bucket Naming
   */
  getLogicalDeploymentBucketName() {
    return 'ServerlessDeploymentBucket';
  },
  getLogicalDeploymentBucketOutputVariableName() {
    return 'ServerlessDeploymentBucketName';
  },
  getNormalizedBucketName(bucketName) {
    return this.normalizeNameToAlphaNumericOnly(bucketName);
  },
  getLogicalBucketName(bucketName) {
    return `S3Bucket${this.getNormalizedBucketName(bucketName)}`;
  },

  /*
   * SNS Topic Naming
   */
  getNormalizedSnsTopicName(topicName) {
    return this.normalizeNameToAlphaNumericOnly(topicName);
  },
  getLogicalSnsTopicName(topicName) {
    return `SNSTopic${this.getNormalizedSnsTopicName(topicName)}`;
  },

  /*
   * CloudWatch Event Naming
   */
  getCloudWatchEventId(functionName) {
    return `${functionName}Schedule`;
  },
  getCloudWatchEventName(functionName, scheduleIndex) {
    return `${this.getNormalizedLambdaName(functionName)}EventsRuleSchedule${scheduleIndex}`;
  },

  /*
   * Lambda to S3 Bucket/SNS Topic/CloudWatch Event/ApiGateway Permissions Naming
   */
  getLambdaS3PermissionName(functionName) {
    return `${this.getNormalizedLambdaName(functionName)}LambdaPermissionS3`;
  },
  getLambdaSnsTopicPermissionName(functionName, topicName) {
    return `${this.getNormalizedLambdaName(functionName)}LambdaPermission${
              this.getNormalizedSnsTopicName(topicName)}`;
  },
  getLambdaCloudWatchEventPermissionName(functionName, scheduleIndex) {
    return `${this.getNormalizedLambdaName(functionName)}LambdaPermissionEventsRuleSchedule${
            scheduleIndex}`;
  },
  getLambdaApiGatewayPermissionName(functionName) {
    return `${this.getNormalizedLambdaName(functionName)}LambdaPermissionApiGateway`;
  },
};
