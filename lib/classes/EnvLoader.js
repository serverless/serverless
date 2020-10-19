'use strict';

const dotenv = require('dotenv');
const fileExistsSync = require('../utils/fs/fileExistsSync');
const path = require('path');
const _ = require('lodash');

class EnvLoader {
  constructor(serverless) {
    this.serverless = serverless;
  }

  async load() {
    const serverlessConfigFile = this.serverless.pluginManager.serverlessConfigFile;
    if (serverlessConfigFile == null) return;

    const stage =
      this.serverless.processedInput.options.stage ||
      _.get(serverlessConfigFile, 'provider.stage', 'dev');

    // TODO: Should it be based on provided `servicePath` ?
    const defaultEnvFilePath = path.join(process.cwd(), '.env');
    const stageEnvFilePath = path.join(process.cwd(), `.env.${stage}`);

    const doesDefaultEnvFileExists = fileExistsSync(defaultEnvFilePath);
    const doesStageEnvFileExists = fileExistsSync(stageEnvFilePath);

    const useDotenv = serverlessConfigFile.useDotenv;
    if (useDotenv === true) {
      if (doesStageEnvFileExists) {
        dotenv.config({ path: stageEnvFilePath });
      } else if (doesDefaultEnvFileExists) {
        dotenv.config({ path: defaultEnvFilePath });
      }
    } else if (doesStageEnvFileExists || doesDefaultEnvFileExists) {
      this.serverless._logDeprecation(
        'LOAD_VARIABLES_FROM_ENV_FILES',
        'Framework now supports loading environment variables from .env and .env.{stage} files ' +
          'and with v3.0 it will load them by default. To turn off this message, set useDotenv to true (to load variables)' +
          'or remove .env files.'
      );
    }
  }
}

module.exports = EnvLoader;
