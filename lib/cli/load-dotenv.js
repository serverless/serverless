'use strict';

const dotenv = require('dotenv');
const path = require('path');
const ServerlessError = require('../serverless-error');

const isMissingFileError = (error) => error.code === 'ENOENT';

const throwDotenvError = (error, filePath) => {
  const errorMessage = `Failed to load environment variables from "${filePath}": ${error}`;
  throw new ServerlessError(errorMessage, 'DOTENV_LOAD_ERROR');
};

module.exports = (stage) => {
  const defaultEnvFilePath = path.join(process.cwd(), '.env');
  const stageEnvFilePath = path.join(process.cwd(), `.env.${stage}`);

  const { error: stageEnvResultError } = dotenv.config({ path: stageEnvFilePath });

  if (!stageEnvResultError) return;

  if (!isMissingFileError(stageEnvResultError)) {
    throwDotenvError(stageEnvResultError, stageEnvFilePath);
  }

  const { error: defaultEnvResultError } = dotenv.config({ path: defaultEnvFilePath });
  if (defaultEnvResultError && !isMissingFileError(defaultEnvResultError)) {
    throwDotenvError(defaultEnvResultError, defaultEnvFilePath);
  }
};
