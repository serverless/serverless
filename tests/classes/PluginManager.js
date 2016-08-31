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

  beforeEach(() => {
    serverless = new Serverless();
    pluginManager = new PluginManager(serverless);
  });

  describe('#constructor()', () => {
    it('should set the serverless instance', () => {
      expect(pluginManager.serverless).to.deep.equal(serverless);
    });

    it('should create a nullified provider variable', () => {
      expect(pluginManager.provider).to.equal(null);
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

    it('should create an empty commandsList array', () => {
      expect(pluginManager.commandsList.length).to.equal(0);
    });

    it('should create an empty commands object', () => {
      expect(pluginManager.commands).to.deep.equal({});
    });
  });

  describe('#setProvider()', () => {
    it('should set the provider variable', () => {
      const provider = 'provider1';
      pluginManager.setProvider(provider);

      expect(pluginManager.provider).to.equal(provider);
    });
  });

  describe('#setCliOptions()', () => {
    it('should set the cliOptions object', () => {
      const options = { foo: 'bar' };
      pluginManager.setCliOptions(options);

      expect(pluginManager.cliOptions).to.deep.equal(options);
    });
  });

  describe('#setCliCOmmands()', () => {
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
      const commandsMock = {
        deploy: {
          options: {
            region: {
              shortcut: 'r',
            },
          },
        },
      };
      pluginManager.setCliCommands(cliCommandsMock);
      pluginManager.setCliOptions(cliOptionsMock);

      pluginManager.convertShortcutsIntoOptions(cliOptionsMock, commandsMock);

      expect(pluginManager.cliOptions.region).to.equal(cliOptionsMock.r);
    });

    it('should convert shortcuts into options when a two level deep command matches', () => {
      const cliOptionsMock = { f: 'function-1', function: 'function-2' };
      const cliCommandsMock = ['deploy', 'function']; // command with two level deepness
      const commandsMock = {
        deploy: {
          commands: {
            function: {
              options: {
                function: {
                  shortcut: 'f',
                },
              },
            },
          },
        },
      };
      pluginManager.setCliCommands(cliCommandsMock);
      pluginManager.setCliOptions(cliOptionsMock);

      pluginManager.convertShortcutsIntoOptions(cliOptionsMock, commandsMock);

      expect(pluginManager.cliOptions.function).to.equal(cliOptionsMock.f);
    });

    it('should not convert shortcuts into options when the command does not match', () => {
      const cliOptionsMock = { r: 'eu-central-1', region: 'us-east-1' };
      const cliCommandsMock = ['foo'];
      const commandsMock = {
        deploy: {
          options: {
            region: {
              shortcut: 'r',
            },
          },
        },
      };
      pluginManager.setCliCommands(cliCommandsMock);
      pluginManager.setCliOptions(cliOptionsMock);

      pluginManager.convertShortcutsIntoOptions(cliOptionsMock, commandsMock);

      expect(pluginManager.cliOptions.region).to.equal(cliOptionsMock.region);
    });

    it('should not convert shortcuts into options when the shortcut is not given', () => {
      const cliOptionsMock = { r: 'eu-central-1', region: 'us-east-1' };
      const cliCommandsMock = ['deploy'];
      const commandsMock = {
        deploy: {
          options: {
            region: {},
          },
        },
      };
      pluginManager.setCliCommands(cliCommandsMock);
      pluginManager.setCliOptions(cliOptionsMock);

      pluginManager.convertShortcutsIntoOptions(cliOptionsMock, commandsMock);

      expect(pluginManager.cliOptions.region).to.equal(cliOptionsMock.region);
    });
  });

  describe('#addPlugin()', () => {
    it('should add a plugin instance to the plugins array', () => {
      pluginManager.addPlugin(SynchronousPluginMock);

      expect(pluginManager.plugins[0]).to.be.an.instanceof(SynchronousPluginMock);
    });

    it('should load the plugin commands', () => {
      pluginManager.addPlugin(SynchronousPluginMock);

      expect(pluginManager.commandsList[0]).to.have.property('deploy');
    });
  });

  describe('#loadAllPlugins()', () => {
    beforeEach(() => {
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

    afterEach(() => {
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
    beforeEach(() => {
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

    afterEach(() => {
      mockRequire.stop('ServicePluginMock1');
      mockRequire.stop('ServicePluginMock2');
    });
  });

  describe('#loadCommands()', () => {
    it('should load the plugin commands', () => {
      const synchronousPluginMockInstance = new SynchronousPluginMock();
      pluginManager.loadCommands(synchronousPluginMockInstance);

      expect(pluginManager.commandsList[0]).to.have.property('deploy');
    });
  });

  describe('#getEvents()', () => {
    beforeEach(() => {
      const synchronousPluginMockInstance = new SynchronousPluginMock();
      pluginManager.loadCommands(synchronousPluginMockInstance);
    });

    it('should get all the matching events for a root level command in the correct order', () => {
      const commandsArray = ['deploy'];
      const events = pluginManager.getEvents(commandsArray, pluginManager.commands);

      expect(events[0]).to.equal('before:deploy:resources');
      expect(events[1]).to.equal('deploy:resources');
      expect(events[2]).to.equal('after:deploy:resources');
      expect(events[3]).to.equal('before:deploy:functions');
      expect(events[4]).to.equal('deploy:functions');
      expect(events[5]).to.equal('after:deploy:functions');
    });

    it('should get all the matching events for a nested level command in the correct order', () => {
      const commandsArray = ['deploy', 'onpremises'];
      const events = pluginManager.getEvents(commandsArray, pluginManager.commands);

      expect(events[0]).to.equal('before:deploy:onpremises:resources');
      expect(events[1]).to.equal('deploy:onpremises:resources');
      expect(events[2]).to.equal('after:deploy:onpremises:resources');
      expect(events[3]).to.equal('before:deploy:onpremises:functions');
      expect(events[4]).to.equal('deploy:onpremises:functions');
      expect(events[5]).to.equal('after:deploy:onpremises:functions');
    });

    it('should return an empty events array when the command is not defined', () => {
      const commandsArray = ['foo'];
      const events = pluginManager.getEvents(commandsArray, pluginManager.commands);

      expect(events.length).to.equal(0);
    });
  });

  describe('#getPlugins()', () => {
    beforeEach(() => {
      mockRequire('ServicePluginMock1', ServicePluginMock1);
      mockRequire('ServicePluginMock2', ServicePluginMock2);
    });

    it('should return all loaded plugins', () => {
      const servicePlugins = ['ServicePluginMock1', 'ServicePluginMock2'];
      pluginManager.loadServicePlugins(servicePlugins);

      expect(pluginManager.getPlugins()[0]).to.be.instanceof(ServicePluginMock1);
      expect(pluginManager.getPlugins()[1]).to.be.instanceof(ServicePluginMock2);
    });

    afterEach(() => {
      mockRequire.stop('ServicePluginMock1');
      mockRequire.stop('ServicePluginMock2');
    });
  });

  describe('#validateCommands()', () => {
    it('should throw an error if a first level command is not found in the commands object', () => {
      pluginManager.commands = {
        foo: {},
      };
      const commandsArray = ['bar'];

      expect(() => { pluginManager.validateCommands(commandsArray); }).to.throw(Error);
    });
  });

  describe('#validateOptions()', () => {
    it('should throw an error if a required option is not set in a plain commands object', () => {
      pluginManager.commands = {
        foo: {
          options: {
            bar: {
              required: true,
            },
          },
        },
      };
      const commandsArray = ['foo'];

      expect(() => { pluginManager.validateOptions(commandsArray); }).to.throw(Error);
    });

    it('should throw an error if a required option is not set in a nested commands object', () => {
      pluginManager.commands = {
        foo: {
          commands: {
            bar: {
              options: {
                baz: {
                  required: true,
                },
              },
            },
          },
        },
      };
      const commandsArray = ['foo', 'bar'];

      expect(() => { pluginManager.validateOptions(commandsArray); }).to.throw(Error);
    });
  });

  describe('#run()', () => {
    it('should throw an error when the given command is not available', () => {
      pluginManager.addPlugin(SynchronousPluginMock);

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
      beforeEach(() => {
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
      beforeEach(() => {
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
          pluginManager.run(commandsArray)
            .then(() => expect(pluginManager.plugins[0].deployedResources)
              .to.equal(1));
        });
      });
    });

    describe('when using provider specific plugins', () => {
      beforeEach(() => {
        pluginManager.setProvider('provider1');

        pluginManager.addPlugin(Provider1PluginMock);
        pluginManager.addPlugin(Provider2PluginMock);

        // this plugin should be run each and every time as it doesn't specify any provider
        pluginManager.addPlugin(SynchronousPluginMock);
      });

      it('should run only the providers plugins (if the provider is specified)', () => {
        const commandsArray = ['deploy'];
        pluginManager.run(commandsArray).then(() => {
          expect(pluginManager.plugins[0].deployedFunctions).to.equal(1);
          expect(pluginManager.plugins[1].deployedFunctions).to.equal(0);

          // other, provider independent plugins should also be run
          expect(pluginManager.plugins[2].deployedFunctions).to.equal(1);
        });
      });
    });
  });

  describe('Plugin/CLI integration', () => {
    const serverlessInstance = new Serverless();
    serverlessInstance.init();
    const serverlessExec = path.join(serverlessInstance.config.serverlessPath,
      '..', 'bin', 'serverless');
    const tmpDir = testUtils.getTmpDirPath();
    fse.mkdirSync(tmpDir);
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
