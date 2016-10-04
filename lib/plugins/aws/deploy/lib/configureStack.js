'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const path = require('path');

/**
 * Load the stack template from disk
 * @returns {*} The stack template
 */
function loadStackTemplate() {
  this.serverless.service.provider
    .compiledCloudFormationTemplate = this.serverless.utils.readFileSync(
      path.join(this.serverless.config.serverlessPath,
        'plugins',
        'aws',
        'deploy',
        'lib',
        'core-cloudformation-template.json')
    );
}
/**
 * Check whether any function is missing an assigned role
 *
 * All functions have a role if a provider-wide `role` is declared.  If one is not declared then
 * each function must declare its own `role`.  Each function may override a declared provider level
 * `role` by declaring its own
 *
 * @returns {boolean} Whether any of the declared functions did not have a `role`
 */
function anyFunctionHasNoRole() {
  let ret = false;
  if (!('role' in this.serverless.service.provider)) {
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObject = this.serverless.service.getFunction(functionName);
      if (!('role' in functionObject)) {
        ret = true;
      }
    });
  }
  return ret;
}
/**
 * Load the role template
 * @returns {*} The role template
 */
function loadRoleTemplate() {
  return this.serverless.utils.readFileSync(
    path.join(this.serverless.config.serverlessPath,
      'plugins',
      'aws',
      'deploy',
      'lib',
      'iam-role-lambda-execution-template.json')
  );
}
/**
 * Load the policy template
 * @returns {*} The policy template
 */
function loadPolicyTemplate() {
  return this.serverless.utils.readFileSync(
    path.join(this.serverless.config.serverlessPath,
      'plugins',
      'aws',
      'deploy',
      'lib',
      'iam-policy-lambda-execution-template.json')
  );
}
/**
 * Add the default role and policy to the CFT
 */
function addDefaultRoleAndPolicy() {
  // merge in the iamRoleLambdaTemplate
  const iamRoleLambdaExecutionTemplate = loadRoleTemplate.call(this);

  _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
    iamRoleLambdaExecutionTemplate);

  // merge in the iamPolicyLambdaTemplate
  const iamPolicyLambdaExecutionTemplate = loadPolicyTemplate.call(this);

  // set the necessary variables for the IamPolicyLambda
  iamPolicyLambdaExecutionTemplate
    .IamPolicyLambdaExecution
    .Properties
    .PolicyName = `${this.serverless.config.stage}-${this.serverless.service.service}-lambda`;

  iamPolicyLambdaExecutionTemplate
    .IamPolicyLambdaExecution
    .Properties
    .PolicyDocument
    .Statement[0]
    .Resource = `arn:aws:logs:${this.serverless.config.region}:*:*`;

  _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
    iamPolicyLambdaExecutionTemplate);

  // add custom iam role statements
  if (this.serverless.service.provider.iamRoleStatements &&
    this.serverless.service.provider.iamRoleStatements instanceof Array) {
    this.serverless.service.provider.compiledCloudFormationTemplate
      .Resources
      .IamPolicyLambdaExecution
      .Properties
      .PolicyDocument
      .Statement = this.serverless.service.provider.compiledCloudFormationTemplate
      .Resources
      .IamPolicyLambdaExecution
      .Properties
      .PolicyDocument
      .Statement.concat(this.serverless.service.provider.iamRoleStatements);
  }
}
/**
 * Add a defined deployment bucket after validating it.
 * @returns {*} A promise that will be resolved on completion
 */
function addDeploymentBucket() {
  const bucketName = this.serverless.service.provider.deploymentBucket;

  if (bucketName) {
    return BbPromise.bind(this)
      .then(() => this.validateS3BucketName(bucketName))
      .then(() => this.sdk.request('S3',
        'getBucketLocation',
        {
          Bucket: bucketName,
        },
        this.serverless.config.stage,
        this.serverless.config.region
      ))
      .then(result => {
        if (result.LocationConstraint !== this.serverless.config.region) {
          throw new this.serverless.classes.Error(
            'Deployment bucket is not in the same region as the lambda function'
          );
        }
        this.bucketName = bucketName;
        this.serverless.service.package.deploymentBucket = bucketName;
        this.serverless.service.provider.compiledCloudFormationTemplate
          .Outputs.ServerlessDeploymentBucketName.Value = bucketName;

        delete this.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ServerlessDeploymentBucket;
      });
  }

  return BbPromise.resolve();
}

module.exports = {
  /**
   * Configure the stack using the default template and adding IAM and Bucket information as
   * appropriate.
   * @return {*} A promise for completion of configuration
   */
  configureStack() {
    loadStackTemplate.call(this);
    if (anyFunctionHasNoRole.call(this)) {
      addDefaultRoleAndPolicy.call(this);
    }
    return addDeploymentBucket.call(this);
  },
};
