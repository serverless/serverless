'use strict';

module.exports = (stacks, prefix, service, stage) =>
  stacks.flat().map((entry) => ({
    Key: `${prefix}/${service}/${stage}/${entry.directory}/${entry.file}`,
  }));
