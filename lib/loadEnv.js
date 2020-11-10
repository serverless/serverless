'use strict';

const dotenv = require('dotenv');
const fileExists = require('./utils/fs/fileExists');
const path = require('path');
const _ = require('lodash');

module.exports = async serverless => {
  const serverlessConfigFile = serverless.pluginManager.serverlessConfigFile;
  if (serverlessConfigFile == null) return;

  const stage =
    serverless.processedInput.options.stage ||
    serverless.processedInput.options.s ||
    _.get(serverlessConfigFile, 'provider.stage', 'dev');

  const defaultEnvFilePath = path.join(process.cwd(), '.env');
  const stageEnvFilePath = path.join(process.cwd(), `.env.${stage}`);

  const [doesStageEnvFileExists, doesDefaultEnvFileExists] = await Promise.all([
    fileExists(stageEnvFilePath),
    fileExists(defaultEnvFilePath),
  ]);

  if (serverlessConfigFile.useDotenv) {
    if (doesStageEnvFileExists) {
      dotenv.config({ path: stageEnvFilePath });
    } else if (doesDefaultEnvFileExists) {
      dotenv.config({ path: defaultEnvFilePath });
    }
  } else if (doesStageEnvFileExists || doesDefaultEnvFileExists) {
    serverless._logDeprecation(
      'LOAD_VARIABLES_FROM_ENV_FILES',
      'Detected ".env" files. Note that Framework now supports loading variables from those files ' +
        'when "useDotenv: true" is set (and that will be the default from next major release)'
    );
  }
};
