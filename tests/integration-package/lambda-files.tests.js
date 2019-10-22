'use strict';

const path = require('path');
const { expect } = require('chai');
const fse = require('fs-extra');
const { execSync } = require('../utils/child-process');
const serverlessExec = require('../serverless-binary');
const { getTmpDirPath, listZipFiles } = require('../utils/fs');

const fixturePaths = {
  regular: path.join(__dirname, 'fixtures/regular'),
  individually: path.join(__dirname, 'fixtures/individually'),
  individuallyFunction: path.join(__dirname, 'fixtures/individually-function'),
};

describe('Integration test - Packaging - Lambda Files', function() {
  this.timeout(15000);
  let cwd;
  beforeEach(() => {
    cwd = getTmpDirPath();
  });

  it('packages the default aws template correctly in the zip', () => {
    fse.copySync(fixturePaths.regular, cwd);
    execSync(`${serverlessExec} package`, { cwd });
    return listZipFiles(path.join(cwd, '.serverless/aws-nodejs.zip')).then(zipfiles => {
      expect(zipfiles).to.deep.equal(['handler.js']);
    });
  });

  it('packages the default aws template with an npm dep correctly in the zip', () => {
    fse.copySync(fixturePaths.regular, cwd);
    execSync('npm init --yes', { cwd });
    execSync('npm i lodash', { cwd });
    execSync(`${serverlessExec} package`, { cwd });
    return listZipFiles(path.join(cwd, '.serverless/aws-nodejs.zip')).then(zipfiles => {
      const nodeModules = new Set(
        zipfiles.filter(f => f.startsWith('node_modules')).map(f => f.split(path.sep)[1])
      );
      const nonNodeModulesFiles = zipfiles.filter(f => !f.startsWith('node_modules'));
      expect(nodeModules).to.deep.equal(new Set(['lodash']));
      expect(nonNodeModulesFiles).to.deep.equal([
        'handler.js',
        'package-lock.json',
        'package.json',
      ]);
    });
  });

  it("doesn't package a dev dependency in the zip", () => {
    fse.copySync(fixturePaths.regular, cwd);
    execSync('npm init --yes', { cwd });
    execSync('npm i --save-dev lodash', { cwd });
    execSync(`${serverlessExec} package`, { cwd });
    return listZipFiles(path.join(cwd, '.serverless/aws-nodejs.zip')).then(zipfiles => {
      const nodeModules = new Set(
        zipfiles.filter(f => f.startsWith('node_modules')).map(f => f.split(path.sep)[1])
      );
      const nonNodeModulesFiles = zipfiles.filter(f => !f.startsWith('node_modules'));
      expect(nodeModules).to.deep.equal(new Set([]));
      expect(nonNodeModulesFiles).to.deep.equal([
        'handler.js',
        'package-lock.json',
        'package.json',
      ]);
    });
  });

  it('ignores package json files per ignore directive in the zip', () => {
    fse.copySync(fixturePaths.regular, cwd);
    execSync('npm init --yes', { cwd });
    execSync('echo \'package: {exclude: ["package*.json"]}\' >> serverless.yml', { cwd });
    execSync('npm i lodash', { cwd });
    execSync(`${serverlessExec} package`, { cwd });
    return listZipFiles(path.join(cwd, '.serverless/aws-nodejs.zip')).then(zipfiles => {
      const nodeModules = new Set(
        zipfiles.filter(f => f.startsWith('node_modules')).map(f => f.split(path.sep)[1])
      );
      const nonNodeModulesFiles = zipfiles.filter(f => !f.startsWith('node_modules'));
      expect(nodeModules).to.deep.equal(new Set(['lodash']));
      expect(nonNodeModulesFiles).to.deep.equal(['handler.js']);
    });
  });

  it('handles package individually with include/excludes correctly', () => {
    fse.copySync(fixturePaths.individually, cwd);
    execSync(`${serverlessExec} package`, { cwd });
    return listZipFiles(path.join(cwd, '.serverless/hello.zip'))
      .then(zipfiles => expect(zipfiles).to.deep.equal(['handler.js']))
      .then(() => listZipFiles(path.join(cwd, '.serverless/hello2.zip')))
      .then(zipfiles => expect(zipfiles).to.deep.equal(['handler2.js']));
  });

  it('handles package individually on function level with include/excludes correctly', () => {
    fse.copySync(fixturePaths.individuallyFunction, cwd);
    execSync(`${serverlessExec} package`, { cwd });
    return listZipFiles(path.join(cwd, '.serverless/hello.zip'))
      .then(zipfiles => expect(zipfiles).to.deep.equal(['handler.js']))
      .then(() => listZipFiles(path.join(cwd, '.serverless/hello2.zip')))
      .then(zipfiles => expect(zipfiles).to.deep.equal(['handler2.js']));
  });
});
