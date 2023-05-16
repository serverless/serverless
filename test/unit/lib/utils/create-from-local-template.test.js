'use strict';

const path = require('path');
const chai = require('chai');
const fsp = require('fs').promises;
const { load: yamlParse } = require('js-yaml');
const createFromLocalTemplate = require('../../../../lib/utils/create-from-local-template');
const { getTmpDirPath } = require('../../../utils/fs');

const fixturesPath = path.resolve(__dirname, '../../../fixtures/programmatic');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('test/unit/lib/utils/create-from-local-template.test.js', () => {
  describe('Without `projectName` provided', () => {
    it('should create from template referenced locally', async () => {
      const tmpDirPath = path.join(getTmpDirPath(), 'some-service');
      await createFromLocalTemplate({
        templatePath: path.join(fixturesPath, 'function'),
        projectDir: tmpDirPath,
      });
      const stats = await fsp.lstat(path.join(tmpDirPath, 'serverless.yml'));
      expect(stats.isFile()).to.be.true;
    });
  });

  describe('When `templatePath` does not exist', () => {
    it('should result in an error', async () => {
      const tmpDirPath = path.join(getTmpDirPath(), 'some-service');
      await expect(
        createFromLocalTemplate({
          templatePath: path.join(fixturesPath, 'nonexistent'),
          projectDir: tmpDirPath,
        })
      ).to.eventually.be.rejected.and.have.property('code', 'INVALID_TEMPLATE_PATH');
    });
  });

  describe('With `projectName` provided', () => {
    let tmpDirPath;

    before(async () => {
      tmpDirPath = path.join(getTmpDirPath(), 'some-service');
      await createFromLocalTemplate({
        templatePath: path.join(fixturesPath, 'function-msk'),
        projectDir: tmpDirPath,
        projectName: 'testproj',
      });
    });

    it('should set service name in serverless.yml', async () =>
      expect(
        yamlParse(await fsp.readFile(path.join(tmpDirPath, 'serverless.yml'))).service
      ).to.equal('testproj'));

    it('should set name in package.json', async () =>
      expect(JSON.parse(await fsp.readFile(path.join(tmpDirPath, 'package.json'))).name).to.equal(
        'testproj'
      ));
  });
});
