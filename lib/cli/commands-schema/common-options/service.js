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
  param: {
    usage: 'Pass custom parameter values for "param" variable source (usage: --param="key=value")',
    type: 'multiple',
  },
  ...require('./global'),
};

for (const optionSchema of Object.values(module.exports)) {
  if (!optionSchema.type) optionSchema.type = 'string';
}
