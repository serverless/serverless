'use strict';

module.exports = {
  getSharedStackActionParams({ templateUrl, templateBody }) {
    let stackTags = { STAGE: this.provider.getStage() };
    const stackName = this.provider.naming.getStackName();

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
    };

    if (templateBody) {
      params.TemplateBody = JSON.stringify(templateBody);
    }

    if (templateUrl) {
      params.TemplateURL = templateUrl;
    }

    if (
      (templateUrl &&
        this.serverless.service.provider.compiledCloudFormationTemplate &&
        this.serverless.service.provider.compiledCloudFormationTemplate.Transform) ||
      (templateBody && templateBody.Transform)
    ) {
      params.Capabilities.push('CAPABILITY_AUTO_EXPAND');
    }

    const customDeploymentRole = this.provider.getCustomDeploymentRole();
    if (customDeploymentRole) {
      params.RoleARN = customDeploymentRole;
    }

    if (this.serverless.service.provider.notificationArns) {
      params.NotificationARNs = this.serverless.service.provider.notificationArns;
    } else {
      params.NotificationARNs = [];
    }

    if (this.serverless.service.provider.stackParameters) {
      params.Parameters = this.serverless.service.provider.stackParameters;
    }

    return params;
  },
};
