'use strict';

const chai = require('chai');
const CLI = require('../../../../lib/classes/cli');
const Serverless = require('../../../../lib/serverless');

const { expect } = chai;
chai.use(require('sinon-chai'));

describe('CLI', () => {
  let cli;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} });
  });

  describe('#constructor()', () => {
    it('should set the serverless instance', () => {
      cli = new CLI(serverless);
      expect(cli.serverless).to.deep.equal(serverless);
    });

    it('should set an empty loadedPlugins array', () => {
      cli = new CLI(serverless);
      expect(cli.loadedPlugins.length).to.equal(0);
    });
  });

  describe('#setLoadedPlugins()', () => {
    it('should set the loadedPlugins array with the given plugin instances', () => {
      class PluginMock {}

      const pluginMock = new PluginMock();
      const plugins = [pluginMock];

      cli = new CLI(serverless);

      cli.setLoadedPlugins(plugins);

      expect(cli.loadedPlugins[0]).to.equal(pluginMock);
    });
  });
});
