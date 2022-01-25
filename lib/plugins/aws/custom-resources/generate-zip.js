'use strict';

const path = require('path');
const fse = require('fs-extra');
const getTmpDirPath = require('../../../utils/fs/get-tmp-dir-path');
const createZipFile = require('../../../utils/fs/create-zip-file');
const ensureArtifact = require('../../../utils/ensure-artifact');
const safeMoveFile = require('../../../utils/fs/safe-move-file');

const srcDirPath = path.join(__dirname, 'resources');

const artifactName = 'custom-resources.zip';

module.exports = async () => {
  const resultPath = await ensureArtifact(artifactName, async (cachePath) => {
    const tmpDirPath = getTmpDirPath();
    const tmpInstalledLambdaPath = path.resolve(tmpDirPath, 'resource-lambda');
    const tmpZipFilePath = path.resolve(tmpDirPath, 'resource-lambda.zip');
    const cachedZipFilePath = path.resolve(cachePath, artifactName);
    await fse.copy(srcDirPath, tmpInstalledLambdaPath);
    await createZipFile(tmpInstalledLambdaPath, tmpZipFilePath);
    await safeMoveFile(tmpZipFilePath, cachedZipFilePath);
  });
  return path.resolve(resultPath, artifactName);
};
