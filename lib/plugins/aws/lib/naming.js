'use strict';

const _ = require('lodash');

/**
 * A class that can be used to centralize the naming for a provider plugin.  The intent is for this
 * to enable the configurability of using custom naming plugins or configurations, based on the best
 * interest of the framework.
 */
class Naming {
  // TODO this configure pattern is fugly.  it serves the need to have static and also configured
  // TODO use patterns without complicating the life of consumers.  In standard (non-test) usage
  // TODO the frequency of using this method should be low so maybe it doesn't matter.
  // TODO better suggestions highly welcome
  configure(serverless) {
    this.serverless = serverless;
  }

  /*
   * General Name Normalization
   */
  normalizeName(name) {
    return `${_.upperFirst(name)}`;
  }
  normalizeNameToAlphaNumericOnly(name) {
    return this.normalizeName(name.replace(/[^0-9A-Za-z]/g, ''));
  }
  normalizePathtoCapitalAlphaNumbericOnlyWithReplacement(path) {
    return this.normalizeNameToAlphaNumericOnly(
      path.replace(/-/g, 'Dash')
          .replace(/\{(.*)\}/g, '$1Var'));
  }

  // Probably belongs in a non-aws-specific code asset
  getServiceEndpointRegex() {
    return /^ServiceEndpoint/;
  }

  /*
   * Stack Naming
   */
  getStackName() {
    return `${this.serverless.service.service}-${this.serverless.config.stage}`;
  }

  /*
   * IAM (Role and Policy) Naming
   */
  getRolePath() {
    return '/';
  }
  getRoleName() {
    return {
      'Fn::Join': [
        '-',
        [
          this.serverless.service.service,
          this.serverless.config.stage,
          this.serverless.config.region,
          'lambdaRole',
        ],
      ],
    };
  }
  getLogicalRoleName() {
    return 'IamRoleLambdaExecution';
  }
  getPolicyName() {
    return { // TODO should probably have name ordered and altered as above - see AWS docs
      'Fn::Join': [
        '-',
        [
          this.serverless.config.stage,
          // TODO is it a bug here in that the role is not specific to the region?
          this.serverless.service.service,
          'lambda',
        ],
      ],
    };
  }
  getLogicalPolicyName() {
    return 'IamPolicyLambdaExecution';
  }

  getLogGroupName(functionName) {
    return `/aws/lambda/${functionName}`;
  }

  /*
   * Lambda Function Naming
   */
  getNormalizedLambdaName(functionName) {
    return this.normalizeName(functionName);
  }
  extractLambdaNameFromArn(functionArn) {
    const splitArn = functionArn.split(':');
    // TODO the following two lines assumes default function naming?  Is there a better way?
    // TODO (see ~/lib/classes/Service.js:~155)
    const splitName = splitArn[splitArn.length - 1].split('-');
    return splitName[splitName.length - 1];
  }
  // TODO rectify this with the above and the code that uses both
  // TODO (see ~/lib/plugins/aws/info/index.js)
  extractLambdaNameFromArn2(functionArn) {
    return functionArn.substring(functionArn.lastIndexOf(':') + 1);
  }
  getLogicalLambdaName(functionName) {
    return `${this.getNormalizedLambdaName(functionName)}LambdaFunction`;
  }
  getLogicalLambdaNameRegex() {
    return /LambdaFunction$/;
  }
  getLogicalLambdaArnName(functionName) {
    return `${this.getLogicalLambdaName(functionName)}Arn`;
  }
  getLogicalLambdaArnNameRegex() {
    return /LambdaFunctionArn$/;
  }

  /*
   * ApiGateway Authorizer Lambda & Method Naming
   */
  getApiGatewayName() {
    return `${this.serverless.config.stage}-${this.serverless.service.service}`;
  }
  getLogicalApiGatewayName() {
    return 'ApiGatewayRestApi';
  }
  getNormalizedAuthorizerName(functionName) {
    return this.getNormalizedLambdaName(functionName);
  }
  getLogicalAuthorizerName(functionName) {
    return `${this.getNormalizedAuthorizerName(functionName)}ApiGatewayAuthorizer`;
  }
  extractAuthorizerIdFromArn(authorizerArn) {
    return this.extractLambdaNameFromArn(authorizerArn);
  }
  getLogicalAuthorizerArnName(functionName) {
    return this.getLogicalLambdaArnName(functionName);
  }
  getNormalizedApiGatewayResourceName(resourcePath) {
    return resourcePath.split('/').map(
      this.normalizePathtoCapitalAlphaNumbericOnlyWithReplacement.bind(this)
    ).join('');
  }
  getLogicalApiGatewayResourceName(resourcePath) {
    return `ApiGatewayResource${this.getNormalizedApiGatewayResourceName(resourcePath)}`;
  }
  extractResourceId(logicalApiGatewayResourceName) {
    return logicalApiGatewayResourceName.match(/ApiGatewayResource(.*)/)[1];
  }
  getNormalizedApiGatewayMethodName(methodName) {
    return this.normalizeName(methodName.toLowerCase());
  }
  getLogicalApiGatewayMethodName(resourceId, methodName) {
    return `ApiGatewayMethod${resourceId}${this.getNormalizedApiGatewayMethodName(methodName)}`;
  }
  getLogicalApiGatewayApiKeyRegex() {
    return /^ApiGatewayApiKey/;
  }

  /*
   * S3 Bucket Naming
   */
  getLogicalDeploymentBucketName() {
    return 'ServerlessDeploymentBucket';
  }
  getLogicalDeploymentBucketOutputVariableName() {
    return 'ServerlessDeploymentBucketName';
  }
  getNormalizedBucketName(bucketName) {
    return this.normalizeNameToAlphaNumericOnly(bucketName);
  }
  getLogicalBucketName(bucketName) {
    return `S3Bucket${this.getNormalizedBucketName(bucketName)}`;
  }

  /*
   * SNS Topic Naming
   */
  getNormalizedSnsTopicName(topicName) {
    return this.normalizeNameToAlphaNumericOnly(topicName);
  }
  getLogicalSnsTopicName(topicName) {
    return `SNSTopic${this.getNormalizedSnsTopicName(topicName)}`;
  }

  /*
   * CloudWatch Event Naming
   */
  getCloudWatchEventId(functionName) {
    return `${functionName}Schedule`;
  }
  getCloudWatchEventName(functionName, scheduleIndex) {
    return `${this.getNormalizedLambdaName(functionName)}EventsRuleSchedule${scheduleIndex}`;
  }

  /*
   * Lambda to S3 Bucket/SNS Topic/CloudWatch Event/ApiGateway Permissions Naming
   */
  getLambdaS3PermissionName(functionName) {
    return `${this.getNormalizedLambdaName(functionName)}LambdaPermissionS3`;
  }
  getLambdaSnsTopicPermissionName(functionName, topicName) {
    return `${this.getNormalizedLambdaName(functionName)}LambdaPermission${
              this.getNormalizedSnsTopicName(topicName)}`;
  }
  getLambdaCloudWatchEventPermissionName(functionName, scheduleIndex) {
    return `${this.getNormalizedLambdaName(functionName)}LambdaPermissionEventsRuleSchedule${
            scheduleIndex}`;
  }
  getLambdaApiGatewayPermissionName(functionName) {
    return `${this.getNormalizedLambdaName(functionName)}LambdaPermissionApiGateway`;
  }
}

const instance = new Naming();

module.exports = instance;
