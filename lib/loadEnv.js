'use strict';

const dotenv = require('dotenv');
const path = require('path');
const ServerlessError = require('./classes/Error').ServerlessError;

const isMissingFileError = error => error.code === 'ENOENT';

const throwDotenvError = (error, filePath) => {
  const errorMessage = [
    `Encountered: "${error}" while trying to load environment variables`,
    ` from filepath: ${filePath}.`,
  ].join('');
  throw new ServerlessError(errorMessage);
};

module.exports = async stage => {
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
