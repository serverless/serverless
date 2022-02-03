'use strict';

const path = require('path');
const fsp = require('fs').promises;
const fse = require('fs-extra');
const spawn = require('child-process-ext/spawn');
const { getTmpDirPath } = require('../utils/fs');
const { expect } = require('chai');

const serverlessExec = require('../serverless-binary');

describe('test/integration/create.test.js', function () {
  this.timeout(1000 * 60 * 2);

  it('should generate scaffolding for "aws-nodejs" template in provided path and rename service', async () => {
    const tmpDir = getTmpDirPath();
    await spawn(serverlessExec, [
      'create',
      '--template',
      'aws-nodejs',
      '--path',
      tmpDir,
      '--name',
      'new-service-name',
    ]);
    const dirContent = await fsp.readdir(tmpDir);
    expect(dirContent).to.include('handler.js');
    expect(dirContent).to.include('serverless.yml');
    expect(dirContent).to.include('.gitignore');

    const serverlessYmlfileContent = (
      await fsp.readFile(path.join(tmpDir, 'serverless.yml'))
    ).toString();
    expect(serverlessYmlfileContent).to.include('service: new-service-name');
  });

  it('should generate scaffolding for "aws-nodejs" template in current directory', async () => {
    const tmpDir = getTmpDirPath();
    await fse.ensureDir(tmpDir);
    await spawn(serverlessExec, ['create', '--template', 'aws-nodejs'], {
      cwd: tmpDir,
    });
    const dirContent = await fsp.readdir(tmpDir);
    expect(dirContent).to.include('handler.js');
    expect(dirContent).to.include('serverless.yml');
    expect(dirContent).to.include('.gitignore');

    const serverlessYmlfileContent = (
      await fsp.readFile(path.join(tmpDir, 'serverless.yml'))
    ).toString();
    // We are checking that it includes basename of dir as it will be included in service name
    expect(serverlessYmlfileContent).to.include(path.basename(tmpDir));
  });

  it('should generate scaffolding for "plugin" template', async () => {
    const tmpDir = getTmpDirPath();
    await fse.ensureDir(tmpDir);
    await spawn(serverlessExec, ['create', '--template', 'plugin'], {
      cwd: tmpDir,
    });
    const dirContent = await fsp.readdir(tmpDir);
    expect(dirContent).to.include('index.js');
    expect(dirContent).to.include('README.md');
    expect(dirContent).to.include('package.json');
  });

  it('should error out when trying to create project in current working dir and the project files are already present in it', async () => {
    const tmpDir = getTmpDirPath();
    await fse.ensureDir(tmpDir);
    await fsp.writeFile(path.join(tmpDir, 'handler.js'), '');
    let err;
    try {
      await spawn(serverlessExec, ['create', '--template', 'aws-nodejs'], {
        cwd: tmpDir,
      });
    } catch (e) {
      err = e;
    }
    expect(err.stdoutBuffer.toString()).to.contain('Move it and try again');
  });
});
