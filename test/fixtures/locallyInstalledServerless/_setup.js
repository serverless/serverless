'use strict';

const path = require('path');
const fse = require('fs-extra');

const fixturePath = path.resolve(__dirname, 'node_modules/serverless');
const fixtureModulePath = path.resolve(fixturePath, 'index.js');

module.exports = () =>
  fse
    .copy(path.resolve(__dirname, 'node_modules-fixture/serverless'), fixturePath)
    .then(() => fse.readFile(fixtureModulePath))
    .then(content =>
      fse.writeFile(
        fixtureModulePath,
        String(content).replace(
          '$SERVERLESS_PATH',
          JSON.stringify(path.resolve(__dirname, '../../../'))
        )
      )
    )
    .then(() => ({ pathsToRemove: [fixturePath] }));
