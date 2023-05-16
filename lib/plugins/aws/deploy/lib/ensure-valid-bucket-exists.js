'use strict';

const ServerlessError = require('../../../../serverless-error');
const { log, progress } = require('@serverless/utils/log');
const jsyaml = require('js-yaml');

const mainProgress = progress.get('main');

module.exports = {
  async ensureValidBucketExists() {
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
          `Could not locate deployment bucket: "${this.bucketName}". Error: ${err.message}`,
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

    log.info(
      'Deployment bucket not found. Updating stack to include deployment bucket definition.'
    );
    const stackName = this.provider.naming.getStackName();
    const changeSetName = this.provider.naming.getStackChangeSetName();

    // This is situation where the bucket is not defined in the template at all
    // It covers the case where someone was using custom deployment bucket
    // but removed that setting from the configuration
    mainProgress.notice('Ensuring that deployment bucket exists', { isMainEvent: true });
    const getTemplateResult = await this.provider.request('CloudFormation', 'getTemplate', {
      StackName: stackName,
      TemplateStage: 'Original',
    });

    let templateBody;

    if (getTemplateResult.TemplateBody) {
      try {
        templateBody = JSON.parse(getTemplateResult.TemplateBody);
      } catch (error) {
        try {
          templateBody = jsyaml.load(getTemplateResult.TemplateBody);
        } catch (error2) {
          throw new ServerlessError(
            'Could not parse CloudFormation template',
            'CLOUDFORMATION_TEMPLATE_PARSE_FAILED'
          );
        }
      }
    } else {
      templateBody = {};
    }

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

    let monitorCfData;

    if (this.serverless.service.provider.deploymentMethod === 'direct') {
      const params = this.getUpdateStackParams({ templateBody });

      monitorCfData = await this.provider.request('CloudFormation', 'updateStack', params);
    } else {
      const createChangeSetParams = this.getCreateChangeSetParams({
        changeSetType: 'UPDATE',
        templateBody,
      });

      const executeChangeSetParams = this.getExecuteChangeSetParams();

      // Ensure that previous change set has been removed
      await this.provider.request('CloudFormation', 'deleteChangeSet', {
        StackName: stackName,
        ChangeSetName: changeSetName,
      });

      log.info('Creating new change set.');
      // Create new change set
      const changeSet = await this.provider.request(
        'CloudFormation',
        'createChangeSet',
        createChangeSetParams
      );

      // Wait for changeset to be created
      log.info('Waiting for new change set to be created.');
      await this.waitForChangeSetCreation(changeSetName, stackName);

      // We are not checking if change set has any changes here because we already know that there was no deployment bucket
      // that needs to be created as a part of change set
      // If that would not be the case, that means we have a bug in the logic above

      await this.provider.request('CloudFormation', 'executeChangeSet', executeChangeSetParams);
      monitorCfData = changeSet;
    }
    await this.monitorStack('update', monitorCfData);
    await this.setBucketName();
  },
};
