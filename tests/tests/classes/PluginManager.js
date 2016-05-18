'use strict';

/**
 * Test: PluginManager Class
 */

const expect = require('chai').expect;
const PluginManager = require('../../../lib/classes/PluginManager');
const Serverless = require('../../../lib/Serverless');

describe('PluginManager', () => {
  let pluginManager;
  let serverless;

  class ServicePluginMock1 {}

  class ServicePluginMock2 {}

  class PromisePluginMock {
    constructor() {
      this.commands = {
        deploy: {
          usage: 'Deploy to the default infrastructure',
          lifeCycleEvents: [
            'resources',
            'functions'
          ],
          commands: {
            onpremises: {
              usage: 'Deploy to your On-Premises infrastructure',
              lifeCycleEvents: [
                'resources',
                'functions'
              ],
            },
          },
        },
      };

      this.hooks = {
        'deploy:functions': this.functions.bind(this),
        'deploy:onpremises:beforeFunctions': this.resources.bind(this)
      };

      // used to test if the function was executed correctly
      this._deployedFunctions = 0;
      this._deployedResources = 0;
    }

    functions() {
      return new Promise((resolve, reject) => {
        this._deployedFunctions = this._deployedFunctions + 1;
        return resolve();
      });
    }

    resources() {
      return new Promise((resolve, reject) => {
        this._deployedResources = this._deployedResources + 1;
        return resolve();
      });
    }
  }

  class SynchronousPluginMock {
    constructor() {
      this.commands = {
        deploy: {
          usage: 'Deploy to the default infrastructure',
          lifeCycleEvents: [
            'resources',
            'functions'
          ],
          commands: {
            onpremises: {
              usage: 'Deploy to your On-Premises infrastructure',
              lifeCycleEvents: [
                'resources',
                'functions'
              ],
            },
          },
        },
      };

      this.hooks = {
        'deploy:functions': this.functions.bind(this),
        'deploy:onpremises:beforeFunctions': this.resources.bind(this),
      };

      // used to test if the function was executed correctly
      this._deployedFunctions = 0;
      this._deployedResources = 0;
    }

    functions() {
      this._deployedFunctions = this._deployedFunctions + 1;
    }

    resources() {
      this._deployedResources = this._deployedResources + 1;
    }
  }

  beforeEach(() => {
    serverless = new Serverless({});
    pluginManager = new PluginManager(serverless);
  });

  describe('#constructor()', () => {
    it('should set the serverless instance', () => {
      expect(pluginManager._serverless).to.deep.equal(serverless);
    });

    it('should create an empty pluginInstances array', () => {
      expect(pluginManager._pluginInstances.length).to.equal(0);
    });

    it('should create an empty commandsList array', () => {
      expect(pluginManager._commandsList.length).to.equal(0);
    });

    it('should create an empty commands object', () => {
      expect(pluginManager._commands).to.deep.equal({});
    });
  });

  describe('#addPlugin()', () => {
    it('should add a plugin instance to the pluginInstances array', () => {
      pluginManager._addPlugin(SynchronousPluginMock);

      expect(pluginManager._pluginInstances[0]).to.be.an.instanceof(SynchronousPluginMock);
    });

    it('should load the plugin commands', () => {
      pluginManager._addPlugin(SynchronousPluginMock);

      expect(pluginManager._commandsList[0]).to.have.property('deploy');
    });
  });

  describe('#loadAllPlugins()', () => {
    describe('when loading all plugins', () => {
      it('should load all plugins when no service plugins are given', () => {
        pluginManager.loadAllPlugins();

        expect(pluginManager._pluginInstances.length).to.be.at.least(1);
      });

      it('should load all plugins when service plugins are given', () => {
        const servicePlugins = [ServicePluginMock1, ServicePluginMock2];
        pluginManager.loadAllPlugins(servicePlugins);

        // Note: We expect at least 3 because we have one core plugin and two service plugins
        expect(pluginManager._pluginInstances.length).to.be.at.least(3);
      });
    });
  });

  describe('#loadCorePlugins()', () => {
    it('should load the Serverless core plugins', () => {
      pluginManager._loadCorePlugins();

      expect(pluginManager._pluginInstances.length).to.be.at.least(1);
    });
  });

  describe('#loadServicePlugins()', () => {
    it('should load the service plugins', () => {
      const servicePlugins = [ServicePluginMock1, ServicePluginMock2];
      pluginManager._loadServicePlugins(servicePlugins);

      expect(pluginManager._pluginInstances.length).to.equal(2);
    });
  });

  describe('#loadCommands()', () => {
    it('should load the plugin commands', () => {
      pluginManager._loadCommands(SynchronousPluginMock);

      expect(pluginManager._commandsList[0]).to.have.property('deploy');
    });
  });

  describe('#getEvents()', () => {
    beforeEach(() => {
      pluginManager._loadCommands(SynchronousPluginMock);
    });

    it('should get all the matching events for a root level command', () => {
      const commandsArray = 'deploy'.split(' ');
      const events = pluginManager._getEvents(commandsArray, pluginManager._commands);

      // Note: We expect at least 3 because 3 events will be created for each lifeCycleEvent
      expect(events.length).to.be.at.least(3);
    });

    it('should get all the matching events for a nestec level command', () => {
      const commandsArray = 'deploy onpremises'.split(' ');
      const events = pluginManager._getEvents(commandsArray, pluginManager._commands);

      // Note: We expect at least 3 because 3 events will be created for each lifeCycleEvent
      expect(events.length).to.be.at.least(3);
    });

    it('should return an empty events array when the command is not defined', () => {
      const commandsArray = 'nonExistingCommand'.split(' ');
      const events = pluginManager._getEvents(commandsArray, pluginManager._commands);

      expect(events.length).to.equal(0);
    });
  });

  describe('#runCommand()', () => {
    it('should not care about correct capitalization of function name inside a hook', () => {
      class WrongCapitalizedHookPluginMock {
        constructor() {
          this.commands = {
            deploy: {
              usage: 'Deploy to the default infrastructure',
              lifeCycleEvents: [
                'functions',
              ],
            },
          };

          this.hooks = {
            // should be "beforeFunctions" but the PluginManager should not bother
            'deploy:beforefunctions': this.functions.bind(this)
          };

          // used to test if the function was executed correctly
          this._deployedFunctions = 0;
        }

        functions() {
          this._deployedFunctions = this._deployedFunctions + 1;
        }
      }

      pluginManager._addPlugin(WrongCapitalizedHookPluginMock);

      const command = 'deploy';
      pluginManager.runCommand(command);

      expect(pluginManager._pluginInstances[0]._deployedFunctions).to.equal(1);
    });

    describe('when using a synchronous hook function', () => {
      beforeEach(() => {
        pluginManager._addPlugin(SynchronousPluginMock);
      });

      it('should run a simple command', () => {
        const command = 'deploy';
        pluginManager.runCommand(command);

        expect(pluginManager._pluginInstances[0]._deployedFunctions).to.equal(1);
      });

      it('should run a nested command', () => {
        const command = 'deploy onpremises';
        pluginManager.runCommand(command);

        expect(pluginManager._pluginInstances[0]._deployedResources).to.equal(1);
      });
    });

    describe('when using a promise based hook function', () => {
      beforeEach(() => {
        pluginManager._addPlugin(PromisePluginMock);
      });

      it('should run a simple command', () => {
        const command = 'deploy';
        pluginManager.runCommand(command);

        expect(pluginManager._pluginInstances[0]._deployedFunctions).to.equal(1);
      });

      it('should run a nested command', () => {
        const command = 'deploy onpremises';
        pluginManager.runCommand(command);

        expect(pluginManager._pluginInstances[0]._deployedResources).to.equal(1);
      });
    });
  });
});
