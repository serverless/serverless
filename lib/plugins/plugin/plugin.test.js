'use strict';

const chai = require('chai');
const sinon = require('sinon');
const BbPromise = require('bluebird');
const Plugin = require('./plugin');
const Serverless = require('../../Serverless');
const CLI = require('../../classes/CLI');
chai.use(require('chai-as-promised'));
const expect = require('chai').expect;

describe('Plugin', () => {
  let plugin;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.cli = new CLI(serverless);
    const options = {};
    plugin = new Plugin(serverless, options);
  });

  describe('#constructor()', () => {
    let generateCommandsHelpStub;

    beforeEach(() => {
      generateCommandsHelpStub = sinon
        .stub(plugin.serverless.cli, 'generateCommandsHelp').returns(BbPromise.resolve());
    });

    afterEach(() => {
      plugin.serverless.cli.generateCommandsHelp.restore();
    });

    it('should have the command "plugin"', () => {
      expect(plugin.commands.plugin).to.not.equal(undefined);
    });

    it('should have the lifecycle event "plugin" for the "plugin" command', () => {
      expect(plugin.commands.plugin.lifecycleEvents).to.deep.equal([
        'plugin',
      ]);
    });

    it('should have no option for the "plugin" command', () => {
      // eslint-disable-next-line no-unused-expressions
      expect(plugin.commands.options).to.equal(undefined);
    });

    it('should have a "plugin:plugin" hook', () => {
      expect(plugin.hooks['plugin:plugin']).to.not.equal(undefined);
    });

    it('should run promise chain in order for "plugin:plugin" hook',
      () => expect(plugin.hooks['plugin:plugin']()).to.be.fulfilled.then(() => {
        expect(generateCommandsHelpStub.calledOnce).to.equal(true);
      })
    );
  });
});
