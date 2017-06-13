'use strict';

const path = require('path');
const expect = require('chai').expect;
const testUtils = require('../../tests/utils');
const writeFileSync = require('./fs/writeFileSync');
const getServerlessConfigFile = require('./getServerlessConfigFile');

describe('#getServerlessConfigFile()', () => {
  let tmpDirPath;

  beforeEach(() => {
    tmpDirPath = testUtils.getTmpDirPath();
  });

  it('should return an empty string if no serverless file is found', () => {
    const randomFilePath = path.join(tmpDirPath, 'not-a-serverless-file');

    writeFileSync(randomFilePath, 'some content');
    return expect(getServerlessConfigFile(tmpDirPath)).to.be.fulfilled.then((result) => {
      expect(result).to.equal('');
    });
  });

  it('should return the file content if a serverless.yml file is found', () => {
    const serverlessFilePath = path.join(tmpDirPath, 'serverless.yml');

    writeFileSync(serverlessFilePath, 'service: my-yml-service');
    return expect(getServerlessConfigFile(tmpDirPath)).to.be.fulfilled.then((result) => {
      expect(result).to.deep.equal({ service: 'my-yml-service' });
    });
  });

  it('should return the file content if a serverless.yaml file is found', () => {
    const serverlessFilePath = path.join(tmpDirPath, 'serverless.yaml');

    writeFileSync(serverlessFilePath, 'service: my-yaml-service');
    return expect(getServerlessConfigFile(tmpDirPath)).to.be.fulfilled.then((result) => {
      expect(result).to.deep.equal({ service: 'my-yaml-service' });
    });
  });

  it('should return the file content if a serverless.json file is found', () => {
    const serverlessFilePath = path.join(tmpDirPath, 'serverless.json');

    writeFileSync(serverlessFilePath, '{ "service": "my-json-service" }');
    return expect(getServerlessConfigFile(tmpDirPath)).to.be.fulfilled.then((result) => {
      expect(result).to.deep.equal({ service: 'my-json-service' });
    });
  });
});
