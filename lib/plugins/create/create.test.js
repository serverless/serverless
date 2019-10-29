'use strict';

const chai = require('chai');
const fs = require('fs');
const path = require('path');
const fse = require('fs-extra');
const Create = require('./create');
const Serverless = require('../../Serverless');
const sinon = require('sinon');
const walkDirSync = require('../../utils/fs/walkDirSync');
const download = require('../../utils/downloadTemplateFromRepo');
const userStats = require('../../utils/userStats');
const { getTmpDirPath } = require('../../../tests/utils/fs');

chai.use(require('sinon-chai'));
const { expect } = require('chai');

describe('Create', () => {
  let create;
  let logSpy;

  before(() => {
    const serverless = new Serverless();
    const options = {};
    create = new Create(serverless, options);
    create.serverless.cli = new serverless.classes.CLI();
    logSpy = sinon.spy(create.serverless.cli, 'log');
    sinon.stub(userStats, 'track').resolves();
  });

  after(() => {
    userStats.track.restore();
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(create.commands).to.be.not.empty);

    it('should have hooks', () => expect(create.hooks).to.be.not.empty);

    it('should run promise chain in order for "create:create" hook', () => {
      const createStub = sinon.stub(create, 'create').resolves();

      return create.hooks['create:create']().then(() => {
        expect(createStub.calledOnce).to.be.equal(true);

        create.create.restore();
      });
    });
  });

  describe('#create()', () => {
    let tmpDir;
    let cwd;

    beforeEach(() => {
      tmpDir = getTmpDirPath();
      fse.mkdirsSync(tmpDir);
      cwd = process.cwd();
    });

    afterEach(() => {
      process.chdir(cwd);
    });

    describe('downloading templates', () => {
      let downloadStub;

      beforeEach(() => {
        create.options = {};
        downloadStub = sinon.stub(download, 'downloadTemplateFromRepo');
      });

      afterEach(() => {
        download.downloadTemplateFromRepo.restore();
      });

      it('should reject if download fails', () => {
        downloadStub.rejects(new Error('Wrong'));
        create.options['template-url'] = 'https://github.com/serverless/serverless';

        return create.create().catch(error => {
          expect(error).to.match(/Wrong/);
          expect(downloadStub).to.have.been.calledOnce; // eslint-disable-line
        });
      });

      it('should resolve if download succeeds', () => {
        downloadStub.resolves('serverless');
        create.options['template-url'] = 'https://github.com/serverless/serverless';

        return create.create().then(() => {
          const installationMessage = logSpy.args.filter(arg =>
            arg[0].includes('installed "serverless"')
          );

          expect(downloadStub).to.have.been.calledOnce; // eslint-disable-line
          expect(installationMessage[0]).to.have.lengthOf(1);
        });
      });

      it('should resolve if download succeeds and display the desired service name', () => {
        downloadStub.resolves('serverless');
        create.options['template-url'] = 'https://github.com/serverless/serverless';
        create.options.name = 'sls';

        return create.create().then(() => {
          const installationMessage = logSpy.args.filter(arg =>
            arg[0].includes('installed "serverless" as "sls"')
          );

          expect(downloadStub).to.have.been.calledOnce; // eslint-disable-line
          expect(installationMessage[0]).to.have.lengthOf(1);
        });
      });
    });

    it('should throw error if user passed unsupported template', () => {
      create.options.template = 'invalid-template';
      expect(() => create.create()).to.throw(Error);
    });

    it('should overwrite the name for the service if user passed name', () => {
      process.chdir(tmpDir);
      create.options.template = 'aws-nodejs';
      create.options.name = 'my_service';

      return create.create().then(() =>
        create.serverless.yamlParser.parse(path.join(tmpDir, 'serverless.yml')).then(obj => {
          expect(obj.service).to.equal('my_service');
        })
      );
    });

    it('should set servicePath based on cwd', () => {
      process.chdir(tmpDir);
      create.options.template = 'aws-nodejs';
      return create.create().then(() => {
        expect(create.serverless.config.servicePath).to.be.equal(process.cwd());
      });
    });

    it('should display ascii greeting', () => {
      process.chdir(tmpDir);

      const greetingStub = sinon.stub(create.serverless.cli, 'asciiGreeting');
      return create.create().then(() => {
        expect(greetingStub.callCount).to.be.equal(1);
      });
    });

    it('should generate scaffolding for "aws-clojure-gradle" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'aws-clojure-gradle';

      return create.create().then(() => {
        const dirContent = walkDirSync(tmpDir).map(elem =>
          elem.replace(path.join(tmpDir, path.sep), '')
        );

        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('build.gradle');
        expect(dirContent).to.include('gradlew');
        expect(dirContent).to.include('gradlew.bat');
        expect(dirContent).to.include(path.join('gradle', 'wrapper', 'gradle-wrapper.jar'));
        expect(dirContent).to.include(path.join('gradle', 'wrapper', 'gradle-wrapper.properties'));
        expect(dirContent).to.include(path.join('src', 'main', 'resources', 'log4j.properties'));
        expect(dirContent).to.include(path.join('src', 'main', 'clojure', 'hello.clj'));
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "aws-clojurescript-gradle" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'aws-clojurescript-gradle';

      return create.create().then(() => {
        const dirContent = walkDirSync(tmpDir).map(elem =>
          elem.replace(path.join(tmpDir, path.sep), '')
        );

        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('build.gradle');
        expect(dirContent).to.include('gradlew');
        expect(dirContent).to.include('gradlew.bat');
        expect(dirContent).to.include(path.join('gradle', 'wrapper', 'gradle-wrapper.jar'));
        expect(dirContent).to.include(path.join('gradle', 'wrapper', 'gradle-wrapper.properties'));
        expect(dirContent).to.include(
          path.join('src', 'main', 'clojurescript', 'serverless', 'functions.cljs')
        );
        expect(dirContent).to.include(path.join('scripts', 'node_repl.clj'));
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "aws-nodejs" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'aws-nodejs';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);

        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('handler.js');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "aws-nodejs-typescript" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'aws-nodejs-typescript';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('handler.ts');
        expect(dirContent).to.include('tsconfig.json');
        expect(dirContent).to.include('package.json');
        expect(dirContent).to.include('webpack.config.js');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "aws-alexa-typescript" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'aws-alexa-typescript';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('handler.ts');
        expect(dirContent).to.include('tsconfig.json');
        expect(dirContent).to.include('package.json');
        expect(dirContent).to.include('webpack.config.js');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "aws-nodejs-ecma-script" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'aws-nodejs-ecma-script';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('first.js');
        expect(dirContent).to.include('second.js');
        expect(dirContent).to.include('package.json');
        expect(dirContent).to.include('webpack.config.js');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "aws-csharp" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'aws-csharp';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('Handler.cs');
        expect(dirContent).to.include('.gitignore');
        expect(dirContent).to.include('aws-csharp.csproj');
        expect(dirContent).to.include('build.cmd');
        expect(dirContent).to.include('build.sh');
      });
    });

    it('should generate scaffolding for "aws-fsharp" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'aws-fsharp';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('Handler.fs');
        expect(dirContent).to.include('.gitignore');
        expect(dirContent).to.include('build.sh');
        expect(dirContent).to.include('build.cmd');
        expect(dirContent).to.include('aws-fsharp.fsproj');
        expect(dirContent).to.not.include('global.json');
      });
    });

    it('should generate scaffolding for "aws-python" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'aws-python';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('handler.py');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "aws-python3" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'aws-python3';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('handler.py');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "aws-java-maven" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'aws-java-maven';

      return create.create().then(() => {
        const dirContent = walkDirSync(tmpDir).map(elem =>
          elem.replace(path.join(tmpDir, path.sep), '')
        );

        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('pom.xml');
        expect(dirContent).to.include(path.join('src', 'main', 'resources', 'log4j2.xml'));
        expect(dirContent).to.include(
          path.join('src', 'main', 'java', 'com', 'serverless', 'Handler.java')
        );
        expect(dirContent).to.include(
          path.join('src', 'main', 'java', 'com', 'serverless', 'ApiGatewayResponse.java')
        );
        expect(dirContent).to.include(
          path.join('src', 'main', 'java', 'com', 'serverless', 'Response.java')
        );
        expect(dirContent).to.include(path.join('.gitignore'));
      });
    });

    it('should generate scaffolding for "aws-kotlin-jvm-maven" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'aws-kotlin-jvm-maven';

      return create.create().then(() => {
        const dirContent = walkDirSync(tmpDir).map(elem =>
          elem.replace(path.join(tmpDir, path.sep), '')
        );

        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('pom.xml');
        expect(dirContent).to.include(
          path.join('src', 'main', 'kotlin', 'com', 'serverless', 'Handler.kt')
        );
        expect(dirContent).to.include(
          path.join('src', 'main', 'kotlin', 'com', 'serverless', 'ApiGatewayResponse.kt')
        );
        expect(dirContent).to.include(
          path.join('src', 'main', 'kotlin', 'com', 'serverless', 'Response.kt')
        );
        expect(dirContent).to.include(path.join('src', 'test', 'kotlin', '.gitkeep'));
        expect(dirContent).to.include(path.join('.gitignore'));
      });
    });

    it('should generate scaffolding for "aws-kotlin-jvm-gradle" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'aws-kotlin-jvm-gradle';

      return create.create().then(() => {
        const dirContent = walkDirSync(tmpDir).map(elem =>
          elem.replace(path.join(tmpDir, path.sep), '')
        );

        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('build.gradle');
        expect(dirContent).to.include(
          path.join('src', 'main', 'kotlin', 'com', 'serverless', 'Handler.kt')
        );
        expect(dirContent).to.include(
          path.join('src', 'main', 'kotlin', 'com', 'serverless', 'ApiGatewayResponse.kt')
        );
        expect(dirContent).to.include(
          path.join('src', 'main', 'kotlin', 'com', 'serverless', 'Response.kt')
        );
        expect(dirContent).to.include(path.join('src', 'test', 'kotlin', '.gitkeep'));
        expect(dirContent).to.include(path.join('.gitignore'));
      });
    });

    it('should generate scaffolding for "aws-kotlin-nodejs-gradle" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'aws-kotlin-nodejs-gradle';

      return create.create().then(() => {
        const dirContent = walkDirSync(tmpDir).map(elem =>
          elem.replace(path.join(tmpDir, path.sep), '')
        );

        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('build.gradle.kts');
        expect(dirContent).to.include('gradlew');
        expect(dirContent).to.include('gradlew.bat');
        expect(dirContent).to.include(path.join('gradle', 'wrapper', 'gradle-wrapper.jar'));
        expect(dirContent).to.include(path.join('gradle', 'wrapper', 'gradle-wrapper.properties'));
        expect(dirContent).to.include(
          path.join('src', 'main', 'kotlin', 'com', 'serverless', 'Handler.kt')
        );
        expect(dirContent).to.include(
          path.join('src', 'main', 'kotlin', 'com', 'serverless', 'ApiGatewayResponse.kt')
        );
        expect(dirContent).to.include(
          path.join('src', 'main', 'kotlin', 'com', 'serverless', 'Response.kt')
        );
        expect(dirContent).to.include(path.join('src', 'test', 'kotlin', '.gitkeep'));
        expect(dirContent).to.include(path.join('.gitignore'));
      });
    });

    it('should generate scaffolding for "aws-java-gradle" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'aws-java-gradle';

      return create.create().then(() => {
        const dirContent = walkDirSync(tmpDir).map(elem =>
          elem.replace(path.join(tmpDir, path.sep), '')
        );

        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('build.gradle');
        expect(dirContent).to.include('gradlew');
        expect(dirContent).to.include('gradlew.bat');
        expect(dirContent).to.include(path.join('gradle', 'wrapper', 'gradle-wrapper.jar'));
        expect(dirContent).to.include(path.join('gradle', 'wrapper', 'gradle-wrapper.properties'));
        expect(dirContent).to.include(path.join('src', 'main', 'resources', 'log4j.properties'));
        expect(dirContent).to.include(
          path.join('src', 'main', 'java', 'com', 'serverless', 'Handler.java')
        );
        expect(dirContent).to.include(
          path.join('src', 'main', 'java', 'com', 'serverless', 'ApiGatewayResponse.java')
        );
        expect(dirContent).to.include(
          path.join('src', 'main', 'java', 'com', 'serverless', 'Response.java')
        );
        expect(dirContent).to.include(path.join('.gitignore'));
      });
    });

    it('should generate scaffolding for "aws-groovy-gradle" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'aws-groovy-gradle';

      return create.create().then(() => {
        const dirContent = walkDirSync(tmpDir).map(elem =>
          elem.replace(path.join(tmpDir, path.sep), '')
        );

        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('build.gradle');
        expect(dirContent).to.include('gradlew');
        expect(dirContent).to.include('gradlew.bat');
        expect(dirContent).to.include(path.join('gradle', 'wrapper', 'gradle-wrapper.jar'));
        expect(dirContent).to.include(path.join('gradle', 'wrapper', 'gradle-wrapper.properties'));
        expect(dirContent).to.include(path.join('src', 'main', 'resources', 'log4j.properties'));
        expect(dirContent).to.include(
          path.join('src', 'main', 'groovy', 'com', 'serverless', 'Handler.groovy')
        );
        expect(dirContent).to.include(
          path.join('src', 'main', 'groovy', 'com', 'serverless', 'ApiGatewayResponse.groovy')
        );
        expect(dirContent).to.include(
          path.join('src', 'main', 'groovy', 'com', 'serverless', 'Response.groovy')
        );
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "aws-scala-sbt" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'aws-scala-sbt';

      return create.create().then(() => {
        const dirContent = walkDirSync(tmpDir).map(elem =>
          elem.replace(path.join(tmpDir, path.sep), '')
        );

        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('build.sbt');
        expect(dirContent).to.include(path.join('src', 'main', 'scala', 'hello', 'Handler.scala'));
        expect(dirContent).to.include(path.join('src', 'main', 'scala', 'hello', 'Request.scala'));
        expect(dirContent).to.include(path.join('src', 'main', 'scala', 'hello', 'Response.scala'));
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "openwhisk-java-maven" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'openwhisk-java-maven';

      return create.create().then(() => {
        const dirContent = walkDirSync(tmpDir).map(elem =>
          elem.replace(path.join(tmpDir, path.sep), '')
        );
        expect(dirContent).to.include('pom.xml');
        expect(dirContent).to.include(
          path.join('src', 'main', 'java', 'com', 'example', 'FunctionApp.java')
        );
        expect(dirContent).to.include(
          path.join('src', 'test', 'java', 'com', 'example', 'FunctionAppTest.java')
        );
        expect(dirContent).to.include('.gitignore');
        expect(dirContent).to.include('serverless.yml');
      });
    });

    it('should generate scaffolding for "openwhisk-nodejs" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'openwhisk-nodejs';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('package.json');
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('handler.js');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "openwhisk-python" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'openwhisk-python';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('package.json');
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('handler.py');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "openwhisk-php" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'openwhisk-php';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('package.json');
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('handler.php');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "openwhisk-ruby" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'openwhisk-ruby';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('package.json');
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('handler.rb');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "openwhisk-swift" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'openwhisk-swift';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('package.json');
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('ping.swift');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "azure-nodejs" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'azure-nodejs';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('package.json');
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('.gitignore');
        expect(dirContent).to.include('host.json');
        expect(dirContent).to.include('README.md');

        const srcContent = fs.readdirSync('src/handlers');
        expect(srcContent).to.include('hello.js');
        expect(srcContent).to.include('goodbye.js');
      });
    });

    it('should generate scaffolding for "cloudflare-workers" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'cloudflare-workers';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('package.json');
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('helloWorld.js');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "cloudflare-workers-enterprise" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'cloudflare-workers-enterprise';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('package.json');
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('bar.js');
        expect(dirContent).to.include('helloWorld.js');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "cloudflare-workers-rust" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'cloudflare-workers-rust';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('package.json');
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('helloWorld.js');
        expect(dirContent).to.include('.gitignore');
        expect(dirContent).to.include('webpack.config.js');
        expect(dirContent).to.include('rust-wasm');
      });
    });

    it('should generate scaffolding for "google-python" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'google-python';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('package.json');
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('main.py');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "google-nodejs" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'google-nodejs';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('package.json');
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('index.js');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "google-go" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'google-go';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('fn.go');
        expect(dirContent).to.include('fn_test.go');
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('Makefile');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "kubeless-python" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'kubeless-python';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('package.json');
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('handler.py');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "kubeless-nodejs" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'kubeless-nodejs';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('package.json');
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('handler.js');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "spotinst-nodejs" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'spotinst-nodejs';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('package.json');
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('handler.js');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "spotinst-python" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'spotinst-python';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('package.json');
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('handler.py');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "spotinst-ruby" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'spotinst-ruby';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('package.json');
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('handler.rb');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "spotinst-java8" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'spotinst-java8';

      return create.create().then(() => {
        const dirContent = walkDirSync(tmpDir).map(elem =>
          elem.replace(path.join(tmpDir, path.sep), '')
        );

        expect(dirContent).to.include('package.json');
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('pom.xml');
        expect(dirContent).to.include(
          path.join('src', 'main', 'java', 'com', 'serverless', 'Handler.java')
        );
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "fn-nodejs" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'fn-nodejs';

      return create.create().then(() => {
        const dirContent = walkDirSync(tmpDir).map(elem =>
          elem.replace(path.join(tmpDir, path.sep), '')
        );
        expect(dirContent).to.include('package.json');
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('.gitignore');
        expect(dirContent).to.include(path.join('hello', 'func.js'));
        expect(dirContent).to.include(path.join('hello', 'package.json'));
        expect(dirContent).to.include(path.join('hello', 'test.json'));
      });
    });

    it('should generate scaffolding for "fn-go" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'fn-go';

      return create.create().then(() => {
        const dirContent = walkDirSync(tmpDir).map(elem =>
          elem.replace(path.join(tmpDir, path.sep), '')
        );
        expect(dirContent).to.include('package.json');
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('.gitignore');
        expect(dirContent).to.include(path.join('hello', 'func.go'));
        expect(dirContent).to.include(path.join('hello', 'Gopkg.toml'));
        expect(dirContent).to.include(path.join('hello', 'test.json'));
      });
    });

    it('should generate scaffolding for "aliyun-nodejs" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'aliyun-nodejs';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('index.js');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "tencent-go" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'tencent-go';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('index.go');
        expect(dirContent).to.include('Makefile');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "tencent-php" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'tencent-php';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('index.php');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "tencent-python" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'tencent-python';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('index.py');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "tencent-nodejs" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'tencent-nodejs';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('index.js');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "plugin" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'plugin';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('index.js');
      });
    });

    it('should generate scaffolding for "hello-world" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'hello-world';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('handler.js');
        expect(dirContent).to.include('.gitignore');
      });
    });

    // this test should live here because of process.cwd() which might cause trouble when using
    // nested dirs like its done here
    it('should create a plugin in the current directory', () => {
      process.chdir(tmpDir);
      create.options.template = 'plugin';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('index.js');
      });
    });

    // this test should live here because of process.cwd() which might cause trouble when using
    // nested dirs like its done here
    it('should create a renamed service in the directory if using the "path" option', () => {
      process.chdir(tmpDir);

      create.options.path = 'my-new-service';
      create.options.name = null;

      // using the nodejs template (this test is completely be independent from the template)
      create.options.template = 'aws-nodejs';

      return create.create().then(() => {
        const serviceDir = path.join(tmpDir, create.options.path);
        const dirContent = fs.readdirSync(serviceDir);

        // check if files are created in the correct directory
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('handler.js');

        // check if the service was renamed
        const serverlessYmlfileContent = fse
          .readFileSync(path.join(serviceDir, 'serverless.yml'))
          .toString();

        expect(/service: my-new-service/.test(serverlessYmlfileContent)).to.equal(true);
      });
    });

    it('should create a service in the directory if using the "path" option with digits', () => {
      process.chdir(tmpDir);

      create.options.path = 123;
      create.options.name = null;

      // using the nodejs template (this test is completely be independent from the template)
      create.options.template = 'aws-nodejs';

      return create.create().then(() => {
        const serviceDir = path.join(tmpDir, String(create.options.path));
        const dirContent = fs.readdirSync(serviceDir);

        // check if files are created in the correct directory
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('handler.js');
      });
    });

    it(
      'should create a custom renamed service in the directory if using ' +
        'the "path" and "name" option',
      () => {
        process.chdir(tmpDir);

        create.options.path = 'my-new-service';
        create.options.name = 'my-custom-new-service';

        // using the nodejs template (this test is completely be independent from the template)
        create.options.template = 'aws-nodejs';

        return create.create().then(() => {
          const serviceDir = path.join(tmpDir, create.options.path);
          const dirContent = fs.readdirSync(serviceDir);

          // check if files are created in the correct directory
          expect(dirContent).to.include('serverless.yml');
          expect(dirContent).to.include('handler.js');

          // check if the service was renamed
          const serverlessYmlfileContent = fse
            .readFileSync(path.join(serviceDir, 'serverless.yml'))
            .toString();

          expect(/service: my-custom-new-service/.test(serverlessYmlfileContent)).to.equal(true);
        });
      }
    );

    it('should throw error if there are existing template files in cwd', () => {
      process.chdir(tmpDir);

      // create existing files from nodejs template
      create.options.template = 'aws-nodejs';
      create.options.path = '';
      create.serverless.utils.copyDirContentsSync(
        path.join(
          create.serverless.config.serverlessPath,
          'plugins',
          'create',
          'templates',
          create.options.template
        ),
        tmpDir
      );

      const dirContent = fs.readdirSync(tmpDir);

      expect(dirContent).to.include('serverless.yml');
      expect(() => create.create()).to.throw(Error);
    });

    it('should throw error if the directory for the service already exists in cwd', () => {
      create.options.path = 'my-service';
      create.options.template = 'aws-nodejs';

      // create a directory with the pathname
      fse.mkdirsSync(path.join(tmpDir, create.options.path));
      process.chdir(tmpDir);

      expect(() => create.create()).to.throw(Error);
    });

    it('should copy "aws-nodejs" template from local path', () => {
      process.chdir(tmpDir);
      const distDir = path.join(tmpDir, 'my-awesome-service');
      create.options = {};
      create.options.path = distDir;
      create.options['template-path'] = path.join(__dirname, 'templates/aws-nodejs');

      return create.create().then(() => {
        const dirContent = fs.readdirSync(distDir);

        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('handler.js');
        expect(dirContent).to.include('gitignore');

        // check if the service was renamed
        const serverlessYmlfileContent = fse
          .readFileSync(path.join(distDir, 'serverless.yml'))
          .toString();

        expect(/service: aws-nodejs/.test(serverlessYmlfileContent)).to.equal(true);
      });
    });

    it('should copy "aws-nodejs" template from local path with a custom name', () => {
      process.chdir(tmpDir);
      create.options = {};
      create.options['template-path'] = path.join(__dirname, 'templates/aws-nodejs');
      create.options.name = 'my-awesome-service';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(path.join(tmpDir, 'my-awesome-service'));

        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('handler.js');
        expect(dirContent).to.include('gitignore');

        // check if the service was renamed
        const serverlessYmlfileContent = fse
          .readFileSync(path.join(tmpDir, 'my-awesome-service', 'serverless.yml'))
          .toString();

        expect(/service: my-awesome-service/.test(serverlessYmlfileContent)).to.equal(true);
      });
    });

    it('should generate scaffolding for "aws-go" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'aws-go';

      return create.create().then(() => {
        const dirContent = walkDirSync(tmpDir).map(elem =>
          elem.replace(path.join(tmpDir, path.sep), '')
        );

        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include(path.join('hello', 'main.go'));
        expect(dirContent).to.include(path.join('world', 'main.go'));
        expect(dirContent).to.include('Makefile');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "aws-go-dep" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'aws-go-dep';

      return create.create().then(() => {
        const dirContent = walkDirSync(tmpDir).map(elem =>
          elem.replace(path.join(tmpDir, path.sep), '')
        );

        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include(path.join('hello', 'main.go'));
        expect(dirContent).to.include(path.join('world', 'main.go'));
        expect(dirContent).to.include('Gopkg.toml');
        expect(dirContent).to.include('Makefile');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "aws-go-mod" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'aws-go-mod';

      return create.create().then(() => {
        const dirContent = walkDirSync(tmpDir).map(elem =>
          elem.replace(path.join(tmpDir, path.sep), '')
        );

        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include(path.join('hello', 'main.go'));
        expect(dirContent).to.include(path.join('world', 'main.go'));
        expect(dirContent).to.include('gomod.sh');
        expect(dirContent).to.include('Makefile');
        expect(dirContent).to.include('.gitignore');
      });
    });

    it('should generate scaffolding for "aws-ruby" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'aws-ruby';

      return create.create().then(() => {
        expect(
          create.serverless.utils.fileExistsSync(path.join(tmpDir, 'serverless.yml'))
        ).to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'handler.rb'))).to.be.equal(
          true
        );
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, '.gitignore'))).to.be.equal(
          true
        );
      });
    });

    it('should generate scaffolding for "aws-provided" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'aws-provided';

      return create.create().then(() => {
        expect(
          create.serverless.utils.fileExistsSync(path.join(tmpDir, 'serverless.yml'))
        ).to.be.equal(true);
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'handler.sh'))).to.be.equal(
          true
        );
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, '.gitignore'))).to.be.equal(
          true
        );
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'bootstrap'))).to.be.equal(
          true
        );
      });
    });

    it('should generate scaffolding for "twilio-nodejs" template', () => {
      process.chdir(tmpDir);
      create.options.template = 'twilio-nodejs';

      return create.create().then(() => {
        const dirContent = fs.readdirSync(tmpDir);
        expect(dirContent).to.include('package.json');
        expect(dirContent).to.include('serverless.yml');
        expect(dirContent).to.include('handler.js');
        expect(dirContent).to.include('example.jpg');
        expect(dirContent).to.include('.gitignore');
      });
    });
  });
});
