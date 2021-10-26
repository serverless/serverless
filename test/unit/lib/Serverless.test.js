'use strict';

const chai = require('chai');

chai.use(require('chai-as-promised'));

const { expect } = chai;

const Serverless = require('../../../lib/Serverless');
const semverRegex = require('semver-regex');
const path = require('path');
const sinon = require('sinon');
const BbPromise = require('bluebird');

const YamlParser = require('../../../lib/classes/YamlParser');
const PluginManager = require('../../../lib/classes/PluginManager');
const Utils = require('../../../lib/classes/Utils');
const Service = require('../../../lib/classes/Service');
const ConfigSchemaHandler = require('../../../lib/classes/ConfigSchemaHandler');
const CLI = require('../../../lib/classes/CLI');
const ServerlessError = require('../../../lib/serverless-error');
const conditionallyLoadDotenv = require('../../../lib/cli/conditionally-load-dotenv');
const runServerless = require('../../utils/run-serverless');
const fixtures = require('../../fixtures/programmatic');
const fsp = require('fs').promises;

describe('Serverless', () => {
  let serverless;

  beforeEach(() => {
    serverless = new Serverless({ commands: ['print'], options: {}, serviceDir: null });
  });

  describe('#constructor()', () => {
    it('should set the correct config if a config object is passed', () => {
      const configObj = { some: 'config', commands: [], options: {} };
      const serverlessWithConfig = new Serverless(configObj);

      expect(serverlessWithConfig.config.some).to.equal('config');
    });

    it('should set an empty config object if no config object passed', () => {
      expect(Object.keys(serverless.config)).to.include('serverless');
      expect(Object.keys(serverless.config)).to.include('serverlessPath');
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

  describe('#run()', () => {
    let displayHelpStub;
    let validateCommandStub;
    let populateServiceStub;
    let runStub;

    beforeEach(() => {
      serverless.cli = new CLI(serverless);
      serverless.processedInput = { commands: [], options: {} };
      // setup default stubs
      displayHelpStub = sinon.stub(serverless.cli, 'displayHelp').returns(false);
      validateCommandStub = sinon.stub(serverless.pluginManager, 'validateCommand').returns();
      populateServiceStub = sinon.stub(serverless.variables, 'populateService').resolves();
      runStub = sinon.stub(serverless.pluginManager, 'run').resolves();
    });

    afterEach(() => {
      serverless.cli.displayHelp.restore();
      serverless.pluginManager.validateCommand.restore();
      serverless.variables.populateService.restore();
      serverless.pluginManager.run.restore();
    });

    it('should resolve if the stats logging call throws an error / is rejected', () => {
      return serverless.run().then(() => {
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
        expect(displayHelpStub.calledOnce).to.equal(true);
        expect(validateCommandStub.calledOnce).to.equal(false);
        expect(populateServiceStub.calledOnce).to.equal(false);
        expect(runStub.calledOnce).to.equal(false);
      });
    });

    it('should run all the needed functions', () =>
      serverless.run().then(() => {
        expect(displayHelpStub.calledOnce).to.equal(true);
        expect(validateCommandStub.calledOnce).to.equal(true);
        expect(populateServiceStub.calledOnce).to.equal(true);
        expect(runStub.calledOnce).to.equal(true);
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

describe('test/unit/lib/Serverless.test.js', () => {
  describe('When local version available', () => {
    describe('When running global version', () => {
      it('Should fallback to local version when it is found and "enableLocalInstallationFallback" is not set', () =>
        runServerless({
          fixture: 'locallyInstalledServerless',
          command: 'print',
          modulesCacheStub: {},
        }).then(({ serverless }) => {
          expect(Array.from(serverless.triggeredDeprecations)).to.deep.equal([]);
          expect(serverless._isInvokedByGlobalInstallation).to.be.true;
          expect(serverless.isLocallyInstalled).to.be.true;
          expect(serverless.isLocalStub).to.be.true;
        }));

      it('Should report deprecation notice when "enableLocalInstallationFallback" is set', async () =>
        expect(
          runServerless({
            fixture: 'locallyInstalledServerless',
            configExt: { enableLocalInstallationFallback: false },
            command: 'print',
            modulesCacheStub: {},
          })
        ).to.eventually.be.rejected.and.have.property(
          'code',
          'REJECTED_DEPRECATION_DISABLE_LOCAL_INSTALLATION_FALLBACK_SETTING'
        ));

      it('Should not fallback to local when "enableLocalInstallationFallback" set to false', async () => {
        const { serverless } = await runServerless({
          fixture: 'locallyInstalledServerless',
          configExt: {
            disabledDeprecations: 'DISABLE_LOCAL_INSTALLATION_FALLBACK_SETTING',
            enableLocalInstallationFallback: false,
          },
          command: 'print',
          modulesCacheStub: {},
        });
        expect(serverless.invokedInstance).to.not.exist;
      });

      it('Should fallback to local version when "enableLocalInstallationFallback" set to true', () =>
        runServerless({
          fixture: 'locallyInstalledServerless',
          configExt: {
            disabledDeprecations: 'DISABLE_LOCAL_INSTALLATION_FALLBACK_SETTING',
            enableLocalInstallationFallback: true,
          },
          command: 'print',
          modulesCacheStub: {},
        }).then(({ serverless }) => {
          expect(Array.from(serverless.triggeredDeprecations)).to.deep.equal([
            'DISABLE_LOCAL_INSTALLATION_FALLBACK_SETTING',
          ]);
          expect(serverless._isInvokedByGlobalInstallation).to.be.true;
          expect(serverless.isLocallyInstalled).to.be.true;
          expect(serverless.isLocalStub).to.be.true;
        }));
    });

    describe('When running local version', () => {
      it('Should run without notice', () =>
        fixtures.setup('locallyInstalledServerless').then(({ servicePath: serviceDir }) =>
          runServerless({
            serverlessDir: path.resolve(serviceDir, 'node_modules/serverless'),
            cwd: serviceDir,
            command: 'print',
          }).then(({ serverless }) => {
            expect(Array.from(serverless.triggeredDeprecations)).to.not.include(
              'DISABLE_LOCAL_INSTALLATION_FALLBACK_SETTING'
            );
            expect(serverless._isInvokedByGlobalInstallation).to.be.false;
            expect(serverless.isLocallyInstalled).to.be.true;
            expect(serverless.isLocalStub).to.be.true;
          })
        ));
    });
  });

  describe('When local version not available', () => {
    it('Should run without notice', () =>
      runServerless({ fixture: 'aws', command: 'print', modulesCacheStub: {} }).then(
        ({ serverless }) => {
          expect(Array.from(serverless.triggeredDeprecations)).to.deep.equal([]);
          expect(serverless._isInvokedByGlobalInstallation).to.be.false;
          expect(serverless.isLocallyInstalled).to.be.false;
          expect(serverless.isLocalStub).to.not.exist;
        }
      ));
  });

  describe('When .env file is available', () => {
    let serviceDir;

    before(async () => {
      serviceDir = (
        await fixtures.setup('function', {
          configExt: {
            useDotenv: true,
            custom: {
              fromDefaultEnv: '${env:DEFAULT_ENV_VARIABLE}',
              fromStageEnv: "${env:STAGE_ENV_VARIABLE, 'not-found'}",
              fromDefaultExpandedEnv: '${env:DEFAULT_ENV_VARIABLE_EXPANDED}',
            },
          },
        })
      ).servicePath;

      const defaultFileContent = `
        DEFAULT_ENV_VARIABLE=valuefromdefault
        DEFAULT_ENV_VARIABLE_EXPANDED=$DEFAULT_ENV_VARIABLE/expanded
      `;
      await fsp.writeFile(path.join(serviceDir, '.env'), defaultFileContent);
      conditionallyLoadDotenv.clear();
    });

    it('Should load environment variables from default .env file if no matching stage', async () => {
      const result = await runServerless({
        cwd: serviceDir,
        command: 'package',
        shouldUseLegacyVariablesResolver: true,
      });

      expect(result.serverless.service.custom.fromDefaultEnv).to.equal('valuefromdefault');
      expect(result.serverless.service.custom.fromDefaultExpandedEnv).to.equal(
        'valuefromdefault/expanded'
      );
      expect(result.serverless.service.custom.fromStageEnv).to.equal('not-found');
    });
  });

  describe('Legacy API interface', () => {
    let serverless;

    before(async () => {
      ({ serverless } = await runServerless({
        fixture: 'aws',
        command: 'package',
      }));
    });

    it('Ensure that instance is setup', async () => {
      expect(serverless.variables).to.have.property('variableSyntax');
    });

    it('Ensure config.servicePath', async () => {
      expect(serverless.config).to.have.property('servicePath');
    });
  });
});
