'use strict';

const _ = require('lodash');

module.exports = {

  // General
  normalizeName(name) {
    return `${_.upperFirst(name)}`;
  },
  normalizeNameToAlphaNumericOnly(name) {
    return this.normalizeName(name.replace(/[^0-9A-Za-z]/g, ''));
  },
  normalizePathPart(path) {
    return this.normalizeNameToAlphaNumericOnly(
      path.replace(/-/g, 'Dash')
        .replace(/\{(.*)\}/g, '$1Var'));
  },

  getServiceEndpointRegex() {
    return /^ServiceEndpoint/;
  },

  // Stack
  getStackName() {
    return `${this.sdk.serverless.service.service}-${this.sdk.getStage()}`;
  },

  getLogGroupLogicalId(functionName) {
    return `${this.getNormalizedFunctionName(functionName)}LogGroup`;
  },

  // Lambda
  getNormalizedFunctionName(functionName) {
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
  getLambdaLogicalId(functionName) {
    return `${this.getNormalizedFunctionName(functionName)}LambdaFunction`;
  },
  getLambdaLogicalIdRegex() {
    return /LambdaFunction$/;
  },
  getLambdaOutputLogicalId(functionName) {
    return `${this.getLambdaLogicalId(functionName)}Arn`;
  },
  getLambdaOutputLogicalIdRegex() {
    return /LambdaFunctionArn$/;
  },

  // API Gateway
  generateApiGatewayDeploymentLogicalId() {
    return `ApiGatewayDeployment${(new Date()).getTime().toString()}`;
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
    return resourcePath.split('/').map(
      this.normalizePathPart.bind(this)
    ).join('');
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
  getApiKeyLogicalId(apiKeyNumber) {
    return `ApiGatewayApiKey${apiKeyNumber}`;
  },
  getApiKeyLogicalIdRegex() {
    return /^ApiGatewayApiKey/;
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
    return `${
      this.getNormalizedFunctionName(functionName)
    }EventSourceMapping${
      this.normalizeName(streamType)
    }${this.normalizeNameToAlphaNumericOnly(streamName)}`;
  },

  // Permissions
  getLambdaS3PermissionLogicalId(functionName) {
    return `${this.getNormalizedFunctionName(functionName)}LambdaPermissionS3`;
  },
  getLambdaSnsPermissionLogicalId(functionName, topicName) {
    return `${this.getNormalizedFunctionName(functionName)}LambdaPermission${
      this.normalizeTopicName(topicName)}`;
  },
  getLambdaSchedulePermissionLogicalId(functionName, scheduleIndex) {
    return `${this.getNormalizedFunctionName(functionName)}LambdaPermissionEventsRuleSchedule${
      scheduleIndex}`;
  },
  getLambdaApiGatewayPermissionLogicalId(functionName) {
    return `${this.getNormalizedFunctionName(functionName)}LambdaPermissionApiGateway`;
  },
};
