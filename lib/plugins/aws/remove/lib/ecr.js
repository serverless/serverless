'use strict';

const { legacy } = require('@serverless/utils/log');

module.exports = {
  async removeEcrRepository() {
    legacy.log('Removing ECR repository...');
    const registryId = await this.provider.getAccountId();
    const repositoryName = this.provider.naming.getEcrRepositoryName();
    const params = {
      registryId,
      repositoryName,
      force: true, // To ensure removal of non-empty repository
    };

    await this.provider.request('ECR', 'deleteRepository', params);
  },
};
