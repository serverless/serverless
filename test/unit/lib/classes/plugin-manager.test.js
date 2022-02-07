'use strict';

/* eslint-disable no-unused-expressions */

const chai = require('chai');
const overrideEnv = require('process-utils/override-env');
const overrideArgv = require('process-utils/override-argv');
const runServerless = require('../../../utils/run-serverless');
const fixtures = require('../../../fixtures/programmatic');
const Serverless = require('../../../../lib/serverless');
const CLI = require('../../../../lib/classes/cli');
const resolveInput = require('../../../../lib/cli/resolve-input');
const Create = require('../../../../lib/plugins/create/create');
const ServerlessError = require('../../../../lib/serverless-error');
const getRequire = require('../../../../lib/utils/get-require');

const path = require('path');
const fsp = require('fs').promises;
const fse = require('fs-extra');
const mockRequire = require('mock-require');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const BbPromise = require('bluebird');
const { installPlugin } = require('../../../utils/plugins');
const { getTmpDirPath } = require('../../../utils/fs');

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

const expect = chai.expect;

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
          other: {
            usage: 'Deploy to other infrastructure',
            lifecycleEvents: ['resources', 'functions'],
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
    return new BbPromise((resolve) => {
      this.deployedFunctions += 1;
      return resolve();
    });
  }

  resources() {
    return new BbPromise((resolve) => {
      this.deployedResources += 1;
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
            type: 'string',
          },
          function: {
            usage: 'The function you want to deploy (e.g. --function create)',
            type: 'string',
          },
        },
        commands: {
          onpremises: {
            usage: 'Deploy to your On-Premises infrastructure',
            lifecycleEvents: ['resources', 'functions'],
            options: {
              resource: {
                usage: 'The resource you want to deploy (e.g. --resource db)',
                type: 'string',
              },
              function: {
                usage: 'The function you want to deploy (e.g. --function create)',
                type: 'string',
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
    this.deployedFunctions += 1;
  }

  resources() {
    this.deployedResources += 1;
  }
}

describe('PluginManager', () => {
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
      this.deployedFunctions += 1;
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
      this.deployedFunctions += 1;
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
              type: 'string',
            },
            function: {
              usage: 'The function you want to deploy (e.g. --function create)',
              type: 'string',
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
                  type: 'string',
                },
                function: {
                  usage: 'The function you want to deploy (e.g. --function create)',
                  type: 'string',
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
      this.deployedFunctions += 1;
    }

    resources() {
      this.deployedResources += 1;
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
        return pluginPath;
      case './RelativePath/ServicePluginMock2':
        return `${serviceDir}/RelativePath/ServicePluginMock2`;
      default:
        return getRequire(directory).resolve(pluginPath);
    }
  };

  let restoreEnv;
  let serviceDir;
  const PluginManager = proxyquire('../../../../lib/classes/plugin-manager', {
    '../utils/get-require': (directory) => {
      const resultRequire = require('module').createRequire(path.resolve(directory, 'req'));
      resultRequire.resolve = (pluginPath) => resolveStub(directory, pluginPath);
      return resultRequire;
    },
  });

  beforeEach(() => {
    ({ restoreEnv } = overrideEnv({ whitelist: ['APPDATA', 'PATH'] }));
    serverless = new Serverless({ commands: [], options: {} });
    serverless.cli = new CLI();
    serverless.processedInput = { commands: ['print'], options: {} };
    pluginManager = new PluginManager(serverless);
    serviceDir = pluginManager.serverless.serviceDir = 'foo';
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
      mockRequire('@serverless/dashboard-plugin', EnterprisePluginMock);
    });

    it('should load only core plugins when no service plugins are given', async () => {
      // Note: We need the Create plugin for this test to pass
      await pluginManager.loadAllPlugins();

      // note: this test will be refactored as the Create plugin will be moved
      // to another directory
      expect(pluginManager.plugins.length).to.be.above(0);
    });

    it('should load all plugins when service plugins are given', async () => {
      const servicePlugins = ['ServicePluginMock1', 'ServicePluginMock2'];
      await pluginManager.loadAllPlugins(servicePlugins);

      expect(pluginManager.plugins.some((plugin) => plugin instanceof ServicePluginMock1)).to.equal(
        true
      );
      expect(pluginManager.plugins.some((plugin) => plugin instanceof ServicePluginMock2)).to.equal(
        true
      );
      expect(
        pluginManager.plugins.some((plugin) => plugin instanceof EnterprisePluginMock)
      ).to.equal(true);
      // note: this test will be refactored as the Create plugin will be moved
      // to another directory
      expect(pluginManager.plugins.length).to.be.above(2);
    });

    it('should load all plugins in the correct order', async () => {
      const servicePlugins = ['ServicePluginMock1', 'ServicePluginMock2'];

      await pluginManager.loadAllPlugins(servicePlugins);

      const pluginIndexes = [
        pluginManager.plugins.findIndex((plugin) => plugin instanceof Create),
        pluginManager.plugins.findIndex((plugin) => plugin instanceof ServicePluginMock1),
        pluginManager.plugins.findIndex((plugin) => plugin instanceof ServicePluginMock2),
        pluginManager.plugins.findIndex((plugin) => plugin instanceof EnterprisePluginMock),
      ];
      expect(pluginIndexes).to.deep.equal(pluginIndexes.slice().sort((a, b) => a - b));
    });

    it('should load the Serverless core plugins', async () => {
      await pluginManager.loadAllPlugins();

      expect(pluginManager.plugins.length).to.be.above(1);
    });

    it('should throw an error when trying to load unknown plugin', () => {
      const servicePlugins = ['ServicePluginMock3', 'ServicePluginMock1'];

      return expect(pluginManager.loadAllPlugins(servicePlugins)).to.be.rejectedWith(
        ServerlessError
      );
    });

    it('should not throw error when trying to load unknown plugin with help flag', async () => {
      const servicePlugins = ['ServicePluginMock3', 'ServicePluginMock1'];

      pluginManager.setCliOptions({ help: true });

      resolveInput.clear();
      return overrideArgv({ args: ['serverless', '--help'] }, () => {
        return expect(pluginManager.loadAllPlugins(servicePlugins)).to.not.be.rejectedWith(
          ServerlessError
        );
      });
    });

    it('should pass through an error when plugin load fails', () => {
      const servicePlugins = ['BrokenPluginMock'];

      return expect(pluginManager.loadAllPlugins(servicePlugins)).to.be.rejectedWith(
        brokenPluginError
      );
    });

    it('should not throw error when running the plugin commands and given plugins does not exist', () => {
      const servicePlugins = ['ServicePluginMock3'];
      const cliCommandsMock = ['plugin'];
      pluginManager.setCliCommands(cliCommandsMock);

      return expect(pluginManager.loadAllPlugins(servicePlugins)).to.not.be.rejectedWith(
        ServerlessError
      );
    });

    afterEach(() => {
      mockRequire.stop('ServicePluginMock1');
      mockRequire.stop('ServicePluginMock2');
      mockRequire.stop('BrokenPluginMock');
      mockRequire.stop('@serverless/dashboard-plugin');
    });
  });

  describe('#resolveServicePlugins()', () => {
    beforeEach(() => {
      mockRequire('ServicePluginMock1', ServicePluginMock1);
      // Plugins loaded via a relative path should be required relative to the service path
      mockRequire(`${serviceDir}/RelativePath/ServicePluginMock2`, ServicePluginMock2);
    });

    it('should resolve the service plugins', async () => {
      const servicePlugins = ['ServicePluginMock1', './RelativePath/ServicePluginMock2'];
      expect(await pluginManager.resolveServicePlugins(servicePlugins)).to.deep.equal([
        ServicePluginMock1,
        ServicePluginMock2,
      ]);
    });

    it('should not error if plugins = null', () => {
      // Happens when `plugins` property exists but is empty
      const servicePlugins = null;
      return expect(pluginManager.resolveServicePlugins(servicePlugins)).to.not.be.rejected;
    });

    it('should not error if plugins = undefined', () => {
      // Happens when `plugins` property does not exist
      const servicePlugins = undefined;
      return expect(pluginManager.resolveServicePlugins(servicePlugins)).to.not.be.rejected;
    });

    afterEach(() => {
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
        localPath: path.join(serverless.serviceDir, '.serverless_plugins'),
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
        localPath: path.join(serverless.serviceDir, '.serverless_plugins'),
      });
    });

    it('should parse plugins object if modules property is not an array', () => {
      const servicePlugins = { modules: {} };

      parsePluginsObjectAndVerifyResult(servicePlugins, {
        modules: [],
        localPath: path.join(serverless.serviceDir, '.serverless_plugins'),
      });
    });

    it('should parse plugins object if localPath is not correct', () => {
      const servicePlugins = {
        modules: ['ServicePluginMock1', 'ServicePluginMock2'],
        localPath: {},
      };

      parsePluginsObjectAndVerifyResult(servicePlugins, {
        modules: servicePlugins.modules,
        localPath: path.join(serverless.serviceDir, '.serverless_plugins'),
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
  });

  describe('#loadHooks()', () => {
    let deprecatedPluginInstance;

    beforeEach(() => {
      deprecatedPluginInstance = new DeprecatedLifecycleEventsPluginMock();
      pluginManager.deprecatedEvents = {
        'deprecated:deprecated': 'new:new',
      };
    });

    afterEach(() => {
      pluginManager.deprecatedEvents = {};
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
    });
  });

  describe('#getPlugins()', () => {
    beforeEach(() => {
      mockRequire('ServicePluginMock1', ServicePluginMock1);
      mockRequire('ServicePluginMock2', ServicePluginMock2);
    });

    it('should return all loaded plugins', async () => {
      const servicePlugins = ['ServicePluginMock1', 'ServicePluginMock2'];
      await pluginManager.loadAllPlugins(servicePlugins);

      const plugins = pluginManager.getPlugins();
      expect(plugins.length).to.be.above(3);
      expect(plugins.some((plugin) => plugin instanceof ServicePluginMock1)).to.be.true;
      expect(plugins.some((plugin) => plugin instanceof ServicePluginMock2)).to.be.true;
    });

    afterEach(() => {
      mockRequire.stop('ServicePluginMock1');
      mockRequire.stop('ServicePluginMock2');
    });
  });

  describe('#validateCommand()', () => {
    it('should find commands', () => {
      pluginManager.addPlugin(EntrypointPluginMock);

      expect(() => pluginManager.validateCommand(['mycmd', 'mysubcmd'])).to.not.throw(
        ServerlessError
      );
    });

    it('should find container children commands', () => {
      pluginManager.addPlugin(ContainerPluginMock);

      expect(() => pluginManager.validateCommand(['mycontainer', 'mysubcmd'])).to.not.throw(
        ServerlessError
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

    [0, '', false].forEach((defaultValue) => {
      it(`assigns valid falsy default value '${defaultValue} to empty options`, () => {
        pluginManager.commands = {
          foo: {
            options: {
              bar: {
                required: true,
                default: defaultValue,
              },
            },
          },
        };

        const foo = pluginManager.commands.foo;
        pluginManager.assignDefaultOptions(foo);

        expect(pluginManager.cliOptions.bar).to.equal(defaultValue);
      });
    });
  });

  describe('#validateServerlessConfigDependency()', () => {
    let serverlessInstance;
    let pluginManagerInstance;

    beforeEach(() => {
      serverlessInstance = new Serverless({ commands: [], options: {} });
      serverlessInstance.configurationInput = null;
      serverlessInstance.serviceDir = 'my-service';
      pluginManagerInstance = new PluginManager(serverlessInstance);
    });

    it('should continue loading if the configDependent property is absent', () => {
      pluginManagerInstance.commands = {
        foo: {},
      };

      const foo = pluginManagerInstance.commands.foo;

      expect(pluginManagerInstance.validateServerlessConfigDependency(foo)).to.be.undefined;
    });

    it('should load if the configDependent property is false and config is null', () => {
      pluginManagerInstance.commands = {
        foo: {
          configDependent: false,
        },
      };

      const foo = pluginManagerInstance.commands.foo;

      expect(pluginManagerInstance.validateServerlessConfigDependency(foo)).to.be.undefined;
    });

    it('should throw an error if configDependent is true and no config is found', () => {
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
      pluginManagerInstance.serverless.configurationInput = {
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

  describe('#run()', () => {
    it('should throw an error when the given command is not available', () => {
      pluginManager.addPlugin(SynchronousPluginMock);

      const commandsArray = ['foo'];

      return expect(pluginManager.run(commandsArray)).to.be.rejectedWith(Error);
    });

    it('should throw an error when the given command is an entrypoint', () => {
      pluginManager.addPlugin(EntrypointPluginMock);

      const commandsArray = ['myep'];

      return expect(pluginManager.run(commandsArray)).to.be.rejectedWith(Error);
    });

    it('should NOT throw an error when the given command is a child of a container', () => {
      pluginManager.addPlugin(ContainerPluginMock);

      const commandsArray = ['mycontainer', 'mysubcmd'];

      return expect(pluginManager.run(commandsArray)).to.not.be.rejectedWith(Error);
    });

    it('should throw an error when the given command is a child of an entrypoint', () => {
      pluginManager.addPlugin(EntrypointPluginMock);

      const commandsArray = ['mysubcmd'];

      return expect(pluginManager.run(commandsArray)).to.be.rejectedWith(Error);
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
      expect(commands).to.have.a.property('on').that.has.a.nested.property('commands.premise');
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
  });

  describe('#spawn()', () => {
    it('should throw an error when the given command is not available', async () => {
      pluginManager.addPlugin(EntrypointPluginMock);

      const commandsArray = ['foo'];

      return expect(pluginManager.spawn(commandsArray)).to.eventually.be.rejectedWith(Error);
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
    let tmpDir;
    beforeEach(() => {
      tmpDir = getTmpDirPath();
      serviceDir = path.join(tmpDir, 'service');
      fse.mkdirsSync(serviceDir);
      process.chdir(serviceDir);
      pluginManager.serverless.serviceDir = serviceDir;
    });

    it('should load plugins from .serverless_plugins', async () => {
      const localPluginDir = path.join(serviceDir, '.serverless_plugins', 'local-plugin');
      installPlugin(localPluginDir, SynchronousPluginMock);

      await pluginManager.loadAllPlugins(['local-plugin']);
      expect(pluginManager.plugins).to.satisfy((plugins) =>
        plugins.some((plugin) => plugin.constructor.name === 'SynchronousPluginMock')
      );
    });

    it('should load plugins from custom folder', async () => {
      const localPluginDir = path.join(serviceDir, 'serverless-plugins-custom', 'local-plugin');
      installPlugin(localPluginDir, SynchronousPluginMock);

      await pluginManager.loadAllPlugins({
        localPath: path.join(serviceDir, 'serverless-plugins-custom'),
        modules: ['local-plugin'],
      });
      // Had to use constructor.name because the class will be loaded via
      // require and the reference will not match with SynchronousPluginMock
      expect(pluginManager.plugins).to.satisfy((plugins) =>
        plugins.some((plugin) => plugin.constructor.name === 'SynchronousPluginMock')
      );
    });

    it('should load plugins from custom folder outside of serviceDir', async () => {
      serviceDir = path.join(tmpDir, 'serverless-plugins-custom');
      const localPluginDir = path.join(serviceDir, 'local-plugin');
      installPlugin(localPluginDir, SynchronousPluginMock);

      await pluginManager.loadAllPlugins({
        localPath: serviceDir,
        modules: ['local-plugin'],
      });
      // Had to use constructor.name because the class will be loaded via
      // require and the reference will not match with SynchronousPluginMock
      expect(pluginManager.plugins).to.satisfy((plugins) =>
        plugins.some((plugin) => plugin.constructor.name === 'SynchronousPluginMock')
      );
    });

    afterEach(() => {
      process.chdir(cwd);
      try {
        fse.removeSync(tmpDir);
      } catch (e) {
        // Couldn't delete temporary file
      }
    });
  });
});

describe('test/unit/lib/classes/PluginManager.test.js', () => {
  it('should load plugins relatively to the working directory', async () => {
    const { servicePath: serviceDir } = await fixtures.setup('aws');
    const localPluginDir = path.join(serviceDir, 'node_modules', 'local-plugin');
    const parentPluginDir = path.join(serviceDir, '..', 'node_modules', 'parent-plugin');
    installPlugin(localPluginDir, SynchronousPluginMock);
    installPlugin(parentPluginDir, PromisePluginMock);
    await fsp.appendFile(
      path.join(serviceDir, 'serverless.yml'),
      'plugins:\n  - local-plugin\n  - parent-plugin'
    );

    const { serverless } = await runServerless({
      cwd: serviceDir,
      command: 'print',
    });

    const pluginNames = new Set(
      serverless.pluginManager.plugins.map((plugin) => plugin.constructor.name)
    );
    expect(pluginNames).to.contain('SynchronousPluginMock');
    expect(pluginNames).to.contain('PromisePluginMock');
  });

  it('should pass log writers to external plugins', async () => {
    const { serverless } = await runServerless({
      fixture: 'plugin',
      command: 'print',
    });
    const plugin = Array.from(serverless.pluginManager.externalPlugins).find(
      (externalPlugin) => externalPlugin.constructor.name === 'TestPlugin'
    );
    expect(typeof plugin.utils.log).to.equal('function');
    expect(typeof plugin.utils.progress.create).to.equal('function');
    expect(typeof plugin.utils.writeText).to.equal('function');
  });

  it('should error out for duplicate plugin definiton', async () => {
    await expect(
      runServerless({
        fixture: 'plugin',
        command: 'print',
        configExt: {
          plugins: ['./plugin', './plugin'],
        },
      })
    ).to.be.eventually.rejected.and.have.property('code', 'DUPLICATE_PLUGIN_DEFINITION');
  });

  it('should pass through an error when trying to load a plugin with error', async () => {
    await expect(
      runServerless({
        fixture: 'plugin',
        command: 'print',
        configExt: {
          plugins: ['./broken-plugin'],
        },
      })
    ).to.be.eventually.rejectedWith(Error, 'failed to load plugin');
  });

  it('should load ESM plugins', async () => {
    const { serverless } = await runServerless({
      fixture: 'plugin',
      command: 'print',
      configExt: {
        plugins: ['./local-esm-plugin', 'esm-plugin'],
      },
    });

    const pluginNames = new Set(
      serverless.pluginManager.plugins.map((plugin) => plugin.constructor.name)
    );
    expect(pluginNames).to.include('LocalESMPlugin');
    expect(pluginNames).to.include('ESMPlugin');
  });
});
