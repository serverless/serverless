'use strict';

const path = require('path');
const chai = require('chai');
const { existsSync, outputJsonSync, readFileSync } = require('fs-extra');
const { safeLoad: yamlParse } = require('js-yaml');
const installTemplate = require('./createFromTemplate');
const { getTmpDirPath } = require('../../tests/utils/fs');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('#createFromTemplate()', () => {
  let tmpDirPath;

  describe('Empty folder', () => {
    before(() => {
      tmpDirPath = path.join(getTmpDirPath(), 'some-service');
      return installTemplate('aws-nodejs', tmpDirPath);
    });

    it('should create from template', () =>
      expect(existsSync(path.join(tmpDirPath, 'serverless.yml'))).to.be.true);

    it('should handle .gitignore', () =>
      expect(existsSync(path.join(tmpDirPath, '.gitignore'))).to.be.true);

    it('should set service name in serverless.yml', () =>
      expect(yamlParse(readFileSync(path.join(tmpDirPath, 'serverless.yml'))).service).to.equal(
        'some-service'
      ));
  });

  describe('Existing project', () => {
    before(() => {
      tmpDirPath = path.join(getTmpDirPath(), 'some-service');
      outputJsonSync(path.join(tmpDirPath, 'package.json'), { name: 'foo-bar' });
      return installTemplate('aws-nodejs', tmpDirPath);
    });

    it('should respect package.json name', () =>
      expect(yamlParse(readFileSync(path.join(tmpDirPath, 'serverless.yml'))).service).to.equal(
        'foo-bar'
      ));
  });

  describe('Should override name if specified', () => {
    before(() => {
      tmpDirPath = path.join(getTmpDirPath(), 'some-service');
      outputJsonSync(path.join(tmpDirPath, 'package.json'), { name: 'foo-bar' });
      return installTemplate('aws-nodejs', tmpDirPath, { name: 'miszka' });
    });

    it('should set service name in serverless.yml', () =>
      expect(yamlParse(readFileSync(path.join(tmpDirPath, 'serverless.yml'))).service).to.equal(
        'miszka'
      ));

    it('should set name in package.json', () =>
      expect(JSON.parse(readFileSync(path.join(tmpDirPath, 'package.json'))).name).to.equal(
        'miszka'
      ));
  });
});
