'use strict';

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

      throw err;
    }
  },
};
