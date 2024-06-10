export default {
  help: {
    usage: 'Show this message',
    shortcut: 'h',
    type: 'boolean',
  },
  version: {
    usage: 'Show version info',
    shortcut: 'v',
    type: 'boolean',
  },
  verbose: {
    usage: 'Show verbose logs',
    type: 'boolean',
  },
  debug: {
    usage: 'Namespace of debug logs to expose (use "*" to display all)',
    type: 'string',
  },
  config: {
    usage: 'Path to serverless config file',
    shortcut: 'c',
    type: 'string',
  },
  stage: {
    usage: 'Stage of the service',
    shortcut: 's',
    type: 'string',
  },
  param: {
    usage:
      'Pass custom parameter values for "param" variable source (usage: --param="key=value")',
    type: 'multiple',
  },
  region: {
    usage: 'Region of the service',
    shortcut: 'r',
    type: 'string',
  },
  'aws-profile': {
    usage: 'AWS profile to use with the command',
    type: 'string',
  },
  org: {
    usage: 'Dashboard org name',
    type: 'string',
  },
  app: {
    usage: 'Dashboard app name',
    type: 'string',
  },
}
