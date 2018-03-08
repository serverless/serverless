'use strict';

const chai = require('chai');
const sinon = require('sinon');
const BbPromise = require('bluebird');
const PluginList = require('./list');
const Serverless = require('../../../Serverless');
const CLI = require('../../../classes/CLI');
chai.use(require('chai-as-promised'));
const expect = require('chai').expect;

describe('PluginList', () => {
  let pluginList;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.cli = new CLI(serverless);
    const options = {};
    pluginList = new PluginList(serverless, options);
  });

  describe('#constructor()', () => {
    let listStub;

    beforeEach(() => {
      listStub = sinon
        .stub(pluginList, 'list').returns(BbPromise.resolve());
    });

    afterEach(() => {
      pluginList.list.restore();
    });

    it('should have the sub-command "list"', () => {
      expect(pluginList.commands.plugin.commands.list).to.not.equal(undefined);
    });

    it('should have the lifecycle event "list" for the "list" sub-command', () => {
      expect(pluginList.commands.plugin.commands.list.lifecycleEvents).to.deep.equal([
        'list',
      ]);
    });

    it('should have no option for the "list" sub-command', () => {
      // eslint-disable-next-line no-unused-expressions
      expect(pluginList.commands.plugin.commands.list.options).to.equal(undefined);
    });

    it('should have a "plugin:list:list" hook', () => {
      expect(pluginList.hooks['plugin:list:list']).to.not.equal(undefined);
    });

    it('should run promise chain in order for "plugin:list:list" hook',
      () => expect(pluginList.hooks['plugin:list:list']()).to.be.fulfilled.then(() => {
        expect(listStub.calledOnce).to.equal(true);
      })
    );
  });

  describe('#list()', () => {
    let getPluginsStub;
    let displayStub;

    beforeEach(() => {
      getPluginsStub = sinon
        .stub(pluginList, 'getPlugins').returns(BbPromise.resolve());
      displayStub = sinon
        .stub(pluginList, 'display').returns(BbPromise.resolve());
    });

    afterEach(() => {
      pluginList.getPlugins.restore();
      pluginList.display.restore();
    });

    it('should print a list with all available plugins', () =>
      pluginList.list().then(() => {
        expect(getPluginsStub.calledOnce).to.equal(true);
        expect(displayStub.calledOnce).to.equal(true);
      })
    );
  });
});
