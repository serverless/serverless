'use strict';

const BbPromise = require('bluebird');
const JsZip = require('jszip');
const path = require('path');
const fs = require('fs');

module.exports = {
  zipDirectory(servicePath, exclude, include, zipFileName) {
    const zip = new JsZip();

    this.serverless.utils.walkDirSync(servicePath).forEach((filePath) => {
      const relativeFilePath = path.relative(servicePath, filePath);

      const shouldBeExcluded =
        exclude.some(value => relativeFilePath.toLowerCase().indexOf(value.toLowerCase()) > -1);

      const shouldBeIncluded =
        include.some(value => relativeFilePath.toLowerCase().indexOf(value.toLowerCase()) > -1);

      if (!shouldBeExcluded || shouldBeIncluded) {
        const permissions = fs.statSync(filePath).mode;
        zip.file(relativeFilePath, fs.readFileSync(filePath), { unixPermissions: permissions });
      }
    });

    const platformName = ['UNIX', 'DOS', 'win32'].indexOf(process.platform) !== -1 ?
      process.platform : 'UNIX';

    return zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      platform: platformName,
    }).then(data => {
      const artifactFilePath = path.join(servicePath,
        '.serverless', zipFileName);
      this.serverless.utils.writeFileSync(artifactFilePath, data);

      return artifactFilePath;
    });
  },
};
