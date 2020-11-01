'use strict';

const os = require('os');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const BbPromise = require('bluebird');
const fse = require('fs-extra');
const _ = require('lodash');
const fileExistsSync = require('../utils/fs/fileExistsSync');
const writeFileSync = require('../utils/fs/writeFileSync');
const copyDirContentsSync = require('../utils/fs/copyDirContentsSync');
const readFileSync = require('../utils/fs/readFileSync');
const readFile = require('../utils/fs/readFile');
const walkDirSync = require('../utils/fs/walkDirSync');
const dirExistsSync = require('../utils/fs/dirExistsSync');
const version = require('../../package.json').version;
const configUtils = require('@serverless/utils/config');

class Utils {
  constructor(serverless) {
    this.serverless = serverless;
  }

  getVersion() {
    return version;
  }

  dirExistsSync(dirPath) {
    return dirExistsSync(dirPath);
  }

  getTmpDirPath() {
    const dirPath = path.join(
      os.tmpdir(),
      'tmpdirs-serverless',
      crypto.randomBytes(8).toString('hex')
    );
    fse.ensureDirSync(dirPath);
    return dirPath;
  }

  fileExistsSync(filePath) {
    return fileExistsSync(filePath);
  }

  writeFileDir(filePath) {
    fse.mkdirsSync(path.dirname(filePath));
  }

  writeFileSync(filePath, contents, cycles) {
    writeFileSync(filePath, contents, cycles);
  }

  writeFile(filePath, contents, cycles) {
    return new BbPromise((resolve, reject) => {
      try {
        this.writeFileSync(filePath, contents, cycles);
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
    return readFile(filePath);
  }

  walkDirSync(dirPath) {
    return walkDirSync(dirPath);
  }

  copyDirContentsSync(srcDir, destDir) {
    return copyDirContentsSync(srcDir, destDir);
  }

  generateShortId(length) {
    return Math.random()
      .toString(36)
      .substr(2, length);
  }

  findServicePath(customPath) {
    let servicePath = null;

    if (customPath) {
      if (fileExistsSync(path.join(process.cwd(), customPath))) {
        servicePath = process.cwd();
      } else {
        throw new Error(`Config file ${customPath} not found`);
      }
    } else if (fileExistsSync(path.join(process.cwd(), 'serverless.yml'))) {
      servicePath = process.cwd();
    } else if (fileExistsSync(path.join(process.cwd(), 'serverless.yaml'))) {
      servicePath = process.cwd();
    } else if (fileExistsSync(path.join(process.cwd(), 'serverless.json'))) {
      servicePath = process.cwd();
    } else if (fileExistsSync(path.join(process.cwd(), 'serverless.js'))) {
      servicePath = process.cwd();
    } else if (fileExistsSync(path.join(process.cwd(), 'serverless.ts'))) {
      servicePath = process.cwd();
    }

    return servicePath;
  }

  getLocalAccessKey() {
    const userConfig = configUtils.getConfig();
    const currentId = userConfig.userId;
    const globalConfig = configUtils.getGlobalConfig();
    const username = _.get(globalConfig, `users[${currentId}].dashboard.username`);
    return (
      _.get(globalConfig, `users[${currentId}].dashboard.accessKey`, false) ||
      _.get(globalConfig, `users[${currentId}].dashboard.accessKeys[${username}]`, false)
    );
  }

  isEventUsed(functions, eventName) {
    return Object.keys(functions).reduce((accum, key) => {
      const events = functions[key].events || [];
      if (events.length) {
        events.forEach(event => {
          if (Object.keys(event)[0] === eventName) {
            accum = true; // eslint-disable-line no-param-reassign
          }
        });
      }
      return accum;
    }, false);
  }
}

module.exports = Utils;
