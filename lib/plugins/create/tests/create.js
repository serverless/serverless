'use strict';

const expect = require('chai').expect;
const path = require('path');
const fse = require('fs-extra');
const BbPromise = require('bluebird');
const Create = require('../create');
const Serverless = require('../../../Serverless');
const sinon = require('sinon');
const testUtils = require('../../../../tests/utils');

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

    it('should run promise chain in order for "create:create" hook', () => {
      const createStub = sinon
        .stub(create, 'create').returns(BbPromise.resolve());

      return create.hooks['create:create']().then(() => {
        expect(createStub.calledOnce).to.be.equal(true);

        create.create.restore();
      });
    });
  });

  describe('#create()', () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = testUtils.getTmpDirPath();
    });

    it('should throw error if user passed unsupported template', () => {
      create.options.template = 'invalid-template';
      expect(() => create.create()).to.throw(Error);
    });

    it('should set servicePath based on cwd', () => {
      const cwd = process.cwd();
      fse.mkdirsSync(tmpDir);
      process.chdir(tmpDir);
      create.options.template = 'aws-nodejs';
      return create.create().then(() => {
        expect(create.serverless.config.servicePath).to.be.equal(process.cwd());
        process.chdir(cwd);
      });
    });

    it('should display ascii greeting', () => {
      const greetingStub = sinon.stub(create.serverless.cli, 'asciiGreeting');
      create.create();
      expect(greetingStub.callCount).to.be.equal(1);
    });

    it('should generate scaffolding for "aws-nodejs" template', () => {
      const cwd = process.cwd();
      fse.mkdirsSync(tmpDir);
      process.chdir(tmpDir);
      create.options.template = 'aws-nodejs';

      return create.create().then(() => {
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'serverless.yml')))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'handler.js')))
          .to.be.equal(true);

        process.chdir(cwd);
      });
    });

    it('should generate scaffolding for "aws-python" template', () => {
      const cwd = process.cwd();
      fse.mkdirsSync(tmpDir);
      process.chdir(tmpDir);
      create.options.template = 'aws-python';

      return create.create().then(() => {
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'serverless.yml')))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'handler.py')))
          .to.be.equal(true);

        process.chdir(cwd);
      });
    });

    it('should generate scaffolding for "aws-java-maven" template', () => {
      const cwd = process.cwd();
      fse.mkdirsSync(tmpDir);
      process.chdir(tmpDir);
      create.options.template = 'aws-java-maven';

      return create.create().then(() => {
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'serverless.yml')))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'event.json')))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'pom.xml')))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'src', 'main', 'java',
            'hello', 'Handler.java'
          )))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'src', 'main', 'java',
            'hello', 'Request.java'
          )))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'src', 'main', 'java',
            'hello', 'Response.java'
          )))
          .to.be.equal(true);

        process.chdir(cwd);
      });
    });

    it('should generate scaffolding for "aws-java-gradle" template', () => {
      const cwd = process.cwd();
      fse.mkdirsSync(tmpDir);
      process.chdir(tmpDir);
      create.options.template = 'aws-java-gradle';

      return create.create().then(() => {
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'serverless.yml')))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'event.json')))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'build.gradle')))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'src', 'main', 'java',
            'hello', 'Handler.java'
          )))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'src', 'main', 'java',
            'hello', 'Request.java'
          )))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'src', 'main', 'java',
            'hello', 'Response.java'
          )))
          .to.be.equal(true);

        process.chdir(cwd);
      });
    });

    // this test should live here because of process.cwd() which might cause trouble when using
    // nested dirs like its done here
    it('should create a renamed service in the directory if using the "path" option', () => {
      const cwd = process.cwd();
      fse.mkdirsSync(tmpDir);
      process.chdir(tmpDir);

      create.options.path = 'my-new-service';

      // using the nodejs template (this test is completely be independent from the template)
      create.options.template = 'aws-nodejs';

      return create.create().then(() => {
        const serviceDir = path.join(tmpDir, create.options.path);

        // check if files are created in the correct directory
        expect(create.serverless.utils.fileExistsSync(
          path.join(serviceDir, 'serverless.yml'))).to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(
          path.join(serviceDir, 'handler.js'))).to.be.equal(true);

        // check if the service was renamed
        const serverlessYmlfileContent = fse
          .readFileSync(path.join(serviceDir, 'serverless.yml')).toString();

        expect((/service: my-new-service/).test(serverlessYmlfileContent)).to.equal(true);

        process.chdir(cwd);
      });
    });
  });
});
