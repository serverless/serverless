'use strict';

const path = require('path');
const { expect } = require('chai');
const fs = require('fs').promises;
const fse = require('fs-extra');
const spawn = require('child-process-ext/spawn');
const serverlessExec = require('../serverless-binary');
const { getTmpDirPath, listZipFiles } = require('../utils/fs');

const fixturePaths = {
  regular: path.join(__dirname, 'fixtures/regular'),
  individually: path.join(__dirname, 'fixtures/individually'),
  individuallyFunction: path.join(__dirname, 'fixtures/individually-function'),
};

describe('Integration test - Packaging - Lambda Files', () => {
  let cwd;
  beforeEach(() => {
    cwd = getTmpDirPath();
  });

  it('packages the default aws template correctly in the zip', async () => {
    await fse.copy(fixturePaths.regular, cwd);
    await spawn(serverlessExec, ['package'], { cwd });
    expect(await listZipFiles(path.join(cwd, '.serverless/aws-nodejs.zip'))).to.deep.equal([
      'handler.js',
    ]);
  });

  it('packages the default aws template with an npm dep correctly in the zip', async () => {
    await fse.copy(fixturePaths.regular, cwd);
    await spawn('npm', ['init', '--yes'], { cwd });
    await spawn('npm', ['i', 'lodash'], { cwd });
    await spawn(serverlessExec, ['package'], { cwd });
    const zipfiles = await listZipFiles(path.join(cwd, '.serverless/aws-nodejs.zip'));
    const nodeModules = new Set(
      zipfiles.filter((f) => f.startsWith('node_modules')).map((f) => f.split(path.sep)[1])
    );
    nodeModules.delete('.package-lock.json');
    const nonNodeModulesFiles = zipfiles.filter((f) => !f.startsWith('node_modules'));
    expect(Array.from(nodeModules)).to.deep.equal(['lodash']);
    expect(nonNodeModulesFiles).to.deep.equal(['handler.js', 'package-lock.json', 'package.json']);
  });

  it("doesn't package a dev dependency in the zip", async () => {
    await fse.copy(fixturePaths.regular, cwd);
    await spawn('npm', ['init', '--yes'], { cwd });
    await spawn('npm', ['i', '--save-dev', 'lodash'], { cwd });
    await spawn(serverlessExec, ['package'], { cwd });
    const zipfiles = await listZipFiles(path.join(cwd, '.serverless/aws-nodejs.zip'));
    const nodeModules = new Set(
      zipfiles.filter((f) => f.startsWith('node_modules')).map((f) => f.split(path.sep)[1])
    );
    nodeModules.delete('.package-lock.json');
    const nonNodeModulesFiles = zipfiles.filter((f) => !f.startsWith('node_modules'));
    expect(Array.from(nodeModules)).to.deep.equal([]);
    expect(nonNodeModulesFiles).to.deep.equal(['handler.js', 'package-lock.json', 'package.json']);
  });

  it('ignores package json files per ignore directive in the zip', async () => {
    await fse.copy(fixturePaths.regular, cwd);
    await spawn('npm', ['init', '--yes'], { cwd });
    await fs.appendFile(
      path.resolve(cwd, 'serverless.yml'),
      '\npackage: {patterns: ["!package*.json"]}\n'
    );
    await spawn('npm', ['i', 'lodash'], { cwd });
    await spawn(serverlessExec, ['package'], { cwd });
    const zipfiles = await listZipFiles(path.join(cwd, '.serverless/aws-nodejs.zip'));
    const nodeModules = new Set(
      zipfiles.filter((f) => f.startsWith('node_modules')).map((f) => f.split(path.sep)[1])
    );
    nodeModules.delete('.package-lock.json');
    const nonNodeModulesFiles = zipfiles.filter((f) => !f.startsWith('node_modules'));
    expect(Array.from(nodeModules)).to.deep.equal(['lodash']);
    expect(nonNodeModulesFiles).to.deep.equal(['handler.js']);
  });

  it('handles package individually with patterns correctly', async () => {
    await fse.copy(fixturePaths.individually, cwd);
    await spawn(serverlessExec, ['package'], { cwd });
    expect(await listZipFiles(path.join(cwd, '.serverless/hello.zip'))).to.deep.equal([
      'handler.js',
    ]);
    expect(await listZipFiles(path.join(cwd, '.serverless/hello2.zip'))).to.deep.equal([
      'handler2.js',
    ]);
  });

  it('handles package individually on function level with patterns correctly', async () => {
    await fse.copy(fixturePaths.individuallyFunction, cwd);
    await spawn(serverlessExec, ['package'], { cwd });
    expect(await listZipFiles(path.join(cwd, '.serverless/hello.zip'))).to.deep.equal([
      'handler.js',
    ]);
    expect(await listZipFiles(path.join(cwd, '.serverless/hello2.zip'))).to.deep.equal([
      'handler2.js',
    ]);
  });
});
