'use strict';

const chai = require('chai');
const sinon = require('sinon');
const BbPromise = require('bluebird');
const proxyquire = require('proxyquire');
const chalk = require('chalk');
const PluginList = require('../../../../../../lib/plugins/plugin/list');
const Serverless = require('../../../../../../lib/Serverless');
const CLI = require('../../../../../../lib/classes/CLI');
const { expect } = require('chai');

chai.use(require('chai-as-promised'));

describe('PluginUtils', () => {
  let pluginUtils;
  let serverless;
  const plugins = [
    {
      name: 'serverless-plugin-1',
      description: 'Serverless Plugin 1',
      githubUrl: 'https://github.com/serverless/serverless-plugin-1',
    },
    {
      name: 'serverless-plugin-2',
      description: 'Serverless Plugin 2',
      githubUrl: 'https://github.com/serverless/serverless-plugin-2',
    },
    {
      name: 'serverless-existing-plugin',
      description: 'Serverless Existing plugin',
      githubUrl: 'https://github.com/serverless/serverless-existing-plugin',
    },
  ];

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} });
    serverless.cli = new CLI(serverless);
    const options = {};
    pluginUtils = new PluginList(serverless, options);
  });

  describe('#getPlugins()', () => {
    let fetchStub;
    let pluginWithFetchStub;

    beforeEach(() => {
      fetchStub = sinon.stub().returns(
        BbPromise.resolve({
          json: sinon.stub().returns(BbPromise.resolve(plugins)),
        })
      );
      pluginWithFetchStub = proxyquire('../../../../../../lib/plugins/plugin/lib/utils.js', {
        'node-fetch': fetchStub,
      });
    });

    it('should fetch and return the plugins from the plugins repository', () => {
      const endpoint = 'https://raw.githubusercontent.com/serverless/plugins/master/plugins.json';

      return pluginWithFetchStub.getPlugins().then((result) => {
        expect(fetchStub.calledOnce).to.equal(true);
        expect(fetchStub.args[0][0]).to.equal(endpoint);
        expect(result).to.deep.equal(plugins);
      });
    });
  });

  describe('#display()', () => {
    it('should display the plugins if present', () => {
      let expectedMessage = '';
      expectedMessage += `${chalk.yellow.underline('serverless-existing-plugin')}`;
      expectedMessage += ' - Serverless Existing plugin\n';
      expectedMessage += `${chalk.yellow.underline('serverless-plugin-1')}`;
      expectedMessage += ' - Serverless Plugin 1\n';
      expectedMessage += `${chalk.yellow.underline('serverless-plugin-2')}`;
      expectedMessage += ' - Serverless Plugin 2\n';
      expectedMessage = expectedMessage.slice(0, -2);
      return expect(pluginUtils.display(plugins)).to.be.fulfilled.then((message) => {
        expect(message).to.equal(expectedMessage);
      });
    });

    it('should print a message when no plugins are available to display', () => {
      const expectedMessage = 'There are no plugins available to display';

      return pluginUtils.display([]).then((message) => {
        expect(message).to.equal(expectedMessage);
      });
    });
  });
});
