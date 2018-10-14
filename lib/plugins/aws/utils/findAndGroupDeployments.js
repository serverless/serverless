'use strict';

const _ = require('lodash');

module.exports = (s3Response, prefix, service, stage) => {
  if (s3Response.Contents.length) {
    const regex = new RegExp(`${prefix}/${service}/${stage}/(.+-.+-.+-.+)/(.+)`);
    const s3Objects = s3Response.Contents.filter((s3Object) => s3Object.Key.match(regex));
    const names = s3Objects.map((s3Object) => {
      const match = s3Object.Key.match(regex);
      return {
        directory: match[1],
        file: match[2],
      };
    });
    const grouped = _.groupBy(names, 'directory');
    return _.map(grouped, (value) => value);
  }
  return [];
};
