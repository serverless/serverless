'use strict';

/**
 * Test: PluginManager Class
 */

const expect = require('chai').expect;
const PluginManager = require('../../../lib/classes/PluginManager');
const Serverless = require('../../../lib/Serverless');
const HelloWorld = require('../../../lib/plugins/HelloWorld/HelloWorld');

describe('PluginManager', () => {
  let pluginManager;
  let serverless;
  let helloWorld;

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
        'before:deploy:onpremises:functions': this.resources.bind(this)
      };

      // used to test if the function was executed correctly
      this.deployedFunctions = 0;
      this.deployedResources = 0;
    }

    functions() {
      return new Promise((resolve, reject) => {
        this.deployedFunctions = this.deployedFunctions + 1;
        return resolve();
      });
    }

    resources() {
      return new Promise((resolve, reject) => {
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
    serverless = new Serverless({});
    pluginManager = new PluginManager(serverless);
    helloWorld = new HelloWorld();
  });

  describe('#constructor()', () => {
    it('should set the serverless instance', () => {
      expect(pluginManager.serverless).to.deep.equal(serverless);
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
    it('should load only core plugins when no service plugins are given', () => {
      // Note: We need the HelloWorld plugin for this test to pass
      pluginManager.loadAllPlugins();

      expect(pluginManager.plugins).to.include(helloWorld);
    });

    it('should load all plugins when service plugins are given', () => {
      const servicePlugins = [ServicePluginMock1, ServicePluginMock2];
      pluginManager.loadAllPlugins(servicePlugins);

      const servicePluginMock1 = new ServicePluginMock1();
      const servicePluginMock2 = new ServicePluginMock2();

      expect(pluginManager.plugins).to.contain(servicePluginMock1);
      expect(pluginManager.plugins).to.contain(servicePluginMock2);
      expect(pluginManager.plugins).to.contain(helloWorld);
    });
  });

  describe('#loadCorePlugins()', () => {
    it('should load the Serverless core plugins', () => {
      pluginManager.loadCorePlugins();

      expect(pluginManager.plugins).to.contain(helloWorld);
    });
  });

  describe('#loadServicePlugins()', () => {
    it('should load the service plugins', () => {
      const servicePlugins = [ServicePluginMock1, ServicePluginMock2];
      pluginManager.loadServicePlugins(servicePlugins);

      const servicePluginMock1 = new ServicePluginMock1();
      const servicePluginMock2 = new ServicePluginMock2();

      expect(pluginManager.plugins).to.contain(servicePluginMock1);
      expect(pluginManager.plugins).to.contain(servicePluginMock2);
    });
  });

  describe('#loadCommands()', () => {
    it('should load the plugin commands', () => {
      pluginManager.loadCommands(SynchronousPluginMock);

      expect(pluginManager.commandsList[0]).to.have.property('deploy');
    });
  });

  describe('#getEvents()', () => {
    beforeEach(() => {
      pluginManager.loadCommands(SynchronousPluginMock);
    });

    it('should get all the matching events for a root level command', () => {
      const commandsArray = ['deploy'];
      const events = pluginManager.getEvents(commandsArray, pluginManager.commands);

      expect(events).to.contain('before:deploy:resources');
      expect(events).to.contain('deploy:resources');
      expect(events).to.contain('after:deploy:resources');
      expect(events).to.contain('before:deploy:functions');
      expect(events).to.contain('deploy:functions');
      expect(events).to.contain('after:deploy:functions');
    });

    it('should get all the matching events for a nested level command', () => {
      const commandsArray = ['deploy', 'onpremises'];
      const events = pluginManager.getEvents(commandsArray, pluginManager.commands);

      expect(events).to.contain('before:deploy:onpremises:resources');
      expect(events).to.contain('deploy:onpremises:resources');
      expect(events).to.contain('after:deploy:onpremises:resources');
      expect(events).to.contain('before:deploy:onpremises:functions');
      expect(events).to.contain('deploy:onpremises:functions');
      expect(events).to.contain('after:deploy:onpremises:functions');
    });

    it('should return an empty events array when the command is not defined', () => {
      const commandsArray = ['foo'];
      const events = pluginManager.getEvents(commandsArray, pluginManager.commands);

      expect(events.length).to.equal(0);
    });
  });

  describe('#runCommand()', () => {
    it('should throw an error when the given command is not available', () => {
      pluginManager.addPlugin(SynchronousPluginMock);

      const commandsArray = ['foo'];

      expect(() => { pluginManager.runCommand(commandsArray); }).to.throw(Error);
    });

    describe('when using a synchronous hook function', () => {
      beforeEach(() => {
        pluginManager.addPlugin(SynchronousPluginMock);
      });

      it('should run a simple command', () => {
        const commandsArray = ['deploy'];
        pluginManager.runCommand(commandsArray);

        expect(pluginManager.plugins[0].deployedFunctions).to.equal(1);
      });

      it('should run a nested command', () => {
        const commandsArray = ['deploy', 'onpremises'];
        pluginManager.runCommand(commandsArray);

        expect(pluginManager.plugins[0].deployedResources).to.equal(1);
      });
    });

    describe('when using a promise based hook function', () => {
      beforeEach(() => {
        pluginManager.addPlugin(PromisePluginMock);
      });

      it('should run a simple command', () => {
        const commandsArray = ['deploy'];
        pluginManager.runCommand(commandsArray);

        expect(pluginManager.plugins[0].deployedFunctions).to.equal(1);
      });

      it('should run a nested command', () => {
        const commandsArray = ['deploy', 'onpremises'];
        pluginManager.runCommand(commandsArray);

        expect(pluginManager.plugins[0].deployedResources).to.equal(1);
      });
    });
  });
});
