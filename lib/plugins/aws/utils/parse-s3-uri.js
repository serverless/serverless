'use strict';

const patterns = [
  // S3 URI. Ex: s3://bucket/path/to/artifact.zip
  new RegExp('^s3://([^/]+)/(.+)'),

  // New style S3 URL. Ex: https://bucket.s3.amazonaws.com/path/to/artifact.zip
  new RegExp('([^/]+)\\.s3\\.amazonaws\\.com/(.+)'),

  // Old style S3 URL. Ex: https://s3.amazonaws.com/bucket/path/to/artifact.zip
  new RegExp('s3\\.amazonaws\\.com/([^/]+)/(.+)'),
];

module.exports = (url) => {
  for (const regex of patterns) {
    const match = url.match(regex);
    if (match) {
      return {
        Bucket: match[1],
        Key: match[2],
      };
    }
  }

  return null;
};
