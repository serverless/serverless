'use strict';

const { basename, join } = require('path');
const BbPromise = require('bluebird');
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

module.exports = async (templateName, destPath, options = {}) =>
  new BbPromise((resolve, reject) => {
    if (!options) options = {};
    const templateSrcDir = join(serverlessPath, 'lib/plugins/create/templates', templateName);

    readFile(join(destPath, 'package.json'), 'utf8', (readFileError, content) => {
      if (readFileError) {
        if (readFileError.code !== 'ENOENT') {
          reject(readFileError);
          return;
        }
      } else if (!options.name) {
        const packageName = (() => {
          try {
            return JSON.parse(content).name;
          } catch (error) {
            return null;
          }
        })();
        if (packageName) options.name = packageName;
      }
      copy(templateSrcDir, destPath, (copyError) => {
        if (copyError) {
          reject(copyError);
          return;
        }
        resolve(
          BbPromise.try(() => renameService(options.name || resolveServiceName(destPath), destPath))
        );
      });
    });
  });
