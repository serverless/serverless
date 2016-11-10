'use strict';

const _ = require('lodash');

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

  getServiceEndpointRegex() {
    return /^ServiceEndpoint/;
  },

  /*
   * Stack Naming
   */
  getStackName() {
    return `${this.sdk.serverless.service.service}-${this.sdk.getStage()}`;
  },

  getLogicalLogGroupName(functionName) {
    return `${this.getNormalizedLambdaName(functionName)}LogGroup`;
  },

  /*
   * Lambda Function Naming
   */
  getNormalizedLambdaName(functionName) {
    return this.normalizeName(functionName);
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
  getLogicalApiGatewayApiKeyName(apiKeyNumber) {
    return `ApiGatewayApiKey${apiKeyNumber}`;
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
   * Stream Event Naming
   */
  getStreamLogicalId(functionName, streamType, streamName) {
    return `${
      this.getNormalizedLambdaName(functionName)
    }EventSourceMapping${
      this.normalizeName(streamType)
    }${this.normalizeNameToAlphaNumericOnly(streamName)}`;
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
