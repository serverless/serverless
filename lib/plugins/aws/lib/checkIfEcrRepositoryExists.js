'use strict';

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
      throw err;
    }
  },
};
