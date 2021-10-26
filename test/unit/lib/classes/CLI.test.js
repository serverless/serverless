'use strict';

const chai = require('chai');
const sinon = require('sinon');
const CLI = require('../../../../lib/classes/CLI');
const overrideArgv = require('process-utils/override-argv');
const Serverless = require('../../../../lib/Serverless');
const resolveInput = require('../../../../lib/cli/resolve-input');

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

  describe('#suppressLogIfPrintCommand()', () => {
    let logStub;
    let consoleLogStub;

    beforeEach(() => {
      logStub = sinon.stub();
      consoleLogStub = sinon.stub();
    });

    it('should do nothing when no command is given', () => {
      cli = new CLI(serverless);
      cli.log = logStub;
      cli.consoleLog = consoleLogStub;

      cli.suppressLogIfPrintCommand({ commands: [], options: {} });
      cli.log('logged');
      cli.consoleLog('logged');

      expect(logStub.calledOnce).to.equal(true);
      expect(consoleLogStub.calledOnce).to.equal(true);
    });

    it('should do nothing when "print" is given with "--help"', () => {
      cli = new CLI(serverless);
      cli.log = logStub;
      cli.consoleLog = consoleLogStub;

      resolveInput.clear();
      overrideArgv({ args: ['serverless', '--help'] }, () =>
        cli.suppressLogIfPrintCommand({
          commands: ['print'],
          options: { help: true },
        })
      );
      resolveInput.clear();
      cli.log('logged');
      cli.consoleLog('logged');

      expect(logStub.calledOnce).to.equal(true);
      expect(consoleLogStub.calledOnce).to.equal(true);
    });

    it('should do nothing when "print" is combined with other command.', () => {
      cli = new CLI(serverless);
      cli.log = logStub;
      cli.consoleLog = consoleLogStub;

      cli.suppressLogIfPrintCommand({ commands: ['other', 'print'], options: {} });
      cli.log('logged');
      cli.consoleLog('logged');

      expect(logStub.calledOnce).to.equal(true);
      expect(consoleLogStub.calledOnce).to.equal(true);
    });

    it('should suppress log when "print" is given', () => {
      cli = new CLI(serverless);
      cli.log = logStub;
      cli.consoleLog = consoleLogStub;

      cli.suppressLogIfPrintCommand({ commands: ['print'], options: {} });
      cli.log('NOT LOGGED');
      cli.consoleLog('logged');

      expect(logStub.calledOnce).to.equal(false);
      expect(consoleLogStub.calledOnce).to.equal(true);
    });
  });
});
