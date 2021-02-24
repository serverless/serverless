'use strict';

const { basename, join } = require('path');
const { copy, readFile } = require('fs-extra');
const { renameService } = require('./renameService');

const serverlessPath = join(__dirname, '../../');

const resolveServiceName = (path) => {
  let serviceName = basename(path)
    .toLowerCase()
    .replace(/[^0-9a-z.]+/g, '-');
  if (!serviceName.match(/^[a-z]/)) serviceName = `service-${serviceName}`;
  return serviceName;
};

module.exports = async (templateName, destPath, options = {}) => {
  if (!options) options = {};
  const templateSrcDir = join(serverlessPath, 'lib/plugins/create/templates', templateName);

  if (!options.name) {
    let content;
    try {
      content = await readFile(join(destPath, 'package.json'), 'utf8');
    } catch (readFileError) {
      if (readFileError.code !== 'ENOENT') {
        throw readFileError;
      }
    }

    try {
      options.name = JSON.parse(content).name;
    } catch {
      // Leave name empty if parsing failed
    }
  }

  await copy(templateSrcDir, destPath);
  return renameService(options.name || resolveServiceName(destPath), destPath);
};
