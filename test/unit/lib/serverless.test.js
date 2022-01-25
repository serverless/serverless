'use strict';

const chai = require('chai');

chai.use(require('chai-as-promised'));

const { expect } = chai;

const Serverless = require('../../../lib/serverless');
const semverRegex = require('semver-regex');

const YamlParser = require('../../../lib/classes/yaml-parser');
const PluginManager = require('../../../lib/classes/plugin-manager');
const Utils = require('../../../lib/classes/utils');
const Service = require('../../../lib/classes/service');
const ConfigSchemaHandler = require('../../../lib/classes/config-schema-handler');
const CLI = require('../../../lib/classes/cli');
const ServerlessError = require('../../../lib/serverless-error');
const runServerless = require('../../utils/run-serverless');

describe('Serverless', () => {
  let serverless;

  beforeEach(() => {
    serverless = new Serverless({ commands: ['print'], options: {}, serviceDir: null });
  });

  describe('#constructor()', () => {
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

    it('should set the ConfigSchemaHandler class instance', () => {
      expect(serverless.configSchemaHandler).to.be.instanceof(ConfigSchemaHandler);
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

    it('should store the ConfigSchemaHandler class inside the classes object', () => {
      expect(serverless.classes.ConfigSchemaHandler).to.deep.equal(ConfigSchemaHandler);
    });

    it('should store the Error class inside the classes object', () => {
      expect(serverless.classes.Error).to.deep.equal(ServerlessError);
    });
  });

  describe('#init()', () => {
    it('should set an instanceId', () =>
      serverless.init().then(() => {
        expect(serverless.instanceId).to.match(/\d/);
      }));

    it('should create a new CLI instance', () =>
      serverless.init().then(() => {
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
    it('should receive the processed input form the CLI instance', () =>
      serverless.init().then(() => {
        expect(serverless.processedInput).to.not.deep.equal({});
      }));
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

describe('test/unit/lib/serverless.test.js', () => {
  describe('Legacy API interface', () => {
    let serverless;

    before(async () => {
      ({ serverless } = await runServerless({
        fixture: 'aws',
        command: 'package',
      }));
    });

    it('Ensure that instance is setup', async () => {
      expect(serverless.variables).to.have.property('service');
    });

    it('Ensure config.servicePath', async () => {
      expect(serverless.config).to.have.property('servicePath');
    });
  });
});
