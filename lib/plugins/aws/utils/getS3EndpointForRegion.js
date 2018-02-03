'use strict';

module.exports = function getS3EndpointForRegion(region) {
  const strRegion = region.toLowerCase();
  // look for govcloud - currently s3-us-gov-west-1.amazonaws.com
  if (strRegion.match(/us-gov/)) return `s3-${strRegion}.amazonaws.com`;
  // look for china - currently s3.cn-north-1.amazonaws.com.cn
  if (strRegion.match(/cn-/)) return `s3.${strRegion}.amazonaws.com.cn`;
  // default s3 endpoint for other regions
  return 's3.amazonaws.com';
};
