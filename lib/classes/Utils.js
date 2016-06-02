'use strict';

const fs = require('fs');
const path = require('path');
const YAML = require('js-yaml');
const BbPromise = require('bluebird');
const fse = BbPromise.promisifyAll(require('fs-extra'));

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

  convertRegionName(name) {
    if (name.includes('aws_useast1')) return 'us-east-1';
    if (name.includes('aws_uswest2')) return 'us-west-2';
    if (name.includes('aws_euwest1')) return 'eu-west-1';
    if (name.includes('aws_eucentral1')) return 'eu-central-1';
    if (name.includes('aws_apnortheast1')) return 'ap-northeast-1';

    if (name.includes('us-east-1')) return 'aws_useast1';
    if (name.includes('us-west-2')) return 'aws_uswest2';
    if (name.includes('eu-west-1')) return 'aws_euwest1';
    if (name.includes('eu-central-1')) return 'aws_eucentral1';
    if (name.includes('ap-northeast-1')) return 'aws_apnortheast1';

    return false;
  }
}

module.exports = Utils;
