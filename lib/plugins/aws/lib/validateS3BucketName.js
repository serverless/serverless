'use strict';

const BbPromise = require('bluebird');

module.exports = {
  /**
   * Retrieved 9/27/2016 from http://docs.aws.amazon.com/AmazonS3/latest/dev/BucketRestrictions.html
   * Bucket names must be at least 3 and no more than 63 characters long.
   * Bucket names must be a series of one or more labels.
   * Adjacent labels are separated by a single period (.).
   * Bucket names can contain lowercase letters, numbers, and hyphens.
   * Each label must start and end with a lowercase letter or a number.
   * Bucket names must not be formatted as an IP address (e.g., 192.168.5.4).
   * @param bucketName
   */
  validateS3BucketName(bucketName) {
    return BbPromise.resolve().then(() => {
      let error;
      if (!bucketName) {
        error = 'Bucket name cannot be undefined or empty';
      } else if (bucketName.length < 3) {
        error = `Bucket name is shorter than 3 characters. ${bucketName}`;
      } else if (bucketName.length > 63) {
        error = `Bucket name is longer than 63 characters. ${bucketName}`;
      } else if (/[A-Z]/.test(bucketName)) {
        error = `Bucket name cannot contain uppercase letters. ${bucketName}`;
      } else if (/^[^a-z0-9]/.test(bucketName)) {
        error = `Bucket name must start with a letter or number. ${bucketName}`;
      } else if (/[^a-z0-9]$/.test(bucketName)) {
        error = `Bucket name must end with a letter or number. ${bucketName}`;
      } else if (!/^[a-z0-9][a-z.0-9-]+[a-z0-9]$/.test(bucketName)) {
        error = `Bucket name contains invalid characters, [a-z.0-9-] ${bucketName}`;
      } else if (/\.{2,}/.test(bucketName)) {
        error = `Bucket name cannot contain consecutive periods (.) ${bucketName}`;
      } else if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(bucketName)) {
        error = `Bucket name cannot look like an IPv4 address. ${bucketName}`;
      }

      if (error) {
        throw new this.serverless.classes.Error(error);
      }
      return true;
    });
  },
};
