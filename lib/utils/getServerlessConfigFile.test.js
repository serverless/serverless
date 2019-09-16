'use strict';

const path = require('path');
const chai = require('chai');
const writeFileSync = require('./fs/writeFileSync');
const serverlessConfigFileUtils = require('./getServerlessConfigFile');
const { getTmpDirPath } = require('../../tests/utils/fs');

const getServerlessConfigFile = serverlessConfigFileUtils.getServerlessConfigFile;

chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('#getServerlessConfigFile()', () => {
  let tmpDirPath;

  beforeEach(() => {
    tmpDirPath = getTmpDirPath();
  });

  it('should return an empty string if no serverless file is found', () => {
    const randomFilePath = path.join(tmpDirPath, 'not-a-serverless-file');

    writeFileSync(randomFilePath, 'some content');
    return expect(
      getServerlessConfigFile({
        processedInput: { options: {} },
        config: { servicePath: tmpDirPath },
      })
    ).to.be.fulfilled.then(result => {
      expect(result).to.equal('');
    });
  });

  it('should return an empty object for empty configuration', () => {
    const serverlessFilePath = path.join(tmpDirPath, 'serverless.yml');

    writeFileSync(serverlessFilePath, '');
    return expect(
      getServerlessConfigFile({
        processedInput: { options: {} },
        config: { servicePath: tmpDirPath },
      })
    ).to.be.fulfilled.then(result => {
      expect(result).to.deep.equal({});
    });
  });

  it('should return the file content if a serverless.yml file is found', () => {
    const serverlessFilePath = path.join(tmpDirPath, 'serverless.yml');

    writeFileSync(serverlessFilePath, 'service: my-yml-service');
    return expect(
      getServerlessConfigFile({
        processedInput: { options: {} },
        config: { servicePath: tmpDirPath },
      })
    ).to.be.fulfilled.then(result => {
      expect(result).to.deep.equal({ service: 'my-yml-service' });
    });
  });

  it('should return the file content if a serverless.yaml file is found', () => {
    const serverlessFilePath = path.join(tmpDirPath, 'serverless.yaml');

    writeFileSync(serverlessFilePath, 'service: my-yaml-service');
    return expect(
      getServerlessConfigFile({
        processedInput: { options: {} },
        config: { servicePath: tmpDirPath },
      })
    ).to.be.fulfilled.then(result => {
      expect(result).to.deep.equal({ service: 'my-yaml-service' });
    });
  });

  it('should return the file content if a foobar.yaml file is specified & found', () => {
    const serverlessFilePath = path.join(tmpDirPath, 'foobar.yaml');

    writeFileSync(serverlessFilePath, 'service: my-yaml-service');
    return expect(
      getServerlessConfigFile({
        processedInput: { options: { config: 'foobar.yaml' } },
        config: { servicePath: tmpDirPath },
      })
    ).to.be.fulfilled.then(result => {
      expect(result).to.deep.equal({ service: 'my-yaml-service' });
    });
  });

  it('should return the file content if a serverless.json file is found', () => {
    const serverlessFilePath = path.join(tmpDirPath, 'serverless.json');

    writeFileSync(serverlessFilePath, '{ "service": "my-json-service" }');
    return expect(
      getServerlessConfigFile({
        processedInput: { options: {} },
        config: { servicePath: tmpDirPath },
      })
    ).to.be.fulfilled.then(result => {
      expect(result).to.deep.equal({ service: 'my-json-service' });
    });
  });

  it('should return the file content if a serverless.js file found', () => {
    const serverlessFilePath = path.join(tmpDirPath, 'serverless.js');
    writeFileSync(serverlessFilePath, 'module.exports = {"service": "my-json-service"};');

    return expect(
      getServerlessConfigFile({
        processedInput: { options: {} },
        config: { servicePath: tmpDirPath },
      })
    ).to.be.fulfilled.then(result => {
      expect(result).to.deep.equal({ service: 'my-json-service' });
    });
  });

  it('should return the resolved value if a promise-using serverless.js file found', () => {
    const serverlessFilePath = path.join(tmpDirPath, 'serverless.js');
    writeFileSync(
      serverlessFilePath,
      'module.exports = new Promise(resolve => { resolve({"service": "my-json-service"}); });'
    );

    return expect(
      getServerlessConfigFile({
        processedInput: { options: {} },
        config: { servicePath: tmpDirPath },
      })
    ).to.be.fulfilled.then(result => {
      expect(result).to.deep.equal({ service: 'my-json-service' });
    });
  });

  it('should throw an error, if serverless.js export not a plain object', () => {
    const serverlessFilePath = path.join(tmpDirPath, 'serverless.js');
    writeFileSync(serverlessFilePath, 'module.exports = function config() {};');

    return expect(
      getServerlessConfigFile({
        processedInput: { options: {} },
        config: { servicePath: tmpDirPath },
      })
    ).to.be.rejectedWith('serverless.js must export plain object');
  });

  it('should look in the current working directory if servicePath is undefined', () => {
    const serverlessFilePath = path.join(tmpDirPath, 'serverless.yml');

    writeFileSync(serverlessFilePath, 'service: my-yml-service');
    const cwd = process.cwd();
    process.chdir(tmpDirPath);
    return expect(
      getServerlessConfigFile({
        processedInput: { options: {} },
        config: {},
      })
    ).to.be.fulfilled.then(
      result => {
        process.chdir(cwd);
        expect(result).to.deep.equal({ service: 'my-yml-service' });
      },
      error => {
        process.chdir(cwd);
        throw error;
      }
    );
  });
});
