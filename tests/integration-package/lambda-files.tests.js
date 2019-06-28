'use strict';

const path = require('path');
const fse = require('fs-extra');
const { execSync } = require('../utils/child-process');
const { serverlessExec } = require('../utils/misc');
const { getTmpDirPath, listZipFiles } = require('../utils/fs');

const fixturePaths = {
  regular: path.join(__dirname, 'fixtures/regular'),
  individually: path.join(__dirname, 'fixtures/individually'),
};

describe('Integration test - Packaging', () => {
  let cwd;
  beforeEach(() => {
    cwd = getTmpDirPath();
  });

  it('packages the default aws template correctly in the zip', () => {
    fse.copySync(fixturePaths.regular, cwd);
    execSync(`${serverlessExec} package`, { cwd });
    return listZipFiles(path.join(cwd, '.serverless/aws-nodejs.zip')).then(zipfiles => {
      expect(zipfiles).toEqual(['handler.js']);
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
      expect(nodeModules).toEqual(new Set(['lodash']));
      expect(nonNodeModulesFiles).toEqual(['handler.js', 'package-lock.json', 'package.json']);
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
      expect(nodeModules).toEqual(new Set([]));
      expect(nonNodeModulesFiles).toEqual(['handler.js', 'package-lock.json', 'package.json']);
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
      expect(nodeModules).toEqual(new Set(['lodash']));
      expect(nonNodeModulesFiles).toEqual(['handler.js']);
    });
  });

  it('handles package individually with include/excludes correctly', () => {
    fse.copySync(fixturePaths.individually, cwd);
    execSync(`${serverlessExec} package`, { cwd });
    return listZipFiles(path.join(cwd, '.serverless/hello.zip'))
      .then(zipfiles => expect(zipfiles).toEqual(['handler.js']))
      .then(() => listZipFiles(path.join(cwd, '.serverless/hello2.zip')))
      .then(zipfiles => expect(zipfiles).toEqual(['handler2.js']));
  });
});
