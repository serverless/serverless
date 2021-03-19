// TODO: Remove with next major release

'use strict';

const path = require('path');
const _ = require('lodash');
const memoizee = require('memoizee');
const fileExists = require('../utils/fs/fileExists');
const logDeprecation = require('../utils/logDeprecation');

module.exports = memoizee(
  async (options, configuration) => {
    const stage = options.stage || _.get(configuration, 'provider.stage', 'dev');
    if (configuration.useDotenv) {
      require('./load-dotenv')(stage);
      return;
    }

    const defaultEnvFilePath = path.resolve('.env');
    const stageEnvFilePath = path.resolve(`.env.${stage}`);

    const [doesStageEnvFileExists, doesDefaultEnvFileExists] = await Promise.all([
      fileExists(stageEnvFilePath),
      fileExists(defaultEnvFilePath),
    ]);

    if (doesDefaultEnvFileExists || doesStageEnvFileExists) {
      logDeprecation(
        'LOAD_VARIABLES_FROM_ENV_FILES',
        'Detected ".env" files. In the next major release variables from ".env" ' +
          'files will be automatically loaded into the serverless build process. ' +
          'Set "useDotenv: true" to adopt that behavior now.',
        { serviceConfig: configuration }
      );
    }
  },
  {
    length: 0 /* Intentionally no "promise: true" as rejection means critical non-retryable error */,
  }
);
