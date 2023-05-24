'use strict';

module.exports = {
  'region': {
    usage: 'Region of the service',
    shortcut: 'r',
  },
  'aws-profile': {
    usage: 'AWS profile to use with the command',
  },
  'app': { usage: 'Dashboard app' },
  'org': { usage: 'Dashboard org' },
  'use-local-credentials': {
    usage:
      'Rely on locally resolved AWS credentials instead of loading them from ' +
      'Dashboard provider settings (applies only to services integrated with Dashboard)',
    type: 'boolean',
  },
  ...require('./service'),
};

for (const optionSchema of Object.values(module.exports)) {
  if (!optionSchema.type) optionSchema.type = 'string';
}
