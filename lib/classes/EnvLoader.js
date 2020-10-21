'use strict';

const dotenv = require('dotenv');
const fileExists = require('../utils/fs/fileExists');
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
      this.serverless.processedInput.options.s ||
      _.get(serverlessConfigFile, 'provider.stage', 'dev');

    const defaultEnvFilePath = path.join(process.cwd(), '.env');
    const stageEnvFilePath = path.join(process.cwd(), `.env.${stage}`);

    if (serverlessConfigFile.useDotenv) {
      dotenv.config({ path: defaultEnvFilePath });
      dotenv.config({ path: stageEnvFilePath });
    } else {
      const [doesStageEnvFileExists, doesDefaultEnvFileExists] = await Promise.all([
        fileExists(stageEnvFilePath),
        fileExists(defaultEnvFilePath),
      ]);

      if (doesStageEnvFileExists || doesDefaultEnvFileExists) {
        this.serverless._logDeprecation(
          'LOAD_VARIABLES_FROM_ENV_FILES',
          'Detected ".env" files. Note that Framework now supports loading variables from those files ' +
            'when "useDotenv: true" is set (and that will be the default from next major release)'
        );
      }
    }
  }
}

module.exports = EnvLoader;
