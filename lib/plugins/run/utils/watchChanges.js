'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const fs = require('fs');
const paperwork = require('precinct').paperwork;
const path = require('path');
const watch = require('node-watch');

const deployFunctionToLocalEmulator = require('./deployFunctionToLocalEmulator');
const getLocalEmulatorFunctionConfig = require('./getLocalEmulatorFunctionConfig');
const logServerless = require('./logServerless');

function getDependencies(filename) {
  let deps = [filename];

  paperwork(filename, { includeCore: false }).forEach(dep => {
    const extname = path.extname(dep) || '.js';
    const filePath = path.resolve(path.dirname(filename), dep + extname);

    if (fs.existsSync(filePath)) {
      const deepDeps = getDependencies(path.resolve(filePath));
      deps = _.concat(deps, deepDeps);
    }
  });

  return deps;
}

function watchChanges(service, servicePath, localEmulatorRootUrl) {
  logServerless('Setting up file watcher...');

  _.each(service.functions, (functionConfig, functionName) => {
    const handlerName = path.extname(functionConfig.handler);
    const handlerFile = path.basename(functionConfig.handler, handlerName);
    const handlerPath = path.dirname(functionConfig.handler);

    const deps = getDependencies(path.join(servicePath, `${handlerPath}.js`, handlerFile));

    watch(
      deps,
      {
        recursive: false,
        filter: file => !/node_modules/.test(file),
      },
      (event, filename) => {
        const fileLocation = filename.replace(`${servicePath}/`, '');

        // eslint-disable-next-line max-len
        logServerless(`Function '${service.service}-${functionName}' update triggered by change on file ${fileLocation}`);

        const localEmulatorFunctionConfig = getLocalEmulatorFunctionConfig(
          functionConfig,
          service.provider,
          servicePath);

        deployFunctionToLocalEmulator(
          `${service.service}-${functionName}`,
          localEmulatorFunctionConfig,
          localEmulatorRootUrl);
      }
    );
  });

  return BbPromise.resolve();
}

module.exports = watchChanges;
