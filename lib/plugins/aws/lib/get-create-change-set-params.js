'use strict';

module.exports = {
  getCreateChangeSetParams({ changeSetType, templateUrl, templateBody }) {
    const changeSetName = this.provider.naming.getStackChangeSetName();
    const params = {
      ...this.getSharedStackActionParams({ templateUrl, templateBody }),
      ChangeSetName: changeSetName,
      ChangeSetType: changeSetType,
    };

    if (this.serverless.service.provider.rollbackConfiguration) {
      params.RollbackConfiguration = this.serverless.service.provider.rollbackConfiguration;
    }

    return params;
  },
};
