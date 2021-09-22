'use strict';

const path = require('path');
const ServerlessError = require('../../lib/serverless-error');

module.exports = {
  validate({ serviceDir }) {
    if (!serviceDir) {
      throw new ServerlessError(
        'This command can only be run inside a service directory',
        'MISSING_SERVICE_DIRECTORY'
      );
    }
  },

  getServerlessFilePath({ serviceDir, configurationFilename }) {
    if (configurationFilename) {
      return path.resolve(serviceDir, configurationFilename);
    }
    throw new ServerlessError(
      'Could not find any serverless service definition file.',
      'MISSING_SERVICE_CONFIGURATION_FILE'
    );
  },

  getPluginInfo(name_) {
    let name;
    let version;
    if (name_.startsWith('@')) {
      [, name, version] = name_.split('@', 3);
      name = `@${name}`;
    } else {
      [name, version] = name_.split('@', 2);
    }
    return { name, version };
  },
};
