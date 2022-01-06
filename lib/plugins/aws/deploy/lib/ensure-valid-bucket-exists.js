'use strict';

const ServerlessError = require('../../../../serverless-error');
const { log, legacy, progress } = require('@serverless/utils/log');

const mainProgress = progress.get('main');

module.exports = {
  async ensureValidBucketExists() {
    legacy.log('Ensuring that deployment bucket exists');

    // Ensure to set bucket name if it can be resolved
    // Result of this operation will determine how further validation will be performed
    try {
      await this.setBucketName();
    } catch (err) {
      // If there is a validation error with expected message, it means that logical resource for
      // S3 bucket does not exist and we want to proceed with handling that situation
      if (
        err.providerError.code !== 'ValidationError' ||
        !err.message.includes('does not exist for stack')
      ) {
        throw err;
      }
    }

    // Validate that custom deployment bucket exists and has proper location
    if (this.serverless.service.provider.deploymentBucket) {
      let result;
      try {
        result = await this.provider.request('S3', 'getBucketLocation', {
          Bucket: this.bucketName,
        });
      } catch (err) {
        throw new ServerlessError(
          `Could not locate deployment bucket. Error: ${err.message}`,
          'DEPLOYMENT_BUCKET_NOT_FOUND'
        );
      }

      if (result.LocationConstraint === '') result.LocationConstraint = 'us-east-1';
      if (result.LocationConstraint === 'EU') result.LocationConstraint = 'eu-west-1';
      if (result.LocationConstraint !== this.provider.getRegion()) {
        throw new ServerlessError(
          'Deployment bucket is not in the same region as the lambda function',
          'DEPLOYMENT_BUCKET_INVALID_REGION'
        );
      }
      // If above is satisfied, then custom S3 bucket is valid
      return;
    }

    // If bucket name is set, it means it's defined as a part of CloudFormation template (custom bucket case was handled by logic above)
    if (this.bucketName) {
      if (!(await this.checkIfBucketExists(this.bucketName))) {
        // It means that bucket was removed manually but is still a part of the CloudFormation stack, we cannot manually fix it
        throw new ServerlessError(
          'Deployment bucket has been removed manually. Please recreate it or remove your service and attempt to deploy it again',
          'DEPLOYMENT_BUCKET_REMOVED_MANUALLY'
        );
      }
      return;
    }

    legacy.log(
      'Deployment bucket not found. Updating stack to include deployment bucket definition.'
    );
    log.info(
      'Deployment bucket not found. Updating stack to include deployment bucket definition.'
    );
    const stackName = this.provider.naming.getStackName();

    // This is situation where the bucket is not defined in the template at all
    // It covers the case where someone was using custom deployment bucket
    // but removed that setting from the configuration
    mainProgress.notice('Ensuring that deployment bucket exists', { isMainEvent: true });
    const getTemplateResult = await this.provider.request('CloudFormation', 'getTemplate', {
      StackName: stackName,
      TemplateStage: 'Original',
    });

    const templateBody = JSON.parse(getTemplateResult.TemplateBody);
    if (!templateBody.Resources) {
      templateBody.Resources = {};
    }
    if (!templateBody.Outputs) {
      templateBody.Outputs = {};
    }
    Object.assign(
      templateBody.Resources,
      this.serverless.service.provider.coreCloudFormationTemplate.Resources
    );
    Object.assign(
      templateBody.Outputs,
      this.serverless.service.provider.coreCloudFormationTemplate.Outputs
    );
    let stackTags = { STAGE: this.provider.getStage() };

    // Merge additional stack tags
    if (this.serverless.service.provider.stackTags) {
      const customKeys = Object.keys(this.serverless.service.provider.stackTags);
      const collisions = Object.keys(stackTags).filter((defaultKey) =>
        customKeys.some((key) => defaultKey.toLowerCase() === key.toLowerCase())
      );

      // Delete collisions upfront
      for (const key of collisions) {
        delete stackTags[key];
      }

      stackTags = Object.assign(stackTags, this.serverless.service.provider.stackTags);
    }

    const params = {
      StackName: stackName,
      Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
      Parameters: [],
      Tags: Object.keys(stackTags).map((key) => ({ Key: key, Value: stackTags[key] })),
      TemplateBody: JSON.stringify(templateBody),
    };

    const customDeploymentRole = this.provider.getCustomDeploymentRole();
    if (customDeploymentRole) {
      params.RoleARN = customDeploymentRole;
    }

    if (this.serverless.service.provider.notificationArns) {
      params.NotificationARNs = this.serverless.service.provider.notificationArns;
    }

    if (this.serverless.service.provider.stackParameters) {
      params.Parameters = this.serverless.service.provider.stackParameters;
    }

    // Policy must have at least one statement, otherwise no updates would be possible at all
    if (
      this.serverless.service.provider.stackPolicy &&
      Object.keys(this.serverless.service.provider.stackPolicy).length
    ) {
      params.StackPolicyBody = JSON.stringify({
        Statement: this.serverless.service.provider.stackPolicy,
      });
    }

    if (this.serverless.service.provider.rollbackConfiguration) {
      params.RollbackConfiguration = this.serverless.service.provider.rollbackConfiguration;
    }

    if (this.serverless.service.provider.disableRollback) {
      params.DisableRollback = this.serverless.service.provider.disableRollback;
    }

    if (templateBody.Transform) {
      params.Capabilities.push('CAPABILITY_AUTO_EXPAND');
    }

    const cfData = await this.provider.request('CloudFormation', 'updateStack', params);
    await this.monitorStack('update', cfData);
    await this.setBucketName();
  },
};
