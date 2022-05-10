'use strict';

module.exports = {
  getUpdateStackParams(options) {
    const params = this.getSharedStackActionParams(options);

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
    return params;
  },
};
