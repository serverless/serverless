'use strict';

const expect = require('chai').expect;
const path = require('path');
const os = require('os');
const fse = require('fs-extra');
const Create = require('../create');
const Serverless = require('../../../Serverless');

describe('Create', () => {
  let create;

  before(() => {
    const serverless = new Serverless();
    const options = {};
    create = new Create(serverless, options);
    create.serverless.cli = new serverless.classes.CLI();
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(create.commands).to.be.not.empty);

    it('should have hooks', () => expect(create.hooks).to.be.not.empty);
  });

  describe('#create()', () => {
    it('should throw error if user passed unsupported template', () => {
      create.options.template = 'invalid-template';
      expect(() => create.create()).to.throw(Error);
    });

    it('should set servicePath based on cwd', () => {
      const tmpDir = path.join(os.tmpdir(), (new Date).getTime().toString());
      const cwd = process.cwd();
      fse.mkdirsSync(tmpDir);
      process.chdir(tmpDir);
      create.options.template = 'aws-nodejs';
      return create.create().then(() => {
        expect(create.serverless.config.servicePath).to.be.equal(process.cwd());
        process.chdir(cwd);
      });
    });

    it('should generate scaffolding for aws-nodejs template', () => {
      const tmpDir = path.join(os.tmpdir(), (new Date).getTime().toString());
      const cwd = process.cwd();
      fse.mkdirsSync(tmpDir);
      process.chdir(tmpDir);
      create.options.template = 'aws-nodejs';

      return create.create().then(() => {
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'serverless.yaml')))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'serverless.env.yaml')))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'handler.js')))
          .to.be.equal(true);

        process.chdir(cwd);
      });
    });
  });
});
