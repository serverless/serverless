'use strict';

const _ = require('lodash');

module.exports = {
  async cleanupEcrRepository() {
    const repositoryName = this.provider.naming.getEcrRepositoryName();
    const registryId = await this.provider.getAccountId();

    const describeImagesParams = {
      repositoryName,
      registryId,
    };

    const imageDetails = [];
    let describeImagesResponse = await this.provider.request(
      'ECR',
      'describeImages',
      describeImagesParams
    );
    imageDetails.push(...describeImagesResponse.imageDetails);

    while (describeImagesResponse.nextToken) {
      describeImagesResponse = await this.provider.request('ECR', 'describeImages', {
        ...describeImagesParams,
        nextToken: describeImagesResponse.nextToken,
      });
      imageDetails.push(...describeImagesResponse.imageDetails);
    }

    // We should only keep the images that are tagged with imageNames that are defined in service
    const imageTagsDefinedInService = new Set(
      Object.keys(_.get(this.serverless.service.provider, 'ecr.images', new Set()))
    );
    const imageDigestsToRemove = imageDetails
      .filter(
        (image) =>
          !image.imageTags || !image.imageTags.some((tag) => imageTagsDefinedInService.has(tag))
      )
      .map(({ imageDigest }) => ({ imageDigest }));

    if (imageDigestsToRemove.length) {
      this.serverless.cli.log('Removing old images from ECR...');
      const batchDeleteImageParams = {
        repositoryName,
        registryId,
        imageIds: imageDigestsToRemove,
      };

      await this.provider.request('ECR', 'batchDeleteImage', batchDeleteImageParams);
    }
  },
};
