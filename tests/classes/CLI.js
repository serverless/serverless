'use strict';

/**
 * Test: CLI Class
 */

const expect = require('chai').expect;
const CLI = require('../../lib/classes/CLI');
const Serverless = require('../../lib/Serverless');

describe('CLI', () => {
  let cli;
  let serverless;
  const isInteractive = false;

  beforeEach(() => {
    serverless = new Serverless({});
  });

  describe('#construtor()', () => {
    it('should set the serverless instance', () => {
      cli = new CLI(serverless, isInteractive);
      expect(cli.serverless).to.deep.equal(serverless);
    });

    it('should set the isInteractive option', () => {
      cli = new CLI(serverless, isInteractive);
      expect(cli.isInteractive).to.equal(isInteractive);
    });

    it('should set an empty argumentsArray when none is provided', () => {
      cli = new CLI(serverless, isInteractive);
      expect(cli.argumentsArray.length).to.equal(0);
    });

    it('should set the argumentsArray when provided', () => {
      const cliWithArguments = new CLI(serverless, isInteractive, ['foo', 'bar']);

      expect(cliWithArguments.argumentsArray[0]).to.equal('foo');
      expect(cliWithArguments.argumentsArray[1]).to.equal('bar');
    });
  });

  describe('#processCommands()', () => {
    it('should return an empty array when the "help" parameter is given', () => {
      const cliWithExternalArguments = new CLI(serverless, isInteractive, ['help']);
      const commandsToBeProcessed = cliWithExternalArguments.processCommands();

      expect(commandsToBeProcessed.length).to.equal(0);
    });

    it('should return an empty array when the "--help" parameter is given', () => {
      const cliWithExternalArguments = new CLI(serverless, isInteractive, ['--help']);
      const commandsToBeProcessed = cliWithExternalArguments.processCommands();

      expect(commandsToBeProcessed.length).to.equal(0);
    });

    it('should return an empty array when the "--h" parameter is given', () => {
      const cliWithExternalArguments = new CLI(serverless, isInteractive, ['--h']);
      const commandsToBeProcessed = cliWithExternalArguments.processCommands();

      expect(commandsToBeProcessed.length).to.equal(0);
    });

    it('should return an empty array when the "version" parameter is given', () => {
      const cliWithExternalArguments = new CLI(serverless, isInteractive, ['version']);
      const commandsToBeProcessed = cliWithExternalArguments.processCommands();

      expect(commandsToBeProcessed.length).to.equal(0);
    });

    it('should return an empty array when the "--version" parameter is given', () => {
      const cliWithExternalArguments = new CLI(serverless, isInteractive, ['--version']);
      const commandsToBeProcessed = cliWithExternalArguments.processCommands();

      expect(commandsToBeProcessed.length).to.equal(0);
    });

    it('should return an empty array when the "--v" parameter is given', () => {
      const cliWithExternalArguments = new CLI(serverless, isInteractive, ['--v']);
      const commandsToBeProcessed = cliWithExternalArguments.processCommands();

      expect(commandsToBeProcessed.length).to.equal(0);
    });

    it('should return the passed arguments as an array of commands', () => {
      const cliWithExternalArguments = new CLI(serverless, isInteractive, ['deploy', 'functions']);
      const commandsToBeProcessed = cliWithExternalArguments.processCommands();

      expect(commandsToBeProcessed[0]).to.equal('deploy');
      expect(commandsToBeProcessed[1]).to.equal('functions');
    });
  });
});
