'use strict';

const path = require('path');
const BbPromise = require('bluebird');
const fse = require('fs-extra');
const getTmpDirPath = require('../../../utils/fs/getTmpDirPath');
const createZipFile = require('../../../utils/fs/createZipFile');
const getEnsureArtifact = require('../../../utils/getEnsureArtifact');

const srcDirPath = path.join(__dirname, 'resources');

const artifactName = 'custom-resources.zip';

const ensureCustomResourcesArtifact = getEnsureArtifact(artifactName, cachePath =>
  BbPromise.try(() => {
    const tmpDirPath = getTmpDirPath();
    const tmpInstalledLambdaPath = path.resolve(tmpDirPath, 'resource-lambda');
    const tmpZipFilePath = path.resolve(tmpDirPath, 'resource-lambda.zip');
    const cachedZipFilePath = path.resolve(cachePath, artifactName);
    return fse
      .copy(srcDirPath, tmpInstalledLambdaPath)
      .then(() => createZipFile(tmpInstalledLambdaPath, tmpZipFilePath))
      .then(() => fse.move(tmpZipFilePath, cachedZipFilePath));
  })
);

module.exports = () =>
  ensureCustomResourcesArtifact().then(cachePath => path.resolve(cachePath, artifactName));
