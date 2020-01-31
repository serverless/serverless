'use strict';

const path = require('path');
const BbPromise = require('bluebird');
const fse = BbPromise.promisifyAll(require('fs-extra'));
const { memoize } = require('lodash');

const isFixtureConfigured = memoize(fixturePath => {
  let stats;
  try {
    stats = fse.statSync(fixturePath);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  return Boolean(stats.isDirectory());
});

const retrievedFixturesPaths = new Set();

module.exports = {
  map: new Proxy(
    {},
    {
      get: (obj, fixtureName) => {
        const fixturePath = path.join(__dirname, fixtureName);
        if (!isFixtureConfigured(fixturePath)) {
          throw new Error(`No fixture configured at ${fixtureName}`);
        }
        retrievedFixturesPaths.add(fixturePath);
        return fixturePath;
      },
    }
  ),
  cleanup: (options = {}) =>
    Promise.all(
      Array.from(retrievedFixturesPaths, fixturePath => {
        const pathsToRemove = [path.join(fixturePath, '.serverless')];
        if (options.extraPaths) {
          pathsToRemove.push(...options.extraPaths.map(dirname => path.join(fixturePath, dirname)));
        }
        return Promise.all(
          pathsToRemove.map(pathToRemove => fse.removeAsync(pathToRemove))
        ).then(() => retrievedFixturesPaths.delete(fixturePath));
      })
    ),
};
