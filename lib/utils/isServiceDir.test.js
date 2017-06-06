'use strict';

const path = require('path');
const expect = require('chai').expect;
const testUtils = require('../../tests/utils');
const writeFileSync = require('./fs/writeFileSync');
const isServiceDir = require('./isServiceDir');

describe('#isServiceDir()', () => {
  let tmpDirPath;

  beforeEach(() => {
    tmpDirPath = testUtils.getTmpDirPath();
  });

  it('should return false if no serverless file is found in the given directory', () => {
    const randomFilePath = path.join(tmpDirPath, 'not-a-serverless-file');

    writeFileSync(randomFilePath, 'some content');
    const result = isServiceDir(tmpDirPath);

    expect(result).to.equal(false);
  });

  it('should return true if a serverless.yml file is found in the given directory', () => {
    const serverlessFilePath = path.join(tmpDirPath, 'serverless.yml');

    writeFileSync(serverlessFilePath, 'some content');
    const result = isServiceDir(tmpDirPath);

    expect(result).to.equal(true);
  });

  it('should return true if a serverless.yaml file is found in the given directory', () => {
    const serverlessFilePath = path.join(tmpDirPath, 'serverless.yaml');

    writeFileSync(serverlessFilePath, 'some content');
    const result = isServiceDir(tmpDirPath);

    expect(result).to.equal(true);
  });

  it('should return true if a serverless.json file is found in the given directory', () => {
    const serverlessFilePath = path.join(tmpDirPath, 'serverless.json');

    writeFileSync(serverlessFilePath, 'some content');
    const result = isServiceDir(tmpDirPath);

    expect(result).to.equal(true);
  });
});
