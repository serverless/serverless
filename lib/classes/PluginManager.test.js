'use strict';

const expect = require('chai').expect;
const PluginManager = require('../../lib/classes/PluginManager');
const Serverless = require('../../lib/Serverless');
const Create = require('../../lib/plugins/create/create');

const path = require('path');
const fse = require('fs-extra');
const execSync = require('child_process').execSync;
const mockRequire = require('mock-require');
const testUtils = require('../../tests/utils');
const os = require('os');

describe('PluginManager', () => {
  let pluginManager;
  let serverless;

  class ServicePluginMock1 {}

  class ServicePluginMock2 {}

  class Provider1PluginMock {
    constructor() {
      this.provider = 'provider1';

      this.commands = {
        deploy: {
          lifecycleEvents: [
            'resources',
          ],
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
          lifecycleEvents: [
            'resources',
          ],
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
          lifecycleEvents: [
            'resources',
            'functions',
          ],
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
              lifecycleEvents: [
                'resources',
                'functions',
              ],
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
      return new Promise((resolve) => {
        this.deployedFunctions = this.deployedFunctions + 1;
        return resolve();
      });
    }

    resources() {
      return new Promise((resolve) => {
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
          lifecycleEvents: [
            'resources',
            'functions',
          ],
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
              lifecycleEvents: [
                'resources',
                'functions',
              ],
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

  beforeEach(function () { // eslint-disable-line prefer-arrow-callback
    serverless = new Serverless();
    pluginManager = new PluginManager(serverless);
  });

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

  describe('#loadAllPlugins()', () => {
    beforeEach(function () { // eslint-disable-line prefer-arrow-callback
      mockRequire('ServicePluginMock1', ServicePluginMock1);
      mockRequire('ServicePluginMock2', ServicePluginMock2);
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

      const servicePluginMock1 = new ServicePluginMock1();
      const servicePluginMock2 = new ServicePluginMock2();

      expect(pluginManager.plugins).to.contain(servicePluginMock1);
      expect(pluginManager.plugins).to.contain(servicePluginMock2);
      // note: this test will be refactored as the Create plugin will be moved
      // to another directory
      expect(pluginManager.plugins.length).to.be.above(2);
    });

    it('should load all plugins in the correct order', () => {
      const servicePlugins = ['ServicePluginMock1', 'ServicePluginMock2'];

      // we need to mock it so that tests won't break when more core plugins are added later on
      // because we access the plugins array with an index which will change every time a new core
      // plugin will be added
      const loadCorePluginsMock = () => {
        pluginManager.addPlugin(Create);
      };

      // This is the exact same functionality like loadCorePlugins()
      loadCorePluginsMock();
      pluginManager.loadServicePlugins(servicePlugins);

      expect(pluginManager.plugins[0]).to.be.instanceof(Create);
      expect(pluginManager.plugins[1]).to.be.instanceof(ServicePluginMock1);
      expect(pluginManager.plugins[2]).to.be.instanceof(ServicePluginMock2);
    });

    afterEach(function () { // eslint-disable-line prefer-arrow-callback
      mockRequire.stop('ServicePluginMock1');
      mockRequire.stop('ServicePluginMock2');
    });
  });

  describe('#loadCorePlugins()', () => {
    it('should load the Serverless core plugins', () => {
      pluginManager.loadCorePlugins();

      expect(pluginManager.plugins.length).to.be.above(0);
    });
  });

  describe('#loadServicePlugins()', () => {
    beforeEach(function () { // eslint-disable-line prefer-arrow-callback
      mockRequire('ServicePluginMock1', ServicePluginMock1);
      mockRequire('ServicePluginMock2', ServicePluginMock2);
    });

    it('should load the service plugins', () => {
      const servicePlugins = ['ServicePluginMock1', 'ServicePluginMock2'];
      pluginManager.loadServicePlugins(servicePlugins);

      const servicePluginMock1 = new ServicePluginMock1();
      const servicePluginMock2 = new ServicePluginMock2();

      expect(pluginManager.plugins).to.contain(servicePluginMock1);
      expect(pluginManager.plugins).to.contain(servicePluginMock2);
    });

    it('should not error if plugins = null', () => {
      // Happens when `plugins` property exists but is empty
      const servicePlugins = null;
      pluginManager.loadServicePlugins(servicePlugins);
    });

    it('should not error if plugins = undefined', () => {
      // Happens when `plugins` property does not exist
      const servicePlugins = undefined;
      pluginManager.loadServicePlugins(servicePlugins);
    });

    afterEach(function () { // eslint-disable-line prefer-arrow-callback
      mockRequire.stop('ServicePluginMock1');
      mockRequire.stop('ServicePluginMock2');
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
            lifecycleEvents: [
              'one',
            ],
            options: {
              foo: {},
            },
          },
        },
      });

      pluginManager.loadCommands({
        commands: {
          deploy: {
            lifecycleEvents: [
              'one',
              'two',
            ],
            options: {
              bar: {},
            },
            commands: {
              fn: {
              },
            },
          },
        },
      });

      expect(pluginManager.commands.deploy).to.have.property('options')
        .that.has.all.keys('foo', 'bar');
      expect(pluginManager.commands.deploy).to.have.property('lifecycleEvents')
        .that.is.an('array')
        .that.deep.equals(['one', 'two']);
      expect(pluginManager.commands.deploy.commands).to.have.property('fn');
    });
  });

  describe('#getEvents()', () => {
    beforeEach(function () { // eslint-disable-line prefer-arrow-callback
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

  describe('#getPlugins()', () => {
    beforeEach(function () { // eslint-disable-line prefer-arrow-callback
      mockRequire('ServicePluginMock1', ServicePluginMock1);
      mockRequire('ServicePluginMock2', ServicePluginMock2);
    });

    it('should return all loaded plugins', () => {
      const servicePlugins = ['ServicePluginMock1', 'ServicePluginMock2'];
      pluginManager.loadServicePlugins(servicePlugins);

      expect(pluginManager.getPlugins()[0]).to.be.instanceof(ServicePluginMock1);
      expect(pluginManager.getPlugins()[1]).to.be.instanceof(ServicePluginMock2);
    });

    afterEach(function () { // eslint-disable-line prefer-arrow-callback
      mockRequire.stop('ServicePluginMock1');
      mockRequire.stop('ServicePluginMock2');
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

      expect(() => { pluginManager.validateOptions(foo); }).to.throw(Error);
      expect(() => { pluginManager.validateOptions(bar); }).to.throw(Error);
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

      expect(() => { pluginManager.validateOptions(command); }).to.throw(Error);
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

      expect(() => { pluginManager.validateOptions(commandsArray); }).to.not.throw(Error);
    });
  });

  describe('#run()', () => {
    it('should throw an error when the given command is not available', () => {
      pluginManager.addPlugin(SynchronousPluginMock);

      const commandsArray = ['foo'];

      expect(() => { pluginManager.run(commandsArray); }).to.throw(Error);
    });

    it('should throw an error when the given command has no hooks', () => {
      class HooklessPlugin {
        constructor() {
          this.commands = {
            foo: {},
          };
        }
      }

      pluginManager.addPlugin(HooklessPlugin);

      const commandsArray = ['foo'];

      expect(() => { pluginManager.run(commandsArray); }).to.throw(Error);
    });

    it('should run the hooks in the correct order', () => {
      class CorrectHookOrderPluginMock {
        constructor() {
          this.commands = {
            run: {
              usage: 'Pushes the current hook status on the hookStatus array',
              lifecycleEvents: [
                'beforeHookStatus',
                'midHookStatus',
                'afterHookStatus',
              ],
            },
          };

          this.hooks = {
            'before:run:beforeHookStatus': this.beforeHookStatus.bind(this),
            'run:midHookStatus': this.midHookStatus.bind(this),
            'after:run:afterHookStatus': this.afterHookStatus.bind(this),
          };

          // used to test if the hooks were run in the correct order
          this.hookStatus = [];
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
      return pluginManager.run(commandsArray)
        .then(() => {
          expect(pluginManager.plugins[0].hookStatus[0]).to.equal('before');
          expect(pluginManager.plugins[0].hookStatus[1]).to.equal('mid');
          expect(pluginManager.plugins[0].hookStatus[2]).to.equal('after');
        });
    });

    describe('when using a synchronous hook function', () => {
      beforeEach(function () { // eslint-disable-line prefer-arrow-callback
        pluginManager.addPlugin(SynchronousPluginMock);
      });

      describe('when running a simple command', () => {
        it('should run a simple command', () => {
          const commandsArray = ['deploy'];
          return pluginManager.run(commandsArray)
            .then(() => expect(pluginManager.plugins[0].deployedFunctions)
              .to.equal(1));
        });
      });

      describe('when running a nested command', () => {
        it('should run the nested command', () => {
          const commandsArray = ['deploy', 'onpremises'];
          return pluginManager.run(commandsArray)
            .then(() => expect(pluginManager.plugins[0].deployedResources)
              .to.equal(1));
        });
      });
    });

    describe('when using a promise based hook function', () => {
      beforeEach(function () { // eslint-disable-line prefer-arrow-callback
        pluginManager.addPlugin(PromisePluginMock);
      });

      describe('when running a simple command', () => {
        it('should run the simple command', () => {
          const commandsArray = ['deploy'];
          return pluginManager.run(commandsArray)
            .then(() => expect(pluginManager.plugins[0].deployedFunctions)
              .to.equal(1));
        });
      });

      describe('when running a nested command', () => {
        it('should run the nested command', () => {
          const commandsArray = ['deploy', 'onpremises'];
          return pluginManager.run(commandsArray)
            .then(() => expect(pluginManager.plugins[0].deployedResources)
              .to.equal(1));
        });
      });
    });

    describe('when using provider specific plugins', () => {
      beforeEach(function () { // eslint-disable-line prefer-arrow-callback
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
  });

  describe('Plugin / CLI integration', function () {
    this.timeout(0);

    it('should expose a working integration between the CLI and the plugin system', () => {
      const serverlessInstance = new Serverless();
      serverlessInstance.init();

      // Cannot rely on shebang in severless.js to invoke script using NodeJS on Windows.
      const execPrefix = os.platform() === 'win32' ? 'node ' : '';
      const serverlessExec = execPrefix + path.join(serverlessInstance.config.serverlessPath,
              '..', 'bin', 'serverless');
      const tmpDir = testUtils.getTmpDirPath();
      fse.mkdirsSync(tmpDir);
      const cwd = process.cwd();
      process.chdir(tmpDir);

      execSync(`${serverlessExec} create --template aws-nodejs`);

      expect(serverlessInstance.utils
        .fileExistsSync(path.join(tmpDir, 'serverless.yml'))).to.equal(true);
      expect(serverlessInstance.utils
        .fileExistsSync(path.join(tmpDir, 'handler.js'))).to.equal(true);

      process.chdir(cwd);
    });
  });
});
