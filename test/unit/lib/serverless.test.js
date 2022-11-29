'use strict';

const chai = require('chai');
const sinon = require('sinon');

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

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

  describe('Extend configuration', () => {
    let serverless;
    let parseEntriesStub;

    before(async () => {
      parseEntriesStub = sinon.stub().returns(new Map([]));
      try {
        await runServerless({
          noService: true,
          command: 'info',
          modulesCacheStub: {
            './lib/configuration/variables/resolve-meta': {
              parseEntries: parseEntriesStub,
            },
          },
          hooks: {
            beforeInstanceInit: (serverlessInstance) => {
              serverless = serverlessInstance;
              throw Error('Stop serverless before init.');
            },
          },
        });
      } catch (error) {
        // Not an error
      }

      serverless.pluginManager = sinon.createStubInstance(PluginManager);
      serverless.classes.CLI = sinon.stub(serverless.classes.CLI);
    });

    after(() => {
      sinon.restore();
    });

    beforeEach(async () => {
      serverless.isConfigurationExtendable = true;
      serverless.variablesMeta = new Map([]);
    });

    it('Should add configuration path if it not exists', async () => {
      const initialConfig = {
        'pre-existing': {
          path: true,
        },
      };

      const path = 'path.to.insert';
      const value = {
        newKey: 'value',
      };
      serverless.configurationInput = JSON.parse(JSON.stringify(initialConfig));
      serverless.extendConfiguration(path.split('.'), value);

      expect(serverless.configurationInput).to.deep.include(initialConfig);
      expect(serverless.configurationInput).to.deep.nested.include({ [path]: value });
    });

    it('Should assign configuration object if it exists', async () => {
      const path = 'pre-existing';
      const initialConfig = {
        [path]: {
          path: true,
        },
      };

      const value = {
        newKey: 'value',
      };
      serverless.configurationInput = JSON.parse(JSON.stringify(initialConfig));
      serverless.extendConfiguration(path.split('.'), value);

      expect(serverless.configurationInput[path]).to.deep.include(value);
    });

    it('Should assign trivial types', async () => {
      const path = 'pre-existing';
      const initialConfig = {
        [path]: 'some string',
      };
      const value = 'other string';
      serverless.configurationInput = JSON.parse(JSON.stringify(initialConfig));
      serverless.extendConfiguration(path.split('.'), value);
      expect(serverless.configurationInput[path]).to.equal(value);
    });

    it('Should deeply copy the new value', async () => {
      const path = 'level1';
      const subpath = 'level2';
      const subvalue = {
        level3: 'copy',
      };
      const value = {
        [subpath]: subvalue,
      };
      serverless.configurationInput = {};
      serverless.extendConfiguration(path.split('.'), value);

      expect(serverless.configurationInput[path]).to.not.equal(value);
      expect(serverless.configurationInput[path][subpath]).to.not.equal(subvalue);
    });

    it('Should clean variables meta in configurationPath', async () => {
      const path = 'path.to.insert';
      const value = {
        newKey: 'value',
      };
      serverless.configurationInput = {};
      const metaToKeep = ['path.to.keep'].map((_) => _.replace(/\./g, '\0'));
      const metaToDelete = [path, `${path}.child`].map((_) => _.replace(/\./g, '\0'));
      const variablesMeta = metaToKeep.concat(metaToDelete);

      const keyStub = sinon.stub(serverless.variablesMeta, 'keys');
      keyStub.returns(variablesMeta);

      const deleteStub = sinon.stub(serverless.variablesMeta, 'delete');

      serverless.extendConfiguration(path.split('.'), value);

      metaToDelete.forEach((meta) => {
        expect(deleteStub).to.have.been.calledWith(meta);
      });
    });

    it('Should throw if called after init', async () => {
      let localServerless;
      await runServerless({
        config: {
          service: 'test',
          provider: {
            name: 'aws',
          },
        },
        command: 'print',
        hooks: {
          beforeInstanceInit: (serverlessInstance) => {
            localServerless = serverlessInstance;
            const { hooks: lifecycleHooks } = serverlessInstance.pluginManager;
            for (const hookName of Object.keys(lifecycleHooks)) {
              delete lifecycleHooks[hookName];
            }
          },
        },
      });
      expect(() => localServerless.extendConfiguration([], {})).to.throw(ServerlessError);
    });
  });
});
