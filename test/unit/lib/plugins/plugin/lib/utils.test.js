'use strict';

const chai = require('chai');
const sinon = require('sinon');
const BbPromise = require('bluebird');
const proxyquire = require('proxyquire');
const PluginList = require('../../../../../../lib/plugins/plugin/list');
const Serverless = require('../../../../../../lib/serverless');
const CLI = require('../../../../../../lib/classes/cli');
const { expect } = require('chai');
const observeOutput = require('@serverless/test/observe-output');

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
    it('should display the plugins if present', async () => {
      const output = await observeOutput(() => pluginUtils.display(plugins));
      let expectedMessage = '';
      expectedMessage += 'serverless-existing-plugin Serverless Existing plugin\n';
      expectedMessage += 'serverless-plugin-1 Serverless Plugin 1\n';
      expectedMessage += 'serverless-plugin-2 Serverless Plugin 2\n\n';
      expectedMessage += 'Install a plugin by running:\n';
      expectedMessage += '  serverless plugin install --name ...\n\n';
      expectedMessage +=
        'It will be automatically downloaded and added to package.json and serverless.yml\n';
      expect(output).to.equal(expectedMessage);
    });
  });
});
