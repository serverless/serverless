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

for (const optionSchema of Object.values(module.exports)) {
  if (!optionSchema.type) optionSchema.type = 'string';
}
