'use strict';

const fs = require('fs');
const path = require('path');
const YAML = require('js-yaml');
const BbPromise = require('bluebird');
const fse = BbPromise.promisifyAll(require('fs-extra'));
const _ = require('lodash');
const fetch = require('node-fetch');

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

  writeFileSync(filePath, conts) {
    let contents = conts || '';

    fse.mkdirsSync(path.dirname(filePath));

    if (filePath.indexOf('.json') !== -1 && typeof contents !== 'string') {
      contents = JSON.stringify(contents, null, 2);
    }

    if (filePath.indexOf('.yaml') !== -1 && typeof contents !== 'string') {
      contents = YAML.dump(contents, { indent: 4 });
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
    if (filePath.endsWith('.json')) contents = JSON.parse(contents);

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
    const that = this;

    // Helper function
    const isServiceDir = (dir) => {
      // TODO: add support for serverless.yml
      const yamlName = 'serverless.yaml';
      const yamlFilePath = path.join(dir, yamlName);

      return that.fileExistsSync(yamlFilePath);
    };

    // Check up to 10 parent levels
    let previous = '.';
    let servicePath = null;
    let i = 10;

    while (i >= 0) {
      const fullPath = path.resolve(process.cwd(), previous);

      if (isServiceDir(fullPath)) {
        servicePath = fullPath;
        break;
      }

      previous = path.join(previous, '..');
      i--;
    }

    return servicePath;
  }

  track(serverless) {
    const writeKey = 'XXXXXX'; // TODO: Replace me before release

    const loadedPlugins = serverless.pluginManager.plugins.map((plugin) => plugin.constructor.name);

    const auth = `${writeKey}:`;

    const data = {
      userId: 'anonymousUser',
      event: 'Serverless framework usage',
      properties: {
        options: serverless.processedInput.options,
        commands: serverless.processedInput.commands,
        operatingSystem: process.platform,
        loadedPlugins,
        serverlessVersion: serverless.version,
        functionsCount: _.size(serverless.service.functions),
        provider: serverless.service.provider,
        isRunInsideService: (!!serverless.config.servicePath),
      },
    };

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
  }
}

module.exports = Utils;
