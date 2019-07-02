'use strict';

const path = require('path');
const chai = require('chai');
const { existsSync } = require('fs-extra');
const installTemplate = require('./createFromTemplate');
const { getTmpDirPath } = require('../../tests/utils/fs');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('#createFromTemplate()', () => {
  let tmpDirPath;

  beforeEach(() => {
    tmpDirPath = getTmpDirPath();
    return installTemplate('aws-nodejs', tmpDirPath);
  });

  it('should create from template', () =>
    expect(existsSync(path.join(tmpDirPath, 'serverless.yml'))).to.be.true);

  it('should handle .gitignore', () =>
    expect(existsSync(path.join(tmpDirPath, '.gitignore'))).to.be.true);
});
