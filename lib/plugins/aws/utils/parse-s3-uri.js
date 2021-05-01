'use strict';

// https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-bucket-intro.html
const patterns = [
  // S3 URI. Ex: s3://bucket/path/to/artifact.zip
  new RegExp('^s3://(?<bucket>[^/]+)/(?<key>.+)'),

  // New style S3 URL.
  // Ex: https://bucket.s3.amazonaws.com/path/to/artifact.zip
  // Ex: https://bucket.s3.region.amazonaws.com/path/to/artifact.zip
  // Ex: https://bucket.s3-region.amazonaws.com/path/to/artifact.zip
  new RegExp('(?<bucket>[^/]+)\\.s3([\\.-][\\w\\d-]+)?\\.amazonaws\\.com/(?<key>.+)'),

  // Old style S3 URL.
  // Ex: https://s3.amazonaws.com/bucket/path/to/artifact.zip
  // Ex: https://s3.region.amazonaws.com/bucket/path/to/artifact.zip
  // Ex: https://s3-region.amazonaws.com/bucket/path/to/artifact.zip
  new RegExp('s3([\\.-][\\w\\d-]+)?\\.amazonaws\\.com/(?<bucket>[^/]+)/(?<key>.+)'),
];

module.exports = (url) => {
  for (const regex of patterns) {
    const match = url.match(regex);
    if (match) {
      return {
        Bucket: match.groups.bucket,
        Key: match.groups.key,
      };
    }
  }

  return null;
};
