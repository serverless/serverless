'use strict';

const fs = require('fs');
const path = require('path');
const ci = require('ci-info');
const BbPromise = require('bluebird');
const fse = BbPromise.promisifyAll(require('fs-extra'));
const _ = require('lodash');
const fileExistsSync = require('../utils/fs/fileExistsSync');
const writeFileSync = require('../utils/fs/writeFileSync');
const readFileSync = require('../utils/fs/readFileSync');
const walkDirSync = require('../utils/fs/walkDirSync');
const isDockerContainer = require('../utils/isDockerContainer');
const version = require('../../package.json').version;
const segment = require('../utils/segment');
const configUtils = require('../utils/config');

class Utils {
  constructor(serverless) {
    this.serverless = serverless;
  }

  getVersion() {
    return version;
  }

  dirExistsSync(dirPath) {
    try {
      const stats = fse.statSync(dirPath);
      return stats.isDirectory();
    } catch (e) {
      return false;
    }
  }

  fileExistsSync(filePath) {
    return fileExistsSync(filePath);
  }

  writeFileDir(filePath) {
    return fse.mkdirsSync(path.dirname(filePath));
  }

  writeFileSync(filePath, contents) {
    return writeFileSync(filePath, contents);
  }

  writeFile(filePath, contents) {
    const that = this;
    return new BbPromise((resolve, reject) => {
      try {
        that.writeFileSync(filePath, contents);
      } catch (e) {
        reject(e);
      }
      resolve();
    });
  }

  appendFileSync(filePath, conts) {
    const contents = conts || '';

    return new BbPromise((resolve, reject) => {
      try {
        fs.appendFileSync(filePath, contents);
      } catch (e) {
        reject(e);
      }
      resolve();
    });
  }

  readFileSync(filePath) {
    return readFileSync(filePath);
  }

  readFile(filePath) {
    const that = this;
    let contents;
    return new BbPromise((resolve, reject) => {
      try {
        contents = that.readFileSync(filePath);
      } catch (e) {
        reject(e);
      }
      resolve(contents);
    });
  }

  walkDirSync(dirPath) {
    return walkDirSync(dirPath);
  }

  copyDirContentsSync(srcDir, destDir) {
    const fullFilesPaths = this.walkDirSync(srcDir);

    fullFilesPaths.forEach(fullFilePath => {
      const relativeFilePath = fullFilePath.replace(srcDir, '');
      fse.copySync(fullFilePath, path.join(destDir, relativeFilePath));
    });
  }

  generateShortId(length) {
    return Math.random().toString(36).substr(2, length);
  }

  findServicePath() {
    let servicePath = null;

    if (fileExistsSync(path.join(process.cwd(), 'serverless.yml'))) {
      servicePath = process.cwd();
    } else if (fileExistsSync(path.join(process.cwd(), 'serverless.yaml'))) {
      servicePath = process.cwd();
    } else if (fileExistsSync(path.join(process.cwd(), 'serverless.json'))) {
      servicePath = process.cwd();
    }

    return servicePath;
  }

  logStat(serverless, context) {
    // the context in which serverless was executed (e.g. "install", "usage", "uninstall", ...)
    context = context || 'usage'; //eslint-disable-line

    // Service values
    const service = serverless.service;
    const resources = service.resources;
    const provider = service.provider;
    const functions = service.functions;

    // CLI inputs
    const options = serverless.processedInput.options;
    const commands = serverless.processedInput.commands;

    return new BbPromise((resolve) => {
      const config = configUtils.getConfig();
      const userId = config.frameworkId;
      const trackingDisabled = config.trackingDisabled;

      if (trackingDisabled) {
        return resolve();
      }

      // filter out the whitelisted options
      const whitelistedOptionKeys = ['help', 'disable', 'enable'];
      const optionKeys = Object.keys(options);

      const filteredOptionKeys = optionKeys.filter((key) =>
        whitelistedOptionKeys.indexOf(key) !== -1
      );

      const filteredOptions = {};
      filteredOptionKeys.forEach((key) => {
        filteredOptions[key] = options[key];
      });

      // function related information retrieval
      const numberOfFunctions = _.size(functions);

      const memorySizeAndTimeoutPerFunction = [];
      if (numberOfFunctions) {
        _.forEach(functions, (func) => {
          const memorySize = Number(func.memorySize)
            || Number(this.serverless.service.provider.memorySize)
            || 1024;
          const timeout = Number(func.timeout)
            || Number(this.serverless.service.provider.timeout)
            || 6;

          const memorySizeAndTimeoutObject = {
            memorySize,
            timeout,
          };

          memorySizeAndTimeoutPerFunction.push(memorySizeAndTimeoutObject);
        });
      }

      // event related information retrieval
      const numberOfEventsPerType = [];
      const eventNamesPerFunction = [];
      if (numberOfFunctions) {
        _.forEach(functions, (func) => {
          if (func.events) {
            const funcEventsArray = [];

            func.events.forEach((event) => {
              const name = Object.keys(event)[0];
              funcEventsArray.push(name);

              const alreadyPresentEvent = _.find(numberOfEventsPerType, { name });
              if (alreadyPresentEvent) {
                alreadyPresentEvent.count++;
              } else {
                numberOfEventsPerType.push({
                  name,
                  count: 1,
                });
              }
            });

            eventNamesPerFunction.push(funcEventsArray);
          }
        });
      }

      let hasCustomResourcesDefined = false;
      // check if configuration in resources.Resources is defined
      if ((resources && resources.Resources && Object.keys(resources.Resources).length)) {
        hasCustomResourcesDefined = true;
      }
      // check if configuration in resources.Outputs is defined
      if ((resources && resources.Outputs && Object.keys(resources.Outputs).length)) {
        hasCustomResourcesDefined = true;
      }

      let hasCustomVariableSyntaxDefined = false;
      const defaultVariableSyntax = '\\${([ :a-zA-Z0-9._,\\-\\/\\(\\)]+?)}';

      // check if the variableSyntax in the provider section is defined
      if (provider && provider.variableSyntax
        && provider.variableSyntax !== defaultVariableSyntax) {
        hasCustomVariableSyntaxDefined = true;
      }

      const data = {
        userId,
        event: 'framework_stat',
        properties: {
          version: 2,
          command: {
            name: commands.join(' '),
            filteredOptions,
            isRunInService: (!!serverless.config.servicePath),
          },
          service: {
            numberOfCustomPlugins: _.size(service.plugins),
            hasCustomResourcesDefined,
            hasVariablesInCustomSectionDefined: (!!service.custom),
            hasCustomVariableSyntaxDefined,
          },
          provider: {
            name: provider.name,
            runtime: provider.runtime,
            stage: provider.stage,
            region: provider.region,
          },
          functions: {
            numberOfFunctions,
            memorySizeAndTimeoutPerFunction,
          },
          events: {
            numberOfEvents: numberOfEventsPerType.length,
            numberOfEventsPerType,
            eventNamesPerFunction,
          },
          general: {
            userId,
            context,
            timestamp: (new Date()).getTime(),
            timezone: (new Date()).toString().match(/([A-Z]+[+-][0-9]+)/)[1],
            operatingSystem: process.platform,
            userAgent: (process.env.SERVERLESS_DASHBOARD) ? 'dashboard' : 'cli',
            serverlessVersion: serverless.version,
            nodeJsVersion: process.version,
            isDockerContainer: isDockerContainer(),
            isCISystem: ci.isCI,
            ciSystem: ci.name,
          },
        },
      };

      if (config.userId && data.properties && data.properties.general) {
        // add platformId to segment call
        data.properties.general.platformId = config.userId;
      }

      return resolve(data);
    }).then((data) => {
      if (data) {
        segment.track(data);
      }
    });
  }
}

module.exports = Utils;
