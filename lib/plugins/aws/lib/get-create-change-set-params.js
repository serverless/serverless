'use strict';

module.exports = {
  getCreateChangeSetParams({ changeSetType, templateUrl, templateBody }) {
    let stackTags = { STAGE: this.provider.getStage() };
    const stackName = this.provider.naming.getStackName();
    const changeSetName = this.provider.naming.getStackChangeSetName();

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

    const createChangeSetParams = {
      StackName: stackName,
      ChangeSetName: changeSetName,
      ChangeSetType: changeSetType,
      Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
      Parameters: [],
      Tags: Object.keys(stackTags).map((key) => ({ Key: key, Value: stackTags[key] })),
    };

    if (templateUrl) {
      createChangeSetParams.TemplateURL = templateUrl;
    }

    if (templateBody) {
      createChangeSetParams.TemplateBody = JSON.stringify(templateBody);
    }

    if (
      (templateUrl &&
        this.serverless.service.provider.compiledCloudFormationTemplate &&
        this.serverless.service.provider.compiledCloudFormationTemplate.Transform) ||
      (templateBody && templateBody.Transform)
    ) {
      createChangeSetParams.Capabilities.push('CAPABILITY_AUTO_EXPAND');
    }

    const customDeploymentRole = this.provider.getCustomDeploymentRole();
    if (customDeploymentRole) {
      createChangeSetParams.RoleARN = customDeploymentRole;
    }

    if (this.serverless.service.provider.notificationArns) {
      createChangeSetParams.NotificationARNs = this.serverless.service.provider.notificationArns;
    }

    if (this.serverless.service.provider.stackParameters) {
      createChangeSetParams.Parameters = this.serverless.service.provider.stackParameters;
    }

    // Policy must have at least one statement, otherwise no updates would be possible at all
    if (
      this.serverless.service.provider.stackPolicy &&
      Object.keys(this.serverless.service.provider.stackPolicy).length
    ) {
      createChangeSetParams.StackPolicyBody = JSON.stringify({
        Statement: this.serverless.service.provider.stackPolicy,
      });
    }

    if (this.serverless.service.provider.rollbackConfiguration) {
      createChangeSetParams.RollbackConfiguration =
        this.serverless.service.provider.rollbackConfiguration;
    }

    return createChangeSetParams;
  },
};
