'use strict';

module.exports = {
  config: {
    usage: 'Path to serverless config file',
    shortcut: 'c',
  },
  stage: {
    usage: 'Stage of the service',
    shortcut: 's',
  },
  ...require('./global'),
};
