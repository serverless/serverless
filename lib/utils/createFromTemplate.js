'use strict';

const { join } = require('path');
const BbPromise = require('bluebird');
const { copy, exists, rename } = require('fs-extra');

const serverlessPath = join(__dirname, '../../');

module.exports = (templateName, destPath) =>
  new BbPromise((resolve, reject) => {
    const templateSrcDir = join(serverlessPath, 'lib/plugins/create/templates', templateName);

    copy(templateSrcDir, destPath, copyError => {
      if (copyError) {
        reject(copyError);
        return;
      }
      const gitignorePath = join(destPath, 'gitignore');
      exists(gitignorePath, hasGitignore => {
        if (!hasGitignore) {
          resolve();
          return;
        }
        rename(gitignorePath, join(destPath, '.gitignore'), renameError => {
          if (renameError) reject(renameError);
          else resolve();
        });
      });
    });
  });
