'use strict';

/**
 * Test: PluginManagement Class
 */

const expect = require('chai').expect;
const PluginManagement = require('../../../lib/classes/PluginManagement');
const Serverless = require('../../../lib/Serverless');

describe('PluginManagement', () => {
  let pluginManagement;
  let serverless;

  class MockPlugin {
    constructor() {
      this.commands = {
        deploy: {
          usage: 'Deploy to the default infrastructure',
          lifeCycleEvents: [
            'resources',
            'functions'
          ],
          commands: {
            onpremise: {
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
        'deploy:functions': this.functions,
        'deploy:onpremise:functions': this.resources,
      };
    }

    functions() {
      return 'Deploying functions';
    }

    resources() {
      return 'Deploying resources';
    }
  }

  beforeEach(() => {
    serverless = new Serverless({});
    pluginManagement = new PluginManagement(serverless);
  });

  describe('#constructor()', () => {
    it('should set the serverless instance', () => {
      expect(pluginManagement._serverless).to.deep.equal(serverless);
    });

    it('should create an empty pluginInstances array', () => {
      expect(pluginManagement._pluginInstances.length).to.equal(0);
    });

    it('should create an empty commandsList array', () => {
      expect(pluginManagement._commandsList.length).to.equal(0);
    });

    it('should create an empty commands object', () => {
      expect(pluginManagement._commands).to.deep.equal({});
    });
  });

  describe('#addPlugin()', () => {
    it('should add a plugin instance to the pluginInstances array', () => {
      pluginManagement._addPlugin(MockPlugin);

      expect(pluginManagement._pluginInstances[0]).to.be.an.instanceof(MockPlugin);
    });

    it('should load the plugin commands', () => {
      pluginManagement._addPlugin(MockPlugin);

      expect(pluginManagement._commandsList[0]).to.have.property('deploy');
    });
  });

  describe('#loadAllPlugins()', () => {
    it('should load all plugins', () => {
      pluginManagement.loadAllPlugins();

      expect(pluginManagement._pluginInstances.length).to.be.at.least(1);
    });
  });

  describe('#loadCorePlugins()', () => {
    it('should load the Serverless core plugins', () => {
      pluginManagement._loadCorePlugins();

      expect(pluginManagement._pluginInstances.length).to.be.at.least(1);
    });
  });

  describe('#loadServicePlugins()', () => {

    it('should load the service plugins');

  });

  describe('#loadCommands()', () => {
    it('should load the plugin commands', () => {
      pluginManagement._loadCommands(MockPlugin);

      expect(pluginManagement._commandsList[0]).to.have.property('deploy');
    });
  });

  describe('#getEvents()', () => {
    beforeEach(() => {
      pluginManagement._loadCommands(MockPlugin);
    });

    it('should get all the matching events for a root level command', () => {
      const commandsArray = 'deploy'.split(' ');
      const events = pluginManagement._getEvents(commandsArray, pluginManagement._commands);

      // Note: We expect at least 3 because 3 events will be created for each lifeCycleEvent
      expect(events.length).to.be.at.least(3);
    });

    it('should get all the matching events for a nestec level command', () => {
      const commandsArray = 'deploy onpremise'.split(' ');
      const events = pluginManagement._getEvents(commandsArray, pluginManagement._commands);

      // Note: We expect at least 3 because 3 events will be created for each lifeCycleEvent
      expect(events.length).to.be.at.least(3);
    });

    it('should return an empty events array when the command is not defined', () => {
      const commandsArray = 'nonExistingCommand'.split(' ');
      const events = pluginManagement._getEvents(commandsArray, pluginManagement._commands);

      expect(events.length).to.equal(0);
    });
  });

  describe('#runCommand()', () => {
    beforeEach(() => {
      pluginManagement._addPlugin(MockPlugin);
    });

    it('should run a simple command', () => {
      const command = 'deploy';

      pluginManagement.runCommand(command);
    });

    it('should run a nested command', () => {
      const command = 'deploy onpremise';

      pluginManagement.runCommand(command);
    });
  });
});
