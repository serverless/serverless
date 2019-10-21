'use strict';

/* eslint-disable no-unused-expressions */

const chai = require('chai');
const overrideEnv = require('process-utils/override-env');
const cjsResolve = require('ncjsm/resolve/sync');
const spawn = require('child-process-ext/spawn');
const resolveAwsEnv = require('@serverless/test/resolve-env');
const Serverless = require('../../lib/Serverless');
const CLI = require('../../lib/classes/CLI');
const Create = require('../../lib/plugins/create/create');

const _ = require('lodash');
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const mockRequire = require('mock-require');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const BbPromise = require('bluebird');
const getCacheFilePath = require('../utils/getCacheFilePath');
const { installPlugin } = require('../../tests/utils/plugins');
const { getTmpDirPath } = require('../../tests/utils/fs');

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

const expect = chai.expect;

describe('PluginManager', () => {
  const env = resolveAwsEnv();
  let pluginManager;
  let serverless;

  class ServicePluginMock1 {}

  class ServicePluginMock2 {}

  class EnterprisePluginMock {}

  const brokenPluginError = new Error('Broken plugin');
  class BrokenPluginMock {
    constructor() {
      throw brokenPluginError;
    }
  }

  class Provider1PluginMock {
    constructor() {
      this.provider = 'provider1';

      this.commands = {
        deploy: {
          lifecycleEvents: ['resources'],
        },
      };

      this.hooks = {
        'deploy:functions': this.functions.bind(this),
      };

      // used to test if the function was executed correctly
      this.deployedFunctions = 0;
    }

    functions() {
      this.deployedFunctions = this.deployedFunctions + 1;
    }
  }

  class Provider2PluginMock {
    constructor() {
      this.provider = 'provider2';

      this.commands = {
        deploy: {
          lifecycleEvents: ['resources'],
        },
      };

      this.hooks = {
        'deploy:functions': this.functions.bind(this),
      };

      // used to test if the function was executed correctly
      this.deployedFunctions = 0;
    }

    functions() {
      this.deployedFunctions = this.deployedFunctions + 1;
    }
  }

  class PromisePluginMock {
    constructor() {
      this.commands = {
        deploy: {
          usage: 'Deploy to the default infrastructure',
          lifecycleEvents: ['resources', 'functions'],
          options: {
            resource: {
              usage: 'The resource you want to deploy (e.g. --resource db)',
            },
            function: {
              usage: 'The function you want to deploy (e.g. --function create)',
            },
          },
          commands: {
            onpremises: {
              usage: 'Deploy to your On-Premises infrastructure',
              lifecycleEvents: ['resources', 'functions'],
              options: {
                resource: {
                  usage: 'The resource you want to deploy (e.g. --resource db)',
                },
                function: {
                  usage: 'The function you want to deploy (e.g. --function create)',
                },
              },
            },
          },
        },
      };

      this.hooks = {
        'deploy:functions': this.functions.bind(this),
        'before:deploy:onpremises:functions': this.resources.bind(this),
      };

      // used to test if the function was executed correctly
      this.deployedFunctions = 0;
      this.deployedResources = 0;
    }

    functions() {
      return new BbPromise(resolve => {
        this.deployedFunctions = this.deployedFunctions + 1;
        return resolve();
      });
    }

    resources() {
      return new BbPromise(resolve => {
        this.deployedResources = this.deployedResources + 1;
        return resolve();
      });
    }
  }

  class SynchronousPluginMock {
    constructor() {
      this.commands = {
        deploy: {
          usage: 'Deploy to the default infrastructure',
          lifecycleEvents: ['resources', 'functions'],
          options: {
            resource: {
              usage: 'The resource you want to deploy (e.g. --resource db)',
            },
            function: {
              usage: 'The function you want to deploy (e.g. --function create)',
            },
          },
          commands: {
            onpremises: {
              usage: 'Deploy to your On-Premises infrastructure',
              lifecycleEvents: ['resources', 'functions'],
              options: {
                resource: {
                  usage: 'The resource you want to deploy (e.g. --resource db)',
                },
                function: {
                  usage: 'The function you want to deploy (e.g. --function create)',
                },
              },
            },
          },
        },
      };

      this.hooks = {
        'deploy:functions': this.functions.bind(this),
        'before:deploy:onpremises:functions': this.resources.bind(this),
      };

      // used to test if the function was executed correctly
      this.deployedFunctions = 0;
      this.deployedResources = 0;
    }

    functions() {
      this.deployedFunctions = this.deployedFunctions + 1;
    }

    resources() {
      this.deployedResources = this.deployedResources + 1;
    }
  }

  class AliasPluginMock {
    constructor() {
      this.commands = {
        deploy: {
          usage: 'Deploy to the default infrastructure',
          lifecycleEvents: ['resources', 'functions'],
          options: {
            resource: {
              usage: 'The resource you want to deploy (e.g. --resource db)',
            },
            function: {
              usage: 'The function you want to deploy (e.g. --function create)',
            },
          },
          commands: {
            onpremises: {
              usage: 'Deploy to your On-Premises infrastructure',
              lifecycleEvents: ['resources', 'functions'],
              aliases: ['on:premise', 'premise'],
              options: {
                resource: {
                  usage: 'The resource you want to deploy (e.g. --resource db)',
                },
                function: {
                  usage: 'The function you want to deploy (e.g. --function create)',
                },
              },
            },
          },
        },
      };

      this.hooks = {
        'deploy:functions': this.functions.bind(this),
        'before:deploy:onpremises:functions': this.resources.bind(this),
      };

      // used to test if the function was executed correctly
      this.deployedFunctions = 0;
      this.deployedResources = 0;
    }

    functions() {
      this.deployedFunctions = this.deployedFunctions + 1;
    }

    resources() {
      this.deployedResources = this.deployedResources + 1;
    }
  }

  class EntrypointPluginMock {
    constructor() {
      this.commands = {
        myep: {
          type: 'entrypoint',
          lifecycleEvents: ['initialize', 'finalize'],
          commands: {
            // EP, not public command because its parent is decalred as EP
            mysubep: {
              lifecycleEvents: ['initialize', 'finalize'],
            },
            // EP that will spawn sub lifecycles
            spawnep: {
              lifecycleEvents: ['event1', 'event2'],
            },
          },
        },
        // public command
        mycmd: {
          lifecycleEvents: ['run'],
          commands: {
            // public subcommand
            mysubcmd: {
              lifecycleEvents: ['initialize', 'finalize'],
            },
            // command that will spawn sub lifecycles
            spawncmd: {
              lifecycleEvents: ['event1', 'event2'],
            },
            spawnep: {
              type: 'entrypoint',
              lifecycleEvents: ['event1', 'event2'],
            },
          },
        },
      };

      this.hooks = {
        'myep:initialize': this.initialize.bind(this),
        'myep:finalize': this.finalize.bind(this),
        'myep:mysubep:initialize': this.subEPInitialize.bind(this),
        'myep:mysubep:finalize': this.subEPFinalize.bind(this),
        'mycmd:mysubcmd:initialize': this.subInitialize.bind(this),
        'mycmd:mysubcmd:finalize': this.subFinalize.bind(this),
        'mycmd:run': this.run.bind(this),
        // Event1 spawns mysubcmd, then myep
        // Event2 spawns mycmd, then mysubep
        'myep:spawnep:event1': () =>
          pluginManager.spawn(['mycmd', 'mysubcmd']).then(() => pluginManager.spawn(['myep'])),
        'myep:spawnep:event2': () =>
          pluginManager.spawn(['mycmd']).then(() => pluginManager.spawn(['myep', 'mysubep'])),
        'mycmd:spawncmd:event1': () =>
          pluginManager.spawn(['mycmd', 'mysubcmd']).then(() => pluginManager.spawn(['myep'])),
        'mycmd:spawncmd:event2': () =>
          pluginManager.spawn(['mycmd']).then(() => pluginManager.spawn(['myep', 'mysubep'])),
      };

      this.callResult = '';
    }

    initialize() {
      this.callResult += '>initialize';
    }

    finalize() {
      this.callResult += '>finalize';
    }

    subEPInitialize() {
      this.callResult += '>subEPInitialize';
    }

    subEPFinalize() {
      this.callResult += '>subEPFinalize';
    }

    subInitialize() {
      this.callResult += '>subInitialize';
    }

    subFinalize() {
      this.callResult += '>subFinalize';
    }

    run() {
      this.callResult += '>run';
    }
  }

  class ContainerPluginMock {
    constructor() {
      this.commands = {
        // not a public command because its declared as a Container
        mycontainer: {
          type: 'container',
          commands: {
            // public command because its children of a container
            mysubcmd: {
              lifecycleEvents: ['event1', 'event2'],
            },
          },
        },
      };

      this.hooks = {
        'mycontainer:mysubcmd:event1': this.eventOne.bind(this),
        'mycontainer:mysubcmd:event2': this.eventTwo.bind(this),
      };

      this.callResult = '';
    }

    eventOne() {
      this.callResult += '>mysubcmdEvent1';
    }

    eventTwo() {
      this.callResult += '>mysubcmdEvent2';
    }
  }

  class DeprecatedLifecycleEventsPluginMock {
    constructor() {
      this.hooks = {
        'deprecated:deprecated': this.deprecated, // NOTE: we assume that this is deprecated
        'untouched:untouched': this.untouched,
      };
    }

    deprecated() {
      return;
    }

    untouched() {
      return;
    }
  }

  const resolveStub = (directory, pluginPath) => {
    switch (pluginPath) {
      case 'BrokenPluginMock':
      case 'ServicePluginMock1':
      case 'ServicePluginMock2':
        return { realPath: pluginPath };
      case './RelativePath/ServicePluginMock2':
        return { realPath: `${servicePath}/RelativePath/ServicePluginMock2` };
      default:
        return cjsResolve(directory, pluginPath);
    }
  };

  let restoreEnv;
  let servicePath;
  let PluginManager = proxyquire('../../lib/classes/PluginManager', {
    'ncjsm/resolve/sync': resolveStub,
  });

  beforeEach(() => {
    ({ restoreEnv } = overrideEnv({ whitelist: ['APPDATA', 'PATH'] }));
    serverless = new Serverless();
    serverless.cli = new CLI();
    serverless.processedInput = { commands: [], options: {} };
    pluginManager = new PluginManager(serverless);
    servicePath = pluginManager.serverless.config.servicePath = 'foo';
  });

  afterEach(() => restoreEnv());

  describe('#constructor()', () => {
    it('should set the serverless instance', () => {
      expect(pluginManager.serverless).to.deep.equal(serverless);
    });

    it('should create an empty cliOptions object', () => {
      expect(pluginManager.cliOptions).to.deep.equal({});
    });

    it('should create an empty cliCommands array', () => {
      expect(pluginManager.cliCommands.length).to.equal(0);
    });

    it('should create an empty plugins array', () => {
      expect(pluginManager.plugins.length).to.equal(0);
    });

    it('should create an empty commands object', () => {
      expect(pluginManager.commands).to.deep.equal({});
    });
  });

  describe('#setCliOptions()', () => {
    it('should set the cliOptions object', () => {
      const options = { foo: 'bar' };
      pluginManager.setCliOptions(options);

      expect(pluginManager.cliOptions).to.deep.equal(options);
    });
  });

  describe('#setCliCommands()', () => {
    it('should set the cliCommands array', () => {
      const commands = ['foo', 'bar'];
      pluginManager.setCliCommands(commands);

      expect(pluginManager.cliCommands).to.equal(commands);
    });
  });

  describe('#updateAutocompleteCacheFile()', () => {
    let writeFileStub;
    let cacheFilePath;
    let getCommandsStub;

    beforeEach(() => {
      writeFileStub = sinon.stub().returns(BbPromise.resolve());
      PluginManager = proxyquire('./PluginManager.js', {
        '../utils/fs/writeFile': writeFileStub,
        'ncjsm/resolve/sync': resolveStub,
      });
      pluginManager = new PluginManager(serverless);
      pluginManager.serverless.config = { servicePath: 'somePath' };
      servicePath = pluginManager.serverless.config.servicePath;
      cacheFilePath = getCacheFilePath(servicePath);
      getCommandsStub = sinon.stub(pluginManager, 'getCommands');
    });

    afterEach(() => {
      pluginManager.getCommands.restore();
    });

    it('should update autocomplete cache file', () => {
      const commandsMock = {
        deploy: {
          options: {
            stage: {},
          },
          commands: {
            function: {},
          },
        },
        invoke: {
          options: {
            region: {},
          },
          commands: {
            local: {},
          },
        },
        remove: {},
      };
      const expectedCommands = {
        deploy: ['--stage', 'function'],
        invoke: ['--region', 'local'],
        remove: [],
      };
      getCommandsStub.returns(commandsMock);

      return pluginManager.updateAutocompleteCacheFile().then(() => {
        expect(getCommandsStub.calledOnce).to.equal(true);
        expect(writeFileStub.calledOnce).to.equal(true);
        expect(writeFileStub.getCall(0).args[0]).to.equal(cacheFilePath);
        expect(writeFileStub.getCall(0).args[1].commands).to.deep.equal(expectedCommands);
        expect(typeof writeFileStub.getCall(0).args[1].validationHash).to.equal('string');
      });
    });
  });

  describe('#convertShortcutsIntoOptions()', () => {
    it('should convert shortcuts into options when a one level deep command matches', () => {
      const cliOptionsMock = { r: 'eu-central-1', region: 'us-east-1' };
      const cliCommandsMock = ['deploy']; // command with one level deepness
      const commandMock = {
        options: {
          region: {
            shortcut: 'r',
          },
        },
      };
      pluginManager.setCliCommands(cliCommandsMock);
      pluginManager.setCliOptions(cliOptionsMock);

      pluginManager.convertShortcutsIntoOptions(commandMock);

      expect(pluginManager.cliOptions.region).to.equal(cliOptionsMock.r);
    });

    it('should not convert shortcuts into options when the shortcut is not given', () => {
      const cliOptionsMock = { r: 'eu-central-1', region: 'us-east-1' };
      const cliCommandsMock = ['deploy'];
      const commandMock = {
        options: {
          region: {},
        },
      };
      pluginManager.setCliCommands(cliCommandsMock);
      pluginManager.setCliOptions(cliOptionsMock);

      pluginManager.convertShortcutsIntoOptions(commandMock);

      expect(pluginManager.cliOptions.region).to.equal(cliOptionsMock.region);
    });
  });

  describe('#addPlugin()', () => {
    it('should add a plugin instance to the plugins array', () => {
      pluginManager.addPlugin(SynchronousPluginMock);

      expect(pluginManager.plugins[0]).to.be.instanceof(SynchronousPluginMock);
    });

    it('should not load plugins twice', () => {
      pluginManager.addPlugin(SynchronousPluginMock);
      pluginManager.addPlugin(SynchronousPluginMock);

      expect(pluginManager.plugins[0]).to.be.instanceof(SynchronousPluginMock);
      expect(pluginManager.plugins.length).to.equal(1);
    });

    it('should load two plugins that happen to have the same class name', () => {
      function getFirst() {
        return class PluginMock {};
      }

      function getSecond() {
        return class PluginMock {};
      }

      const first = getFirst();
      const second = getSecond();

      pluginManager.addPlugin(first);
      pluginManager.addPlugin(second);

      expect(pluginManager.plugins[0]).to.be.instanceof(first);
      expect(pluginManager.plugins[1]).to.be.instanceof(second);
      expect(pluginManager.plugins.length).to.equal(2);
    });

    it('should load the plugin commands', () => {
      pluginManager.addPlugin(SynchronousPluginMock);

      expect(pluginManager.commands).to.have.property('deploy');
    });

    it('should skip service related plugins which not match the services provider', () => {
      pluginManager.serverless.service.provider.name = 'someProvider';
      class Plugin {
        constructor() {
          this.provider = 'someOtherProvider';
        }
      }

      pluginManager.addPlugin(Plugin);

      expect(pluginManager.plugins.length).to.equal(0);
    });

    it('should add service related plugins when provider property is the providers name', () => {
      pluginManager.serverless.service.provider.name = 'someProvider';
      class Plugin {
        constructor() {
          this.provider = 'someProvider';
        }
      }

      pluginManager.addPlugin(Plugin);

      expect(pluginManager.plugins[0]).to.be.an.instanceOf(Plugin);
    });

    it('should add service related plugins when provider propery is provider plugin', () => {
      pluginManager.serverless.service.provider.name = 'someProvider';
      class ProviderPlugin {
        static getProviderName() {
          return 'someProvider';
        }
      }
      const providerPlugin = new ProviderPlugin();
      class Plugin {
        constructor() {
          this.provider = providerPlugin;
        }
      }

      pluginManager.addPlugin(Plugin);

      expect(pluginManager.plugins[0]).to.be.an.instanceOf(Plugin);
    });
  });

  describe('#asyncPluginInit()', () => {
    it('should call async init on plugins that have it', () => {
      const plugin1 = new ServicePluginMock1();
      plugin1.asyncInit = sinon.stub().returns(BbPromise.resolve());
      pluginManager.plugins = [plugin1];
      return pluginManager.asyncPluginInit().then(() => {
        expect(plugin1.asyncInit.calledOnce).to.equal(true);
      });
    });
  });

  describe('#loadAllPlugins()', () => {
    beforeEach(() => {
      mockRequire('ServicePluginMock1', ServicePluginMock1);
      mockRequire('ServicePluginMock2', ServicePluginMock2);
      mockRequire('BrokenPluginMock', BrokenPluginMock);
      mockRequire('@serverless/enterprise-plugin', EnterprisePluginMock);
    });

    it('should load only core plugins when no service plugins are given', () => {
      // Note: We need the Create plugin for this test to pass
      pluginManager.loadAllPlugins();

      // note: this test will be refactored as the Create plugin will be moved
      // to another directory
      expect(pluginManager.plugins.length).to.be.above(0);
    });

    it('should load all plugins when service plugins are given', () => {
      const servicePlugins = ['ServicePluginMock1', 'ServicePluginMock2'];
      pluginManager.loadAllPlugins(servicePlugins);

      expect(pluginManager.plugins.some(plugin => plugin instanceof ServicePluginMock1)).to.equal(
        true
      );
      expect(pluginManager.plugins.some(plugin => plugin instanceof ServicePluginMock2)).to.equal(
        true
      );
      expect(pluginManager.plugins.some(plugin => plugin instanceof EnterprisePluginMock)).to.equal(
        true
      );
      // note: this test will be refactored as the Create plugin will be moved
      // to another directory
      expect(pluginManager.plugins.length).to.be.above(2);
    });

    it('should load all plugins in the correct order', () => {
      const servicePlugins = ['ServicePluginMock1', 'ServicePluginMock2'];

      pluginManager.loadAllPlugins(servicePlugins);

      const pluginIndexes = [
        pluginManager.plugins.findIndex(plugin => plugin instanceof Create),
        pluginManager.plugins.findIndex(plugin => plugin instanceof ServicePluginMock1),
        pluginManager.plugins.findIndex(plugin => plugin instanceof ServicePluginMock2),
        pluginManager.plugins.findIndex(plugin => plugin instanceof EnterprisePluginMock),
      ];
      expect(pluginIndexes).to.deep.equal(pluginIndexes.slice().sort((a, b) => a - b));
    });

    it('should load the Serverless core plugins', () => {
      pluginManager.loadAllPlugins();

      expect(pluginManager.plugins.length).to.be.above(1);
    });

    it('should throw an error when trying to load unknown plugin', () => {
      const servicePlugins = ['ServicePluginMock3', 'ServicePluginMock1'];

      expect(() => pluginManager.loadAllPlugins(servicePlugins)).to.throw(serverless.classes.Error);
    });

    it('should not throw error when trying to load unknown plugin with help flag', () => {
      const servicePlugins = ['ServicePluginMock3', 'ServicePluginMock1'];

      pluginManager.setCliOptions({ help: true });

      expect(() => pluginManager.loadAllPlugins(servicePlugins)).to.not.throw(
        serverless.classes.Error
      );
    });

    it('should pass through an error when trying to load a broken plugin', () => {
      const servicePlugins = ['BrokenPluginMock'];

      expect(() => pluginManager.loadAllPlugins(servicePlugins)).to.throw(brokenPluginError);
    });

    it('should not throw error when running the plugin commands and given plugins does not exist', () => {
      const servicePlugins = ['ServicePluginMock3'];
      const cliCommandsMock = ['plugin'];
      pluginManager.setCliCommands(cliCommandsMock);

      expect(() => pluginManager.loadAllPlugins(servicePlugins)).to.not.throw(
        serverless.classes.Error
      );
    });

    afterEach(() => {
      // eslint-disable-line prefer-arrow-callback
      mockRequire.stop('ServicePluginMock1');
      mockRequire.stop('ServicePluginMock2');
      mockRequire.stop('BrokenPluginMock');
      mockRequire.stop('@serverless/enterprise-plugin');
    });
  });

  describe('#resolveServicePlugins()', () => {
    beforeEach(() => {
      // eslint-disable-line prefer-arrow-callback
      mockRequire('ServicePluginMock1', ServicePluginMock1);
      // Plugins loaded via a relative path should be required relative to the service path
      mockRequire(`${servicePath}/RelativePath/ServicePluginMock2`, ServicePluginMock2);
    });

    it('should resolve the service plugins', () => {
      const servicePlugins = ['ServicePluginMock1', './RelativePath/ServicePluginMock2'];
      expect(pluginManager.resolveServicePlugins(servicePlugins)).to.deep.equal([
        ServicePluginMock1,
        ServicePluginMock2,
      ]);
    });

    it('should not error if plugins = null', () => {
      // Happens when `plugins` property exists but is empty
      const servicePlugins = null;
      pluginManager.resolveServicePlugins(servicePlugins);
    });

    it('should not error if plugins = undefined', () => {
      // Happens when `plugins` property does not exist
      const servicePlugins = undefined;
      pluginManager.resolveServicePlugins(servicePlugins);
    });

    afterEach(() => {
      // eslint-disable-line prefer-arrow-callback
      mockRequire.stop('ServicePluginMock1');
      mockRequire.stop('ServicePluginMock2');
    });
  });

  describe('#parsePluginsObject()', () => {
    const parsePluginsObjectAndVerifyResult = (servicePlugins, expectedResult) => {
      const result = pluginManager.parsePluginsObject(servicePlugins);
      expect(result).to.deep.equal(expectedResult);
    };

    it('should parse array object', () => {
      const servicePlugins = ['ServicePluginMock1', 'ServicePluginMock2'];

      parsePluginsObjectAndVerifyResult(servicePlugins, {
        modules: servicePlugins,
        localPath: path.join(serverless.config.servicePath, '.serverless_plugins'),
      });
    });

    it('should parse plugins object', () => {
      const servicePlugins = {
        modules: ['ServicePluginMock1', 'ServicePluginMock2'],
        localPath: './myplugins',
      };

      parsePluginsObjectAndVerifyResult(servicePlugins, {
        modules: servicePlugins.modules,
        localPath: servicePlugins.localPath,
      });
    });

    it('should parse plugins object if format is not correct', () => {
      const servicePlugins = {};

      parsePluginsObjectAndVerifyResult(servicePlugins, {
        modules: [],
        localPath: path.join(serverless.config.servicePath, '.serverless_plugins'),
      });
    });

    it('should parse plugins object if modules property is not an array', () => {
      const servicePlugins = { modules: {} };

      parsePluginsObjectAndVerifyResult(servicePlugins, {
        modules: [],
        localPath: path.join(serverless.config.servicePath, '.serverless_plugins'),
      });
    });

    it('should parse plugins object if localPath is not correct', () => {
      const servicePlugins = {
        modules: ['ServicePluginMock1', 'ServicePluginMock2'],
        localPath: {},
      };

      parsePluginsObjectAndVerifyResult(servicePlugins, {
        modules: servicePlugins.modules,
        localPath: path.join(serverless.config.servicePath, '.serverless_plugins'),
      });
    });
  });

  describe('command aliases', () => {
    describe('#getAliasCommandTarget', () => {
      it('should return an alias target', () => {
        pluginManager.aliases = {
          cmd1: {
            cmd2: {
              command: 'command1',
            },
            cmd3: {
              cmd4: {
                command: 'command2',
              },
            },
          },
        };
        expect(pluginManager.getAliasCommandTarget(['cmd1', 'cmd2'])).to.equal('command1');
        expect(pluginManager.getAliasCommandTarget(['cmd1', 'cmd3', 'cmd4'])).to.equal('command2');
      });

      it('should return undefined if alias does not exist', () => {
        pluginManager.aliases = {
          cmd1: {
            cmd2: {
              command: 'command1',
            },
            cmd3: {
              cmd4: {
                command: 'command2',
              },
            },
          },
        };
        expect(pluginManager.getAliasCommandTarget(['cmd1'])).to.be.undefined;
        expect(pluginManager.getAliasCommandTarget(['cmd1', 'cmd3'])).to.be.undefined;
      });
    });

    describe('#createCommandAlias', () => {
      it('should create an alias for a command', () => {
        pluginManager.aliases = {};
        expect(pluginManager.createCommandAlias('cmd1:alias2', 'cmd2:cmd3:cmd4')).to.not.throw;
        expect(pluginManager.createCommandAlias('cmd1:alias2:alias3', 'cmd2:cmd3:cmd5')).to.not
          .throw;
        expect(pluginManager.aliases).to.deep.equal({
          cmd1: {
            alias2: {
              command: 'cmd2:cmd3:cmd4',
              alias3: {
                command: 'cmd2:cmd3:cmd5',
              },
            },
          },
        });
      });

      it('should fail if the alias already exists', () => {
        pluginManager.aliases = {
          cmd1: {
            alias2: {
              command: 'cmd2:cmd3:cmd4',
              alias3: {
                command: 'cmd2:cmd3:cmd5',
              },
            },
          },
        };
        expect(() => pluginManager.createCommandAlias('cmd1:alias2', 'mycmd')).to.throw(
          /Alias "cmd1:alias2" is already defined/
        );
      });

      it('should fail if the alias overwrites a command', () => {
        const synchronousPluginMockInstance = new SynchronousPluginMock();
        pluginManager.loadCommands(synchronousPluginMockInstance);
        expect(() => pluginManager.createCommandAlias('deploy', 'mycmd')).to.throw(
          /Command "deploy" cannot be overriden/
        );
      });

      it('should fail if the alias overwrites the very own command', () => {
        const synchronousPluginMockInstance = new SynchronousPluginMock();
        synchronousPluginMockInstance.commands.deploy.commands.onpremises.aliases = ['deploy'];
        expect(() => pluginManager.loadCommands(synchronousPluginMockInstance)).to.throw(
          /Command "deploy" cannot be overriden/
        );
      });
    });
  });

  describe('#loadCommands()', () => {
    it('should load the plugin commands', () => {
      const synchronousPluginMockInstance = new SynchronousPluginMock();
      pluginManager.loadCommands(synchronousPluginMockInstance);

      expect(pluginManager.commands).to.have.property('deploy');
    });

    it('should merge plugin commands', () => {
      pluginManager.loadCommands({
        commands: {
          deploy: {
            lifecycleEvents: ['one'],
            options: {
              foo: {},
            },
          },
        },
      });

      pluginManager.loadCommands({
        commands: {
          deploy: {
            lifecycleEvents: ['one', 'two'],
            options: {
              bar: {},
            },
            commands: {
              fn: {},
            },
          },
        },
      });

      expect(pluginManager.commands.deploy)
        .to.have.property('options')
        .that.has.all.keys('foo', 'bar');
      expect(pluginManager.commands.deploy)
        .to.have.property('lifecycleEvents')
        .that.is.an('array')
        .that.deep.equals(['one', 'two']);
      expect(pluginManager.commands.deploy.commands).to.have.property('fn');
    });

    it('should fail if there is already an alias for a command', () => {
      pluginManager.aliases = {
        deploy: {
          command: 'my:deploy',
        },
      };

      const synchronousPluginMockInstance = new SynchronousPluginMock();
      expect(() => pluginManager.loadCommands(synchronousPluginMockInstance)).to.throw(
        /Command "deploy" cannot override an existing alias/
      );
    });

    it('should log the alias when SLS_DEBUG is set', () => {
      const consoleLogStub = sinon.stub(pluginManager.serverless.cli, 'log').returns();
      const synchronousPluginMockInstance = new SynchronousPluginMock();
      synchronousPluginMockInstance.commands.deploy.aliases = ['info'];
      _.set(process.env, 'SLS_DEBUG', '*');
      pluginManager.loadCommands(synchronousPluginMockInstance);
      expect(consoleLogStub).to.have.been.calledWith('  -> @info');
    });
  });

  describe('#loadHooks()', () => {
    let deprecatedPluginInstance;
    let consoleLogStub;

    beforeEach(() => {
      deprecatedPluginInstance = new DeprecatedLifecycleEventsPluginMock();
      pluginManager.deprecatedEvents = {
        'deprecated:deprecated': 'new:new',
      };
      consoleLogStub = sinon.stub(pluginManager.serverless.cli, 'log').returns();
    });

    afterEach(() => {
      pluginManager.deprecatedEvents = {};
      pluginManager.serverless.cli.log.restore();
    });

    it('should replace deprecated events with the new ones', () => {
      pluginManager.loadHooks(deprecatedPluginInstance);

      expect(pluginManager.hooks['deprecated:deprecated']).to.equal(undefined);
      expect(pluginManager.hooks['new:new'][0].pluginName).to.equal(
        'DeprecatedLifecycleEventsPluginMock'
      );
      expect(pluginManager.hooks['untouched:untouched'][0].pluginName).to.equal(
        'DeprecatedLifecycleEventsPluginMock'
      );
      expect(consoleLogStub.calledOnce).to.equal(false);
    });

    it('should log a debug message about deprecated when using SLS_DEBUG', () => {
      process.env.SLS_DEBUG = '1';
      pluginManager.loadHooks(deprecatedPluginInstance);

      expect(consoleLogStub.calledOnce).to.equal(true);
    });
  });

  describe('#loadVariableResolvers()', () => {
    it('should load the plugin variable resolvers with short sytnax', () => {
      class VariableResolverPlugin {
        getTestVariable() {
          return Promise.resolve('testVariable');
        }
        constructor() {
          this.variableResolvers = {
            test: this.getTestVariable,
          };
        }
      }
      pluginManager.serverless.variables = {
        variableResolvers: [],
      };
      const pluginInstance = new VariableResolverPlugin();
      pluginManager.loadVariableResolvers(pluginInstance);

      expect('test:asdfsd').to.match(pluginManager.serverless.variables.variableResolvers[0].regex);
      expect(
        pluginManager.serverless.variables.variableResolvers[0].isDisabledAtPrepopulation
      ).to.equal(false);
      expect(pluginManager.serverless.variables.variableResolvers[0].serviceName).to.equal(null);
      expect(typeof pluginManager.serverless.variables.variableResolvers[0].resolver).to.equal(
        'function'
      );
    });

    it('should load the plugin variable resolvers with long syntax', () => {
      class VariableResolverPlugin {
        getTestVariable() {
          return Promise.resolve('testVariable');
        }
        constructor() {
          this.variableResolvers = {
            test: this.getTestVariable,
          };
        }
      }
      pluginManager.serverless.variables = {
        variableResolvers: [],
      };
      const pluginInstance = new VariableResolverPlugin();
      pluginManager.loadVariableResolvers(pluginInstance);

      expect('test:asdfsd').to.match(pluginManager.serverless.variables.variableResolvers[0].regex);
      expect(
        pluginManager.serverless.variables.variableResolvers[0].isDisabledAtPrepopulation
      ).to.equal(false);
      expect(pluginManager.serverless.variables.variableResolvers[0].serviceName).to.equal(null);
      expect(typeof pluginManager.serverless.variables.variableResolvers[0].resolver).to.equal(
        'function'
      );
    });

    it('should validate the plugin variable resolvers function', () => {
      class VariableResolverPlugin {
        getTestVariable() {
          return Promise.resolve('testVariable');
        }
        constructor() {
          this.variableResolvers = {
            test: { resolver: 'not a function' },
          };
        }
      }
      pluginManager.serverless.variables = {
        variableResolvers: [],
      };
      const pluginInstance = new VariableResolverPlugin();
      expect(() => pluginManager.loadVariableResolvers(pluginInstance)).to.throw(
        "Custom variable resolver for test defined by VariableResolverPlugin specifies a resolver that isn't a function: not a function"
      );
    });

    it('should load the plugin variable resolvers name if necessary', () => {
      class VariableResolverPlugin {
        getTestVariable() {
          return Promise.resolve('testVariable');
        }
        constructor() {
          this.variableResolvers = {
            test: {
              resolver: this.getTestVariable,
              serviceName: 'test',
              isDisabledAtPrepopulation: true,
            },
          };
        }
      }
      pluginManager.serverless.variables = {
        variableResolvers: [],
      };
      const pluginInstance = new VariableResolverPlugin();
      pluginManager.loadVariableResolvers(pluginInstance);

      expect('test:asdfsd').to.match(pluginManager.serverless.variables.variableResolvers[0].regex);
      expect(
        pluginManager.serverless.variables.variableResolvers[0].isDisabledAtPrepopulation
      ).to.equal(true);
      expect(pluginManager.serverless.variables.variableResolvers[0].serviceName).to.equal('test');
      expect(typeof pluginManager.serverless.variables.variableResolvers[0].resolver).to.equal(
        'function'
      );
    });

    it('should validate the plugin variable resolvers name if necessary', () => {
      class VariableResolverPlugin {
        getTestVariable() {
          return Promise.resolve('testVariable');
        }
        constructor() {
          this.variableResolvers = {
            test: {
              resolver: this.getTestVariable,
              isDisabledAtPrepopulation: true,
            },
          };
        }
      }
      pluginManager.serverless.variables = {
        variableResolvers: [],
      };
      const pluginInstance = new VariableResolverPlugin();
      expect(() => pluginManager.loadVariableResolvers(pluginInstance)).to.throw(
        /Custom variable resolver for test defined by VariableResolverPlugin specifies isDisabledAtPrepopulation but doesn't provide a string for a name/
      );
    });
  });

  describe('#getEvents()', () => {
    beforeEach(() => {
      // eslint-disable-line prefer-arrow-callback
      pluginManager.addPlugin(SynchronousPluginMock);
    });

    it('should get all the matching events for a root level command in the correct order', () => {
      const command = pluginManager.getCommand(['deploy']);
      const events = pluginManager.getEvents(command);

      expect(events[0]).to.equal('before:deploy:resources');
      expect(events[1]).to.equal('deploy:resources');
      expect(events[2]).to.equal('after:deploy:resources');
      expect(events[3]).to.equal('before:deploy:functions');
      expect(events[4]).to.equal('deploy:functions');
      expect(events[5]).to.equal('after:deploy:functions');
    });

    it('should get all the matching events for a nested level command in the correct order', () => {
      const command = pluginManager.getCommand(['deploy', 'onpremises']);
      const events = pluginManager.getEvents(command);

      expect(events[0]).to.equal('before:deploy:onpremises:resources');
      expect(events[1]).to.equal('deploy:onpremises:resources');
      expect(events[2]).to.equal('after:deploy:onpremises:resources');
      expect(events[3]).to.equal('before:deploy:onpremises:functions');
      expect(events[4]).to.equal('deploy:onpremises:functions');
      expect(events[5]).to.equal('after:deploy:onpremises:functions');
    });
  });

  describe('#getHooks()', () => {
    beforeEach(() => {
      // eslint-disable-line prefer-arrow-callback
      pluginManager.addPlugin(SynchronousPluginMock);
    });

    it('should get hooks for an event with some registered', () => {
      expect(pluginManager.getHooks(['deploy:functions']))
        .to.be.an('Array')
        .with.length(1);
    });

    it('should have the plugin name and function on the hook', () => {
      const hooks = pluginManager.getHooks(['deploy:functions']);
      expect(hooks[0].pluginName).to.equal('SynchronousPluginMock');
      expect(hooks[0].hook).to.be.a('Function');
    });

    it('should not get hooks for an event that does not have any', () => {
      expect(pluginManager.getHooks(['deploy:resources']))
        .to.be.an('Array')
        .with.length(0);
    });

    it('should accept a single event in place of an array', () => {
      expect(pluginManager.getHooks('deploy:functions'))
        .to.be.an('Array')
        .with.length(1);
    });
  });

  describe('#getPlugins()', () => {
    beforeEach(() => {
      // eslint-disable-line prefer-arrow-callback
      mockRequire('ServicePluginMock1', ServicePluginMock1);
      mockRequire('ServicePluginMock2', ServicePluginMock2);
    });

    it('should return all loaded plugins', () => {
      const servicePlugins = ['ServicePluginMock1', 'ServicePluginMock2'];
      pluginManager.loadAllPlugins(servicePlugins);

      const plugins = pluginManager.getPlugins();
      expect(plugins.length).to.be.above(3);
      expect(plugins.some(plugin => plugin instanceof ServicePluginMock1)).to.be.true;
      expect(plugins.some(plugin => plugin instanceof ServicePluginMock2)).to.be.true;
    });

    afterEach(() => {
      // eslint-disable-line prefer-arrow-callback
      mockRequire.stop('ServicePluginMock1');
      mockRequire.stop('ServicePluginMock2');
    });
  });

  describe('#validateCommand()', () => {
    it('should find commands', () => {
      pluginManager.addPlugin(EntrypointPluginMock);

      expect(() => pluginManager.validateCommand(['mycmd', 'mysubcmd'])).to.not.throw(
        serverless.classes.Error
      );
    });

    it('should find container children commands', () => {
      pluginManager.addPlugin(ContainerPluginMock);

      expect(() => pluginManager.validateCommand(['mycontainer', 'mysubcmd'])).to.not.throw(
        serverless.classes.Error
      );
    });

    it('should throw on entrypoints', () => {
      pluginManager.addPlugin(EntrypointPluginMock);

      expect(() => pluginManager.validateCommand(['myep', 'mysubep'])).to.throw(
        /command ".*" not found/
      );
    });

    it('should throw on container', () => {
      pluginManager.addPlugin(ContainerPluginMock);

      expect(() => pluginManager.validateCommand(['mycontainer'])).to.throw(
        /command ".*" not found/
      );
    });
  });

  describe('#assignDefaultOptions()', () => {
    it('should assign default values to empty options', () => {
      pluginManager.commands = {
        foo: {
          options: {
            bar: {
              required: true,
              default: 'foo',
            },
          },
        },
      };

      const foo = pluginManager.commands.foo;
      pluginManager.assignDefaultOptions(foo);

      expect(pluginManager.cliOptions.bar).to.equal(foo.options.bar.default);
    });

    it('should not assign default values to non-empty options', () => {
      pluginManager.commands = {
        foo: {
          options: {
            bar: {
              required: true,
              default: 'foo',
            },
          },
        },
      };

      const foo = pluginManager.commands.foo;
      pluginManager.setCliOptions({ bar: 100 });
      pluginManager.assignDefaultOptions(foo);

      expect(pluginManager.cliOptions.bar).to.equal(100);
    });
  });

  describe('#validateServerlessConfigDependency()', () => {
    let serverlessInstance;
    let pluginManagerInstance;

    beforeEach(() => {
      serverlessInstance = new Serverless();
      serverlessInstance.config.servicePath = 'my-service';
      pluginManagerInstance = new PluginManager(serverlessInstance);
    });

    it('should continue loading if the configDependent property is absent', () => {
      pluginManagerInstance.serverlessConfigFile = null;

      pluginManagerInstance.commands = {
        foo: {},
      };

      const foo = pluginManagerInstance.commands.foo;

      expect(pluginManagerInstance.validateServerlessConfigDependency(foo)).to.be.undefined;
    });

    it('should load if the configDependent property is false and config is null', () => {
      pluginManagerInstance.serverlessConfigFile = null;

      pluginManagerInstance.commands = {
        foo: {
          configDependent: false,
        },
      };

      const foo = pluginManagerInstance.commands.foo;

      expect(pluginManagerInstance.validateServerlessConfigDependency(foo)).to.be.undefined;
    });

    it('should throw an error if configDependent is true and no config is found', () => {
      pluginManagerInstance.serverlessConfigFile = null;

      pluginManagerInstance.commands = {
        foo: {
          configDependent: true,
        },
      };

      const foo = pluginManagerInstance.commands.foo;

      expect(() => {
        pluginManager.validateServerlessConfigDependency(foo);
      }).to.throw(Error);
    });

    it('should throw an error if configDependent is true and config is an empty string', () => {
      pluginManagerInstance.serverlessConfigFile = '';

      pluginManagerInstance.commands = {
        foo: {
          configDependent: true,
        },
      };

      const foo = pluginManagerInstance.commands.foo;

      expect(() => {
        pluginManager.validateServerlessConfigDependency(foo);
      }).to.throw(Error);
    });

    it('should load if the configDependent property is true and config exists', () => {
      pluginManagerInstance.serverlessConfigFile = {
        servicePath: 'foo',
      };

      pluginManagerInstance.commands = {
        foo: {
          configDependent: true,
        },
      };

      const foo = pluginManagerInstance.commands.foo;

      expect(pluginManagerInstance.validateServerlessConfigDependency(foo)).to.be.undefined;
    });
  });

  describe('#validateOptions()', () => {
    it('should throw an error if a required option is not set', () => {
      pluginManager.commands = {
        foo: {
          options: {
            baz: {
              shortcut: 'b',
              required: true,
            },
          },
        },
        bar: {
          options: {
            baz: {
              required: true,
            },
          },
        },
      };

      const foo = pluginManager.commands.foo;
      const bar = pluginManager.commands.bar;

      expect(() => {
        pluginManager.validateOptions(foo);
      }).to.throw(Error);
      expect(() => {
        pluginManager.validateOptions(bar);
      }).to.throw(Error);
    });

    it('should throw an error if a customValidation is not met', () => {
      pluginManager.setCliOptions({ bar: 'dev' });

      pluginManager.commands = {
        foo: {
          options: {
            bar: {
              customValidation: {
                regularExpression: /^[0-9]+$/,
                errorMessage: 'Custom Error Message',
              },
            },
          },
        },
      };
      const command = pluginManager.commands.foo;

      expect(() => {
        pluginManager.validateOptions(command);
      }).to.throw(Error);
    });

    it('should succeeds if a custom regex matches in a plain commands object', () => {
      pluginManager.setCliOptions({ bar: 100 });

      pluginManager.commands = {
        foo: {
          options: {
            bar: {
              customValidation: {
                regularExpression: /^[0-9]+$/,
                errorMessage: 'Custom Error Message',
              },
            },
          },
        },
      };
      const commandsArray = ['foo'];

      expect(() => {
        pluginManager.validateOptions(commandsArray);
      }).to.not.throw(Error);
    });
  });

  describe('#run()', () => {
    it('should throw an error when the given command is not available', () => {
      pluginManager.addPlugin(SynchronousPluginMock);

      const commandsArray = ['foo'];

      return expect(pluginManager.run(commandsArray)).to.be.rejectedWith(Error);
    });

    it('should throw an error when the given command is an entrypoint', () => {
      pluginManager.addPlugin(EntrypointPluginMock);

      const commandsArray = ['myep'];

      expect(pluginManager.run(commandsArray)).to.be.rejectedWith(Error);
    });

    it('should throw an error when the given command is a container', () => {
      pluginManager.addPlugin(ContainerPluginMock);

      const commandsArray = ['mycontainer'];

      expect(pluginManager.run(commandsArray)).to.be.rejectedWith(Error);
    });

    it('should NOT throw an error when the given command is a child of a container', () => {
      pluginManager.addPlugin(ContainerPluginMock);

      const commandsArray = ['mycontainer', 'mysubcmd'];

      expect(pluginManager.run(commandsArray)).to.not.be.rejectedWith(Error);
    });

    it('should throw an error when the given command is a child of an entrypoint', () => {
      pluginManager.addPlugin(EntrypointPluginMock);

      const commandsArray = ['mysubcmd'];

      expect(pluginManager.run(commandsArray)).to.be.rejectedWith(Error);
    });

    it('should show warning if in debug mode and the given command has no hooks', () => {
      const consoleLogStub = sinon.stub(pluginManager.serverless.cli, 'log').returns();
      process.env.SLS_DEBUG = '*';
      class HooklessPlugin {
        constructor() {
          this.commands = {
            foo: {},
          };
        }
      }

      pluginManager.addPlugin(HooklessPlugin);

      const commandsArray = ['foo'];

      return pluginManager.run(commandsArray).then(() => {
        expect(consoleLogStub.called).is.equal(true);
        pluginManager.serverless.cli.log.restore();
      });
    });

    it('should run the hooks in the correct order', () => {
      class CorrectHookOrderPluginMock {
        constructor() {
          this.commands = {
            run: {
              usage: 'Pushes the current hook status on the hookStatus array',
              lifecycleEvents: ['beforeHookStatus', 'midHookStatus', 'afterHookStatus'],
            },
          };

          this.hooks = {
            'initialize': this.initializeHookStatus.bind(this),
            'before:run:beforeHookStatus': this.beforeHookStatus.bind(this),
            'run:midHookStatus': this.midHookStatus.bind(this),
            'after:run:afterHookStatus': this.afterHookStatus.bind(this),
          };

          // used to test if the hooks were run in the correct order
          this.hookStatus = [];
        }

        initializeHookStatus() {
          this.hookStatus.push('initialize');
        }

        beforeHookStatus() {
          this.hookStatus.push('before');
        }

        midHookStatus() {
          this.hookStatus.push('mid');
        }

        afterHookStatus() {
          this.hookStatus.push('after');
        }
      }

      pluginManager.addPlugin(CorrectHookOrderPluginMock);
      const commandsArray = ['run'];
      return pluginManager.run(commandsArray).then(() => {
        expect(pluginManager.plugins[0].hookStatus[0]).to.equal('initialize');
        expect(pluginManager.plugins[0].hookStatus[1]).to.equal('before');
        expect(pluginManager.plugins[0].hookStatus[2]).to.equal('mid');
        expect(pluginManager.plugins[0].hookStatus[3]).to.equal('after');
      });
    });

    describe('when using a synchronous hook function', () => {
      beforeEach(() => {
        // eslint-disable-line prefer-arrow-callback
        pluginManager.addPlugin(SynchronousPluginMock);
      });

      describe('when running a simple command', () => {
        it('should run a simple command', () => {
          const commandsArray = ['deploy'];
          return pluginManager
            .run(commandsArray)
            .then(() => expect(pluginManager.plugins[0].deployedFunctions).to.equal(1));
        });
      });

      describe('when running a nested command', () => {
        it('should run the nested command', () => {
          const commandsArray = ['deploy', 'onpremises'];
          return pluginManager
            .run(commandsArray)
            .then(() => expect(pluginManager.plugins[0].deployedResources).to.equal(1));
        });
      });
    });

    describe('when using a promise based hook function', () => {
      beforeEach(() => {
        // eslint-disable-line prefer-arrow-callback
        pluginManager.addPlugin(PromisePluginMock);
      });

      describe('when running a simple command', () => {
        it('should run the simple command', () => {
          const commandsArray = ['deploy'];
          return pluginManager
            .run(commandsArray)
            .then(() => expect(pluginManager.plugins[0].deployedFunctions).to.equal(1));
        });
      });

      describe('when running a nested command', () => {
        it('should run the nested command', () => {
          const commandsArray = ['deploy', 'onpremises'];
          return pluginManager
            .run(commandsArray)
            .then(() => expect(pluginManager.plugins[0].deployedResources).to.equal(1));
        });
      });
    });

    describe('when using provider specific plugins', () => {
      beforeEach(() => {
        // eslint-disable-line prefer-arrow-callback
        pluginManager.serverless.service.provider.name = 'provider1';

        pluginManager.addPlugin(Provider1PluginMock);
        pluginManager.addPlugin(Provider2PluginMock);

        // this plugin should be run each and every time as it doesn't specify any provider
        pluginManager.addPlugin(SynchronousPluginMock);
      });

      it('should load only the providers plugins (if the provider is specified)', () => {
        const commandsArray = ['deploy'];
        return pluginManager.run(commandsArray).then(() => {
          expect(pluginManager.plugins.length).to.equal(2);
          expect(pluginManager.plugins[0].deployedFunctions).to.equal(1);
          expect(pluginManager.plugins[0].provider).to.equal('provider1');
          expect(pluginManager.plugins[1].deployedFunctions).to.equal(1);
          expect(pluginManager.plugins[1].provider).to.equal(undefined);
        });
      });
    });

    it('should run commands with internal lifecycles', () => {
      pluginManager.addPlugin(EntrypointPluginMock);

      const commandsArray = ['mycmd', 'spawncmd'];

      return pluginManager.run(commandsArray).then(() => {
        expect(pluginManager.plugins[0].callResult).to.equal(
          '>subInitialize>subFinalize>initialize>finalize>run>subEPInitialize>subEPFinalize'
        );
      });
    });
  });

  describe('#getCommands()', () => {
    it('should hide entrypoints on any level and only return commands', () => {
      pluginManager.addPlugin(EntrypointPluginMock);

      const commands = pluginManager.getCommands();
      expect(commands).to.have.a.property('mycmd');
      expect(commands).to.have.a.nested.property('mycmd.commands.mysubcmd');
      expect(commands).to.have.a.nested.property('mycmd.commands.spawncmd');
      // Check for omitted entrypoints
      expect(commands).to.not.have.a.property('myep');
      expect(commands).to.not.have.a.nested.property('myep.commands.mysubep');
      expect(commands).to.not.have.a.nested.property('mycmd.commands.spawnep');
    });

    it('should return aliases', () => {
      pluginManager.addPlugin(AliasPluginMock);

      const commands = pluginManager.getCommands();
      expect(commands)
        .to.have.a.property('on')
        .that.has.a.nested.property('commands.premise');
      expect(commands).to.have.a.property('premise');
    });
  });

  describe('#getCommand()', () => {
    beforeEach(() => {
      pluginManager.addPlugin(SynchronousPluginMock);
      pluginManager.serverless.cli.loadedCommands = {
        create: {
          usage: 'Create new Serverless service',
          lifecycleEvents: ['create'],
          options: {
            template: {
              usage: 'Template for the service. Available templates: ", "aws-nodejs", "..."',
              shortcut: 't',
            },
          },
          key: 'create',
          pluginName: 'Create',
        },
        deploy: {
          usage: 'Deploy a Serverless service',
          configDependent: true,
          lifecycleEvents: ['cleanup', 'initialize'],
          options: {
            conceal: {
              usage: 'Hide secrets from the output (e.g. API Gateway key values)',
            },
            stage: {
              usage: 'Stage of the service',
              shortcut: 's',
            },
          },
          key: 'deploy',
          pluginName: 'Deploy',
          commands: {
            function: {
              usage: 'Deploy a single function from the service',
              lifecycleEvents: ['initialize', 'packageFunction', 'deploy'],
              options: {
                function: {
                  usage: 'Name of the function',
                  shortcut: 'f',
                  required: true,
                },
              },
              key: 'deploy:function',
              pluginName: 'Deploy',
            },
            list: {
              usage: 'List deployed version of your Serverless Service',
              lifecycleEvents: ['log'],
              key: 'deploy:list',
              pluginName: 'Deploy',
              commands: {
                functions: {
                  usage: 'List all the deployed functions and their versions',
                  lifecycleEvents: ['log'],
                  key: 'deploy:list:functions',
                  pluginName: 'Deploy',
                },
              },
            },
          },
        },
      };
    });
    it('should give a suggestion for an unknown command', done => {
      try {
        pluginManager.getCommand(['creet']);
        done('Test failed. Expected an error to be thrown');
      } catch (error) {
        expect(error.name).to.eql('ServerlessError');
        expect(error.message).to.eql(
          'Serverless command "creet" not found. ' +
            'Did you mean "create"? Run "serverless help" for a list of all available commands.'
        );
        done();
      }
    });

    it('should not give a suggestion for valid top level command', done => {
      try {
        pluginManager.getCommand(['deploy', 'function-misspelled']);
        done('Test failed. Expected an error to be thrown');
      } catch (error) {
        expect(error.name).to.eql('ServerlessError');
        expect(error.message).to.eql(
          '"function-misspelled" is not a valid sub command. ' +
            'Run "serverless deploy" to see a more helpful error message for this command.'
        );
        done();
      }
    });
  });

  describe('#spawn()', () => {
    it('should throw an error when the given command is not available', () => {
      pluginManager.addPlugin(EntrypointPluginMock);

      const commandsArray = ['foo'];

      expect(() => {
        pluginManager.spawn(commandsArray);
      }).to.throw(Error);
    });

    it('should show warning in debug mode and when the given command has no hooks', () => {
      const consoleLogStub = sinon.stub(pluginManager.serverless.cli, 'log').returns();

      process.env.SLS_DEBUG = '*';

      class HooklessPlugin {
        constructor() {
          this.commands = {
            foo: {},
          };
        }
      }

      pluginManager.addPlugin(HooklessPlugin);

      const commandsArray = ['foo'];

      return pluginManager.run(commandsArray).then(() => {
        expect(consoleLogStub.called).is.equal(true);
        pluginManager.serverless.cli.log.restore();
      });
    });

    describe('when invoking a command', () => {
      it('should succeed', () => {
        pluginManager.addPlugin(EntrypointPluginMock);

        const commandsArray = ['mycmd'];

        return pluginManager.spawn(commandsArray).then(() => {
          expect(pluginManager.plugins[0].callResult).to.equal('>run');
        });
      });

      it('should spawn nested commands', () => {
        pluginManager.addPlugin(EntrypointPluginMock);

        const commandsArray = ['mycmd', 'mysubcmd'];

        return pluginManager.spawn(commandsArray).then(() => {
          expect(pluginManager.plugins[0].callResult).to.equal('>subInitialize>subFinalize');
        });
      });

      it('should terminate the hook chain if requested', () => {
        pluginManager.addPlugin(EntrypointPluginMock);

        const commandsArray = ['mycmd', 'mysubcmd'];

        return expect(
          pluginManager.spawn(commandsArray, { terminateLifecycleAfterExecution: true })
        )
          .to.be.rejectedWith('Terminating mycmd:mysubcmd')
          .then(() => {
            expect(pluginManager.plugins[0].callResult).to.equal('>subInitialize>subFinalize');
          });
      });
    });

    describe('when invoking a container', () => {
      it('should fail', () => {
        pluginManager.addPlugin(ContainerPluginMock);

        const commandsArray = ['mycontainer'];

        return expect(() => pluginManager.spawn(commandsArray)).to.throw(/command ".*" not found/);
      });

      it('should spawn nested commands', () => {
        pluginManager.addPlugin(ContainerPluginMock);

        const commandsArray = ['mycontainer', 'mysubcmd'];

        return pluginManager.spawn(commandsArray).then(() => {
          expect(pluginManager.plugins[0].callResult).to.equal('>mysubcmdEvent1>mysubcmdEvent2');
        });
      });
    });

    describe('when invoking an entrypoint', () => {
      it('should succeed', () => {
        pluginManager.addPlugin(EntrypointPluginMock);

        const commandsArray = ['myep'];

        return pluginManager.spawn(commandsArray).then(() => {
          expect(pluginManager.plugins[0].callResult).to.equal('>initialize>finalize');
        });
      });

      it('should spawn nested entrypoints', () => {
        pluginManager.addPlugin(EntrypointPluginMock);

        const commandsArray = ['myep', 'mysubep'];

        return pluginManager.spawn(commandsArray).then(() => {
          expect(pluginManager.plugins[0].callResult).to.equal('>subEPInitialize>subEPFinalize');
        });
      });

      describe('with string formatted syntax', () => {
        it('should succeed', () => {
          pluginManager.addPlugin(EntrypointPluginMock);

          return pluginManager.spawn('myep').then(() => {
            expect(pluginManager.plugins[0].callResult).to.equal('>initialize>finalize');
          });
        });

        it('should spawn nested entrypoints', () => {
          pluginManager.addPlugin(EntrypointPluginMock);

          return pluginManager.spawn('myep:mysubep').then(() => {
            expect(pluginManager.plugins[0].callResult).to.equal('>subEPInitialize>subEPFinalize');
          });
        });
      });
    });

    it('should spawn entrypoints with internal lifecycles', () => {
      pluginManager.addPlugin(EntrypointPluginMock);

      const commandsArray = ['myep', 'spawnep'];

      return pluginManager.spawn(commandsArray).then(() => {
        expect(pluginManager.plugins[0].callResult).to.equal(
          '>subInitialize>subFinalize>initialize>finalize>run>subEPInitialize>subEPFinalize'
        );
      });
    });
  });

  describe('Plugin / Load local plugins', () => {
    const cwd = process.cwd();
    let serviceDir;
    let tmpDir;
    beforeEach(() => {
      // eslint-disable-line prefer-arrow-callback
      tmpDir = getTmpDirPath();
      serviceDir = path.join(tmpDir, 'service');
      fse.mkdirsSync(serviceDir);
      process.chdir(serviceDir);
      pluginManager.serverless.config.servicePath = serviceDir;
    });

    it('should load plugins from .serverless_plugins', () => {
      const localPluginDir = path.join(serviceDir, '.serverless_plugins', 'local-plugin');
      installPlugin(localPluginDir, SynchronousPluginMock);

      pluginManager.loadAllPlugins(['local-plugin']);
      expect(pluginManager.plugins).to.satisfy(plugins =>
        plugins.some(plugin => plugin.constructor.name === 'SynchronousPluginMock')
      );
    });

    it('should load plugins from custom folder', () => {
      const localPluginDir = path.join(serviceDir, 'serverless-plugins-custom', 'local-plugin');
      installPlugin(localPluginDir, SynchronousPluginMock);

      pluginManager.loadAllPlugins({
        localPath: path.join(serviceDir, 'serverless-plugins-custom'),
        modules: ['local-plugin'],
      });
      // Had to use contructor.name because the class will be loaded via
      // require and the reference will not match with SynchronousPluginMock
      expect(pluginManager.plugins).to.satisfy(plugins =>
        plugins.some(plugin => plugin.constructor.name === 'SynchronousPluginMock')
      );
    });

    it('should load plugins from custom folder outside of serviceDir', () => {
      serviceDir = path.join(tmpDir, 'serverless-plugins-custom');
      const localPluginDir = path.join(serviceDir, 'local-plugin');
      installPlugin(localPluginDir, SynchronousPluginMock);

      pluginManager.loadAllPlugins({
        localPath: serviceDir,
        modules: ['local-plugin'],
      });
      // Had to use contructor.name because the class will be loaded via
      // require and the reference will not match with SynchronousPluginMock
      expect(pluginManager.plugins).to.satisfy(plugins =>
        plugins.some(plugin => plugin.constructor.name === 'SynchronousPluginMock')
      );
    });

    afterEach(() => {
      // eslint-disable-line prefer-arrow-callback
      process.chdir(cwd);
      try {
        fse.removeSync(tmpDir);
      } catch (e) {
        // Couldn't delete temporary file
      }
    });
  });

  describe('Plugin / CLI integration', function() {
    this.timeout(1000 * 60 * 10);

    let serverlessInstance;
    let serviceDir;
    const serverlessExec = require('../../tests/serverless-binary');

    beforeEach(() => {
      // eslint-disable-line prefer-arrow-callback
      serverlessInstance = new Serverless();
      return serverlessInstance.init().then(() => {
        // Cannot rely on shebang in severless.js to invoke script using NodeJS on Windows.
        const tmpDir = getTmpDirPath();
        serviceDir = path.join(tmpDir, 'service');
        fse.mkdirsSync(serviceDir);

        return spawn(serverlessExec, ['create', '--template', 'aws-nodejs'], {
          env,
          cwd: serviceDir,
        });
      });
    });

    it('should expose a working integration between the CLI and the plugin system', () => {
      expect(
        serverlessInstance.utils.fileExistsSync(path.join(serviceDir, 'serverless.yml'))
      ).to.equal(true);
      expect(serverlessInstance.utils.fileExistsSync(path.join(serviceDir, 'handler.js'))).to.equal(
        true
      );
    });

    it('should load plugins relatively to the working directory', () => {
      const localPluginDir = path.join(serviceDir, 'node_modules', 'local-plugin');
      const parentPluginDir = path.join(serviceDir, '..', 'node_modules', 'parent-plugin');
      installPlugin(localPluginDir, SynchronousPluginMock);
      installPlugin(parentPluginDir, PromisePluginMock);

      fs.appendFileSync(
        path.join(serviceDir, 'serverless.yml'),
        'plugins:\n  - local-plugin\n  - parent-plugin'
      );

      return spawn(serverlessExec, [], { env, cwd: serviceDir }).then(({ stdoutBuffer }) => {
        const stringifiedOutput = String(stdoutBuffer);
        expect(stringifiedOutput).to.contain('SynchronousPluginMock');
        expect(stringifiedOutput).to.contain('PromisePluginMock');
      });
    });

    afterEach(() => {
      try {
        fse.removeSync(serviceDir);
      } catch (e) {
        // Couldn't delete temporary file
      }
    });
  });
});
