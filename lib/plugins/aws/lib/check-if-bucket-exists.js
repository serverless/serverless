'use strict';

const ServerlessError = require('../../../serverless-error');

module.exports = {
  async checkIfBucketExists(bucketName) {
    try {
      await this.provider.request('S3', 'headBucket', {
        Bucket: bucketName,
      });
      return true;
    } catch (err) {
      if (err.code === 'AWS_S3_HEAD_BUCKET_NOT_FOUND') {
        return false;
      }

      if (err.code === 'AWS_S3_HEAD_BUCKET_FORBIDDEN') {
        throw new ServerlessError(
          'Could not access the deployment bucket. Make sure you have sufficient permissions to access it.',
          err.code
        );
      }

      throw err;
    }
  },
};
