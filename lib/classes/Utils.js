'use strict';

const fs = require('fs');
const path = require('path');
const YAML = require('js-yaml');
const BbPromise = require('bluebird');
const fse = BbPromise.promisifyAll(require('fs-extra'));
const _ = require('lodash');
const fetch = require('node-fetch');
const uuid = require('uuid');
const os = require('os');

class Utils {
  constructor(serverless) {
    this.serverless = serverless;
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
    try {
      const stats = fse.lstatSync(filePath);
      return stats.isFile();
    } catch (e) {
      return false;
    }
  }

  writeFileDir(filePath) {
    return fse.mkdirsSync(path.dirname(filePath));
  }

  writeFileSync(filePath, conts) {
    let contents = conts || '';

    fse.mkdirsSync(path.dirname(filePath));

    if (filePath.indexOf('.json') !== -1 && typeof contents !== 'string') {
      contents = JSON.stringify(contents, null, 2);
    }

    const yamlFileExists = (filePath.indexOf('.yaml') !== -1);
    const ymlFileExists = (filePath.indexOf('.yml') !== -1);

    if ((yamlFileExists || ymlFileExists) && typeof contents !== 'string') {
      contents = YAML.dump(contents);
    }

    return fse.writeFileSync(filePath, contents);
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

  readFileSync(filePath) {
    let contents;

    // Read file
    contents = fse.readFileSync(filePath);

    // Auto-parse JSON
    if (filePath.endsWith('.json')) {
      contents = JSON.parse(contents);
    } else if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) {
      contents = YAML.load(contents.toString(), { filename: filePath });
    } else {
      contents = contents.toString().trim();
    }

    return contents;
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
    let filePaths = [];
    const list = fs.readdirSync(dirPath);
    list.forEach((filePathParam) => {
      let filePath = filePathParam;
      filePath = path.join(dirPath, filePath);
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        filePaths = filePaths.concat(this.walkDirSync(filePath));
      } else {
        filePaths.push(filePath);
      }
    });

    return filePaths;
  }

  copyDirContentsSync(srcDir, destDir) {
    const fullFilesPaths = this.walkDirSync(srcDir);

    fullFilesPaths.forEach(fullFilePath => {
      const relativeFilePath = fullFilePath.replace(srcDir, '');
      fse.copySync(fullFilePath, path.join(destDir, relativeFilePath));
    });

    return;
  }

  generateShortId(length) {
    return Math.random().toString(36).substr(2, length);
  }

  findServicePath() {
    let servicePath = null;

    if (this.serverless.utils.fileExistsSync(path.join(process.cwd(), 'serverless.yml'))) {
      servicePath = process.cwd();
    } else if (this.serverless.utils.fileExistsSync(path.join(process.cwd(), 'serverless.yaml'))) {
      servicePath = process.cwd();
    }

    return servicePath;
  }

  logStat(serverless) {
    const log = (data) => {
      const writeKey = 'XXXX'; // TODO: Replace me before release
      const auth = `${writeKey}:`;

      return fetch('https://api.segment.io/v1/track', {
        headers: {
          Authorization: `Basic ${new Buffer(auth).toString('base64')}`,
          'content-type': 'application/json',
        },
        method: 'POST',
        timeout: '1000',
        body: JSON.stringify(data),
      })
        .then((response) => response.json())
        .then(() => BbPromise.resolve())
        .catch(() => BbPromise.resolve());
    };

    return new BbPromise((resolve) => {
      const serverlessDirPath = path.join(os.homedir(), '.serverless');
      const statsEnabledFilePath = path.join(serverlessDirPath, 'stats-enabled');
      const statsDisabledFilePath = path.join(serverlessDirPath, 'stats-disabled');

      if (this.fileExistsSync(statsDisabledFilePath)) {
        return resolve();
      }

      let userId = uuid.v1();

      if (!this.fileExistsSync(statsEnabledFilePath)) {
        this.writeFileSync(statsEnabledFilePath, userId);
      } else {
        userId = this.readFileSync(statsEnabledFilePath).toString();
      }

      // function related information retrieval
      const numberOfFunctions = _.size(serverless.service.functions);

      const memorySizeAndTimeoutPerFunction = [];
      if (numberOfFunctions) {
        _.forEach(serverless.service.functions, (func) => {
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
        _.forEach(serverless.service.functions, (func) => {
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
      if ((serverless.service.resources &&
        serverless.service.resources.Resources &&
        Object.keys(serverless.service.resources.Resources).length)) {
        hasCustomResourcesDefined = true;
      }
      // check if configuration in resources.Outputs is defined
      if ((serverless.service.resources &&
        serverless.service.resources.Outputs &&
        Object.keys(serverless.service.resources.Outputs).length)) {
        hasCustomResourcesDefined = true;
      }

      let hasCustomVariableSyntaxDefined = false;
      const defaultVariableSyntax = '\\${([ :a-zA-Z0-9._,\\-\\/\\(\\)]+?)}';
      // check if the variableSyntax in the defaults section is defined
      if (serverless.service.defaults &&
        serverless.service.defaults.variableSyntax &&
        serverless.service.defaults.variableSyntax !== defaultVariableSyntax) {
        hasCustomVariableSyntaxDefined = true;
      }
      // check if the variableSyntax in the provider section is defined
      if (serverless.service.provider &&
        serverless.service.provider.variableSyntax &&
        serverless.service.provider.variableSyntax !== defaultVariableSyntax) {
        hasCustomVariableSyntaxDefined = true;
      }

      const data = {
        userId,
        event: 'framework_stat',
        properties: {
          version: 1,
          command: {
            name: serverless.processedInput.commands.join(' '),
            isRunInService: (!!serverless.config.servicePath),
          },
          service: {
            numberOfCustomPlugins: _.size(serverless.service.plugins),
            hasCustomResourcesDefined,
            hasVariablesInCustomSectionDefined: (!!serverless.service.custom),
            hasCustomVariableSyntaxDefined,
          },
          provider: {
            name: serverless.service.provider.name,
            runtime: serverless.service.provider.runtime,
            stage: serverless.service.provider.stage,
            region: serverless.service.provider.region,
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
            timestamp: (new Date()).getTime(),
            timezone: (new Date()).toString().match(/([A-Z]+[\+-][0-9]+.*)/)[1],
            operatingSystem: process.platform,
            serverlessVersion: serverless.version,
            nodeJsVersion: process.version,
            isCISystem: process.env.CI || false,
          },
        },
      };

      return resolve(data);
    }).then((data) => {
      // only log the data if it's there
      if (data) log(data);
    });
  }
}

module.exports = Utils;
