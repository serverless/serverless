'use strict';

module.exports = {
  getExecuteChangeSetParams() {
    const stackName = this.provider.naming.getStackName();
    const changeSetName = this.provider.naming.getStackChangeSetName();

    const executeChangeSetParams = {
      StackName: stackName,
      ChangeSetName: changeSetName,
    };

    if (this.serverless.service.provider.disableRollback) {
      executeChangeSetParams.DisableRollback = this.serverless.service.provider.disableRollback;
    }

    return executeChangeSetParams;
  },
};
