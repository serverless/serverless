'use strict';

const chai = require('chai');
const fsp = require('fs').promises;
const path = require('path');
const fse = require('fs-extra');
const { getTmpDirPath } = require('../../../../utils/fs');
const runServerless = require('../../../../utils/run-serverless');

chai.use(require('chai-as-promised'));
const { expect } = require('chai');

const fixturesPath = path.resolve(__dirname, '../../../../fixtures/programmatic');

describe('test/unit/lib/plugins/create/create.test.js', () => {
  it('should generate scaffolding for local template in provided path and rename service', async () => {
    const tmpDir = getTmpDirPath();
    await runServerless({
      noService: true,
      command: 'create',
      options: {
        'template-path': path.join(fixturesPath, 'aws'),
        'path': tmpDir,
        'name': 'new-service-name',
      },
    });
    const dirContent = await fsp.readdir(tmpDir);
    expect(dirContent).to.include('serverless.yml');

    const serverlessYmlfileContent = (
      await fsp.readFile(path.join(tmpDir, 'serverless.yml'))
    ).toString();
    expect(serverlessYmlfileContent).to.include('service: new-service-name');
  });

  it('should error out when trying to create project in already existing directory (other than current working dir)', async () => {
    const tmpDir = getTmpDirPath();
    await fse.ensureDir(tmpDir);
    await expect(
      runServerless({
        noService: true,
        command: 'create',
        options: {
          template: 'aws-nodejs',
          path: tmpDir,
        },
      })
    ).to.eventually.be.rejected.and.have.property('code', 'TARGET_FOLDER_ALREADY_EXISTS');
  });

  it('should error out when trying to create project from nonexistent template', async () => {
    await expect(
      runServerless({
        noService: true,
        command: 'create',
        options: {
          template: 'aws-nodejs-nonexistent',
        },
      })
    ).to.eventually.be.rejected.and.have.property('code', 'NOT_SUPPORTED_TEMPLATE');
  });
});
