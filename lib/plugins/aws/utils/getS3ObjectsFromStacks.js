'use strict';

const _ = require('lodash');

module.exports = (stacks, prefix, service, stage) =>
  _.flatten(stacks).map(entry => ({
    Key: `${prefix}/${service}/${stage}/${entry.directory}/${entry.file}`,
  }));
