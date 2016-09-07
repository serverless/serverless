'use strict';

const expect = require('chai').expect;
const Serverless = require('../../lib/Serverless');
const semverRegex = require('semver-regex');
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const YAML = require('js-yaml');

const YamlParser = require('../../lib/classes/YamlParser');
const PluginManager = require('../../lib/classes/PluginManager');
const Utils = require('../../lib/classes/Utils');
const Service = require('../../lib/classes/Service');
const CLI = require('../../lib/classes/CLI');
const Error = require('../../lib/classes/Error').SError;
const testUtils = require('../../tests/utils');

describe('Serverless', () => {
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
  });

  describe('#constructor()', () => {
    it('should set the correct config if a config object is passed', () => {
      const configObj = { some: 'config' };
      const serverlessWithConfig = new Serverless(configObj);

      expect(serverlessWithConfig.config.some).to.equal('config');
    });

    it('should set an empty config object if no config object passed', () => {
      // we're only expecting to have "serverless", "serverlessPath" and "servicePath"
      expect(Object.keys(serverless.config).length).to.equal(3);
      expect(Object.keys(serverless.config)).to.include('serverless');
      expect(Object.keys(serverless.config)).to.include('serverlessPath');
      expect(Object.keys(serverless.config)).to.include('servicePath');
    });

    it('should set the Serverless version', () => {
      expect(serverless.version.length).to.be.at.least(1);
    });

    it('should set the YamlParser class instance', () => {
      expect(serverless.yamlParser).to.be.instanceof(YamlParser);
    });

    it('should set the PluginManager class instance', () => {
      expect(serverless.pluginManager).to.be.instanceof(PluginManager);
    });

    it('should set the Utils class instance', () => {
      expect(serverless.utils).to.be.instanceof(Utils);
    });

    it('should set the Service class instance', () => {
      expect(serverless.service).to.be.instanceof(Service);
    });

    it('should set the servicePath property if it was set in the config object', () => {
      const configObj = { servicePath: 'some/path' };
      const serverlessWithConfig = new Serverless(configObj);

      expect(serverlessWithConfig.config.servicePath).to.equal('some/path');
    });

    // note: we only test if the property is there
    // the test if the correct servicePath is set is done in the Utils class test file
    it('should set the servicePath property if no config object is given', () => {
      expect(serverless.config.servicePath).to.not.equal(undefined);
    });

    it('should have a config object', () => {
      expect(serverless.config).to.not.equal(undefined);
    });

    it('should have a classes object', () => {
      expect(serverless.classes).to.not.equal(undefined);
    });

    it('should store the CLI class inside the classes object', () => {
      expect(serverless.classes.CLI).to.deep.equal(CLI);
    });

    it('should store the YamlParser class inside the classes object', () => {
      expect(serverless.classes.YamlParser).to.deep.equal(YamlParser);
    });

    it('should store the PluginManager class inside the classes object', () => {
      expect(serverless.classes.PluginManager).to.deep.equal(PluginManager);
    });

    it('should store the Utils class inside the classes object', () => {
      expect(serverless.classes.Utils).to.deep.equal(Utils);
    });

    it('should store the Service class inside the classes object', () => {
      expect(serverless.classes.Service).to.deep.equal(Service);
    });

    it('should store the Error class inside the classes object', () => {
      expect(serverless.classes.Error).to.deep.equal(Error);
    });
  });

  describe('#init()', () => {
    it('should create a new CLI instance', () => {
      serverless.init();
      expect(serverless.cli).to.be.instanceOf(CLI);
    });

    // note: we just test that the processedInput variable is set (not the content of it)
    // the test for the correct input is done in the CLI class test file
    it('should receive the processed input form the CLI instance', () => {
      serverless.init();
      expect(serverless.processedInput).to.not.deep.equal({});
    });

    it('should resolve after loading the service', () => {
      const SUtils = new Utils();
      const tmpDirPath = testUtils.getTmpDirPath();
      const serverlessYml = {
        service: 'new-service',
        provider: 'aws',
        custom: {
          selfValues: {
            obj: {
              one: 1,
              two: 'two',
            },
            dev: true,
          },
          variableRefs: {
            testA: '${self:custom.selfValues.obj}',
            testB: '${env:random_env, opt:stage}',
            testC: 'number is ${env:random_env, opt:random_opt, self:custom.selfValues.obj.two}',
            testD: '${self:custom.selfValues.${opt:stage}}',
          },
        },
        plugins: ['testPlugin'],
        functions: {
          functionA: {},
        },
        resources: {
          aws: {
            resourcesProp: 'value',
          },
          azure: {},
          google: {},
        },
        package: {
          include: ['include-me.js'],
          exclude: ['exclude-me.js'],
          artifact: 'some/path/foo.zip',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYml));

      const serverlessInstance = new Serverless();
      serverlessInstance.config.update({ servicePath: tmpDirPath });
      serverless.pluginManager.cliOptions = {
        stage: 'dev',
      };

      serverlessInstance.init().then(loadedService => {
        expect(loadedService.custom.variableRefs.testA)
          .to.deep.equal({ one: 1, two: 'two' });
        expect(loadedService.custom.variableRefs.testB).to.equal('dev');
        expect(loadedService.custom.variableRefs.testC).to.equal('number is two');
        expect(loadedService.custom.variableRefs.testD).to.equal(true);
      });
    });
  });

  describe('#run()', () => {
    beforeEach(() => {
      serverless.init();
      serverless.processedInput = { commands: [], options: {} };
    });

    it('should track if tracking is enabled', (done) => {
      const tmpDirPath = testUtils.getTmpDirPath();
      fse.mkdirsSync(tmpDirPath);

      serverless.config.serverlessPath = tmpDirPath;

      serverless.run().then(() => done());
    });

    it('should not track if tracking is disabled', (done) => {
      const tmpDirPath = testUtils.getTmpDirPath();
      fse.mkdirsSync(tmpDirPath);
      fs.writeFileSync(path.join(tmpDirPath, 'do-not-track'), 'some-content');

      serverless.config.serverlessPath = tmpDirPath;

      serverless.run().then(() => done());
    });

    it('should forward the entered command to the PluginManager class', () => {
      serverless.processedInput.commands = ['someNotAvailableCommand'];

      // we expect that an error is returned because the PluginManager will check if
      // there's a plugin which will fail but our command is forwarded to the PluginManager
      // and the PluginManager reports back that the command was not found (therefore the RegExp)
      expect(() => serverless.run()).to.throw(Error, /someNotAvailableCommand/);
    });

    it('should resolve if help is displayed or no commands are entered', (done) => {
      serverless.processedInput.commands = ['help'];
      serverless.run().then(() => done());
    });
  });

  describe('#getVersion()', () => {
    it('should get the correct Serverless version', () => {
      expect(semverRegex().test(serverless.getVersion())).to.equal(true);
    });
  });
});
