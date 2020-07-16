'use strict';

module.exports = function getS3EndpointForRegion(region) {
  const strRegion = region.toLowerCase();
  return `s3.${strRegion}.amazonaws.com.cn`;
};
