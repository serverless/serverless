'use strict';

const copyDirContentsSync = require('./fs/copyDirContentsSync');
const untildify = require('untildify');
const { renameService } = require('./renameService');

const ServerlessError = require('../serverless-error');

module.exports = ({ templatePath, projectDir, projectName }) => {
  const sourcePath = untildify(templatePath);

  try {
    copyDirContentsSync(sourcePath, projectDir, { noLinks: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new ServerlessError(
        `Could not find a template under provider path: ${sourcePath}`,
        'INVALID_TEMPLATE_PATH'
      );
    }
    throw err;
  }

  if (projectName) {
    renameService(projectName, projectDir);
  }
};
