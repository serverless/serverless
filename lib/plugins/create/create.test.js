'use strict';

const expect = require('chai').expect;
const path = require('path');
const fse = require('fs-extra');
const BbPromise = require('bluebird');
const Create = require('./create');
const Serverless = require('../../Serverless');
const sinon = require('sinon');
const testUtils = require('../../../tests/utils');

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

    it('should overwrite the name for the service if user passed name', () => {
      const cwd = process.cwd();
      fse.mkdirsSync(tmpDir);
      process.chdir(tmpDir);
      create.options.template = 'aws-nodejs';
      create.options.name = 'my_service';

      return create.create().then(() =>
        create.serverless.yamlParser.parse(
          path.join(tmpDir, 'serverless.yml')
        ).then((obj) => {
          expect(obj.service).to.equal('my_service');
          process.chdir(cwd);
        })
      );
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
      const cwd = process.cwd();
      fse.mkdirsSync(tmpDir);
      process.chdir(tmpDir);

      const greetingStub = sinon.stub(create.serverless.cli, 'asciiGreeting');
      return create.create().then(() => {
        expect(greetingStub.callCount).to.be.equal(1);
        process.chdir(cwd);
      });
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
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, '.gitignore')))
          .to.be.equal(true);

        process.chdir(cwd);
      });
    });

    it('should generate scaffolding for "aws-csharp" template', () => {
      const cwd = process.cwd();
      fse.mkdirsSync(tmpDir);
      process.chdir(tmpDir);
      create.options.template = 'aws-csharp';

      return create.create().then(() => {
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'serverless.yml')))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'Handler.cs')))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, '.gitignore')))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'AssemblyInfo.cs')))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'build.sh')))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'build.ps1')))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'project.json')))
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
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, '.gitignore')))
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
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'pom.xml')))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'src', 'main', 'resources',
            'log4j.properties'
          )))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'src', 'main', 'java',
            'com', 'serverless', 'Handler.java'
          )))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'src', 'main', 'java',
            'com', 'serverless', 'ApiGatewayResponse.java'
          )))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'src', 'main', 'java',
            'com', 'serverless', 'Response.java'
          )))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, '.gitignore')))
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
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'build.gradle')))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'gradlew')))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'gradlew.bat')))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'gradle', 'wrapper',
            'gradle-wrapper.jar')))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'gradle', 'wrapper',
            'gradle-wrapper.properties')))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'src', 'main', 'resources',
            'log4j.properties'
          )))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'src', 'main', 'java',
            'com', 'serverless', 'Handler.java'
          )))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'src', 'main', 'java',
            'com', 'serverless', 'ApiGatewayResponse.java'
          )))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'src', 'main', 'java',
            'com', 'serverless', 'Response.java'
          )))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, '.gitignore')))
          .to.be.equal(true);

        process.chdir(cwd);
      });
    });

    it('should generate scaffolding for "aws-scala-sbt" template', () => {
      const cwd = process.cwd();
      fse.mkdirsSync(tmpDir);
      process.chdir(tmpDir);
      create.options.template = 'aws-scala-sbt';

      return create.create().then(() => {
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'serverless.yml')))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'build.sbt')))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'src', 'main', 'scala',
          'hello', 'Handler.scala'
        )))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'src', 'main', 'scala',
          'hello', 'Request.scala'
        )))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'src', 'main', 'scala',
          'hello', 'Response.scala'
        )))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, '.gitignore')))
          .to.be.equal(true);

        process.chdir(cwd);
      });
    });

    it('should generate scaffolding for "openwhisk-nodejs" template', () => {
      const cwd = process.cwd();
      fse.mkdirsSync(tmpDir);
      process.chdir(tmpDir);
      create.options.template = 'openwhisk-nodejs';

      return create.create().then(() => {
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'package.json')))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'serverless.yml')))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'handler.js')))
          .to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, '.gitignore')))
          .to.be.equal(true);

        process.chdir(cwd);
      });
    });

    // this test should live here because of process.cwd() which might cause trouble when using
    // nested dirs like its done here
    it('should create a plugin in the current directory', () => {
      const cwd = process.cwd();
      fse.mkdirsSync(tmpDir);
      process.chdir(tmpDir);

      // using the nodejs template (this test is completely be independent from the template)
      create.options.template = 'plugin';

      return create.create().then(() => {
        const serviceDir = tmpDir;

        // check if files are created in the correct directory
        expect(create.serverless.utils.fileExistsSync(
          path.join(serviceDir, 'index.js'))).to.be.equal(true);

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
      create.options.name = null;

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

    it('should create a service in the directory if using the "path" option with digits', () => {
      const cwd = process.cwd();
      fse.mkdirsSync(tmpDir);
      process.chdir(tmpDir);

      create.options.path = 123;
      create.options.name = null;

      // using the nodejs template (this test is completely be independent from the template)
      create.options.template = 'aws-nodejs';

      return create.create().then(() => {
        const serviceDir = path.join(tmpDir, String(create.options.path));

        // check if files are created in the correct directory
        expect(create.serverless.utils.fileExistsSync(
          path.join(serviceDir, 'serverless.yml'))).to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(
          path.join(serviceDir, 'handler.js'))).to.be.equal(true);

        process.chdir(cwd);
      });
    });

    it('should create a custom renamed service in the directory if using ' +
       'the "path" and "name" option', () => {
      const cwd = process.cwd();
      fse.mkdirsSync(tmpDir);
      process.chdir(tmpDir);

      create.options.path = 'my-new-service';
      create.options.name = 'my-custom-new-service';

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

        expect((/service: my-custom-new-service/).test(serverlessYmlfileContent)).to.equal(true);

        process.chdir(cwd);
      });
    });

    it('should throw error if there are existing template files in cwd', () => {
      const cwd = process.cwd();
      fse.mkdirsSync(tmpDir);
      process.chdir(tmpDir);

      // create existing files from nodejs template
      create.options.template = 'aws-nodejs';
      create.options.path = '';
      create.serverless.utils.copyDirContentsSync(path.join(create.serverless.config.serverlessPath,
       'plugins', 'create', 'templates', create.options.template), tmpDir);

      expect(create.serverless.utils.fileExistsSync(
         path.join(tmpDir, 'serverless.yml'))).to.be.equal(true);
      expect(() => create.create()).to.throw(Error);
      process.chdir(cwd);
    });

    it('should throw error if the directory for the service already exists in cwd', () => {
      create.options.path = 'my-service';
      create.options.template = 'aws-nodejs';

      const cwd = process.cwd();
      // create a directory with the pathname
      fse.mkdirsSync(path.join(tmpDir, create.options.path));
      process.chdir(tmpDir);

      expect(() => create.create()).to.throw(Error);
      process.chdir(cwd);
    });
  });
});
