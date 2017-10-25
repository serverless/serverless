'use strict';

const expect = require('chai').expect;
const Serverless = require('./Serverless');
const semverRegex = require('semver-regex');
const path = require('path');
const YAML = require('js-yaml');
const sinon = require('sinon');
const BbPromise = require('bluebird');

const YamlParser = require('../lib/classes/YamlParser');
const PluginManager = require('../lib/classes/PluginManager');
const Utils = require('../lib/classes/Utils');
const Service = require('../lib/classes/Service');
const CLI = require('../lib/classes/CLI');
const ServerlessError = require('../lib/classes/Error').ServerlessError;
const testUtils = require('../tests/utils');

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

    it('should set an empty providers object', () => {
      expect(serverless.providers).to.deep.equal({});
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
      expect(serverless.classes.Error).to.deep.equal(ServerlessError);
    });
  });

  describe('#init()', () => {
    let loadAllPluginsStub;
    let updateAutocompleteCacheFileStub;

    beforeEach(() => {
      loadAllPluginsStub = sinon
        .stub(serverless.pluginManager, 'loadAllPlugins').returns();
      updateAutocompleteCacheFileStub = sinon
        .stub(serverless.pluginManager, 'updateAutocompleteCacheFile').resolves();
    });

    afterEach(() => {
      serverless.pluginManager.loadAllPlugins.restore();
      serverless.pluginManager.updateAutocompleteCacheFile.restore();
    });

    it('should create a new CLI instance', () => serverless.init().then(() => {
      expect(serverless.cli).to.be.instanceof(CLI);
    }));

    it('should allow a custom CLI instance', () => {
      class CustomCLI extends CLI {}
      serverless.classes.CLI = CustomCLI;

      return serverless.init().then(() => {
        expect(serverless.cli).to.be.instanceof(CLI);
        expect(serverless.cli.constructor.name).to.equal('CustomCLI');
      });
    });

    // note: we just test that the processedInput variable is set (not the content of it)
    // the test for the correct input is done in the CLI class test file
    it('should receive the processed input form the CLI instance', () => serverless.init()
      .then(() => {
        expect(serverless.processedInput).to.not.deep.equal({});
      })
    );

    it('should resolve after loading the service', () => {
      const SUtils = new Utils();
      const tmpDirPath = testUtils.getTmpDirPath();
      const serverlessYml = {
        service: 'new-service',
        provider: 'aws',
        custom: {},
        plugins: ['testPlugin'],
        functions: {
          functionA: {},
        },
        resources: {},
        package: {
          exclude: ['exclude-me'],
          include: ['include-me'],
          artifact: 'some/path/foo.zip',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYml));

      serverless.config.update({ servicePath: tmpDirPath });
      serverless.pluginManager.cliOptions = {
        stage: 'dev',
      };

      return serverless.init().then(() => {
        expect(loadAllPluginsStub.calledOnce).to.equal(true);
        expect(updateAutocompleteCacheFileStub.calledOnce).to.equal(true);
      });
    });
  });

  describe('#run()', () => {
    let logStatStub;
    let displayHelpStub;
    let validateCommandStub;
    let populateServiceStub;
    let runStub;

    beforeEach(() => {
      serverless.cli = new CLI(serverless);
      serverless.processedInput = { commands: [], options: {} };
      // setup default stubs
      logStatStub = sinon
        .stub(serverless.utils, 'logStat').resolves();
      displayHelpStub = sinon
        .stub(serverless.cli, 'displayHelp').returns(false);
      validateCommandStub = sinon
        .stub(serverless.pluginManager, 'validateCommand').returns();
      populateServiceStub = sinon
        .stub(serverless.variables, 'populateService').resolves();
      runStub = sinon
        .stub(serverless.pluginManager, 'run').resolves();
    });

    afterEach(() => {
      serverless.utils.logStat.restore();
      serverless.cli.displayHelp.restore();
      serverless.pluginManager.validateCommand.restore();
      serverless.variables.populateService.restore();
      serverless.pluginManager.run.restore();
    });

    it('should resolve if the stats logging call throws an error / is rejected', () => {
      // overwrite logStatStub
      logStatStub.returns(BbPromise.reject());

      return serverless.run().then(() => {
        expect(logStatStub.calledOnce).to.equal(true);
        expect(displayHelpStub.calledOnce).to.equal(true);
        expect(validateCommandStub.calledOnce).to.equal(true);
        expect(populateServiceStub.calledOnce).to.equal(true);
        expect(runStub.calledOnce).to.equal(true);
        return BbPromise.resolve();
      });
    });

    it('should resolve if help is displayed or no commands are entered', () => {
      // overwrite displayHelpStub
      displayHelpStub.returns(true);

      return serverless.run().then(() => {
        expect(logStatStub.calledOnce).to.equal(true);
        expect(displayHelpStub.calledOnce).to.equal(true);
        expect(validateCommandStub.calledOnce).to.equal(false);
        expect(populateServiceStub.calledOnce).to.equal(false);
        expect(runStub.calledOnce).to.equal(false);
      });
    });

    it('should run all the needed functions', () =>
      serverless.run().then(() => {
        expect(logStatStub.calledOnce).to.equal(true);
        expect(displayHelpStub.calledOnce).to.equal(true);
        expect(validateCommandStub.calledOnce).to.equal(true);
        expect(populateServiceStub.calledOnce).to.equal(true);
        expect(runStub.calledOnce).to.equal(true);
      })
    );
  });

  describe('#setProvider()', () => {
    class ProviderMock {}

    it('should set the provider object in the provider object', () => {
      const myProvider = new ProviderMock();

      serverless.setProvider('myProvider', myProvider);

      expect(serverless.providers.myProvider).to.equal(myProvider);
    });
  });

  describe('#getProvider()', () => {
    class ProviderMock {}
    let myProvider;

    beforeEach(() => {
      myProvider = new ProviderMock();
      serverless.setProvider('myProvider', myProvider);
    });

    it('should return the provider object', () => {
      const retrivedProvider = serverless.getProvider('myProvider');

      expect(retrivedProvider).to.deep.equal(myProvider);
    });
  });

  describe('#getVersion()', () => {
    it('should get the correct Serverless version', () => {
      expect(semverRegex().test(serverless.getVersion())).to.equal(true);
    });
  });
});
