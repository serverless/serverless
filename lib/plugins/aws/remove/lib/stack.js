'use strict';

module.exports = {
  async remove() {
    this.serverless.cli.log('Removing Stack...');
    const stackName = this.provider.naming.getStackName();
    const params = {
      StackName: stackName,
    };

    const customDeploymentRole = this.provider.getCustomDeploymentRole();
    if (customDeploymentRole) {
      params.RoleARN = customDeploymentRole;
    }

    await this.provider.request('CloudFormation', 'deleteStack', params);

    return {
      StackId: stackName,
    };
  },

  async removeStack() {
    return this.remove();
  },
};
