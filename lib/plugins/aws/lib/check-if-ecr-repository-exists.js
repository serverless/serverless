'use strict';

const { log } = require('@serverless/utils/log');

module.exports = {
  async checkIfEcrRepositoryExists() {
    const registryId = await this.provider.getAccountId();
    const repositoryName = this.provider.naming.getEcrRepositoryName();
    try {
      await this.provider.request('ECR', 'describeRepositories', {
        repositoryNames: [repositoryName],
        registryId,
      });
      return true;
    } catch (err) {
      if (err.providerError && err.providerError.code === 'RepositoryNotFoundException') {
        return false;
      }
      if (err.providerError && err.providerError.code === 'AccessDeniedException') {
        if (this.serverless.service.provider.ecr && this.serverless.service.provider.ecr.images) {
          log.warning(
            'Could not access ECR repository due to denied access, but there are images defined in "provider.ecr". ECR repository removal will be skipped.'
          );
        }
        // Check if user has images defined and issue warning that we could not
        return false;
      }
      throw err;
    }
  },
};
