'use strict';

const _ = require('lodash');

module.exports = (stacks, service, stage) => (
  _.flatten(stacks).map((entry) => (
    { Key: `serverless/${service}/${stage}/${entry.directory}/${entry.file}` })
  )
);
