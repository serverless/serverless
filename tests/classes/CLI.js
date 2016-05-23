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

    it('should set an empty inputArray when none is provided', () => {
      cli = new CLI(serverless, isInteractive);
      expect(cli.inputArray.length).to.equal(0);
    });

    it('should set the inputObject when provided', () => {
      const cliWithParameters = new CLI(serverless, isInteractive, ['foo', 'bar', '--baz', '-qux']);

      expect(cliWithParameters.inputArray[0]).to.equal('foo');
      expect(cliWithParameters.inputArray[1]).to.equal('bar');
      expect(cliWithParameters.inputArray[2]).to.equal('--baz');
      expect(cliWithParameters.inputArray[3]).to.equal('-qux');
    });
  });

  describe('#processInput()', () => {
    it('should return an empty object when the "help" parameter is given', () => {
      const cliWithParameters = new CLI(serverless, isInteractive, ['help']);
      const inputToBeProcessed = cliWithParameters.processInput();

      expect(inputToBeProcessed).to.deep.equal({});
    });

    it('should return an empty object when the "--help" parameter is given', () => {
      const cliWithParameters = new CLI(serverless, isInteractive, ['--help']);
      const inputToBeProcessed = cliWithParameters.processInput();

      expect(inputToBeProcessed).to.deep.equal({});
    });

    it('should return an empty object when the "--h" parameter is given', () => {
      const cliWithParameters = new CLI(serverless, isInteractive, ['--h']);
      const inputToBeProcessed = cliWithParameters.processInput();

      expect(inputToBeProcessed).to.deep.equal({});
    });

    it('should return an empty object when the "version" parameter is given', () => {
      const cliWithParameters = new CLI(serverless, isInteractive, ['version']);
      const inputToBeProcessed = cliWithParameters.processInput();

      expect(inputToBeProcessed).to.deep.equal({});
    });

    it('should return an empty object when the "--version" parameter is given', () => {
      const cliWithParameters = new CLI(serverless, isInteractive, ['--version']);
      const inputToBeProcessed = cliWithParameters.processInput();

      expect(inputToBeProcessed).to.deep.equal({});
    });

    it('should return an empty object when the "--v" parameter is given', () => {
      const cliWithParameters = new CLI(serverless, isInteractive, ['--v']);
      const inputToBeProcessed = cliWithParameters.processInput();

      expect(inputToBeProcessed).to.deep.equal({});
    });

    it('should only return the commands when only commands are given', () => {
      const cliWithParameters = new CLI(serverless, isInteractive, ['deploy', 'functions']);
      const inputToBeProcessed = cliWithParameters.processInput();

      const expectedObject = { commands: ['deploy', 'functions'], options: {} };

      expect(inputToBeProcessed).to.deep.equal(expectedObject);
    });

    it('should only return the options when only options are given', () => {
      const cliWithParameters = new CLI(serverless, isInteractive,
        ['-f', 'function1', '-r', 'resource1']);
      const inputToBeProcessed = cliWithParameters.processInput();

      const expectedObject = { commands: [], options: { f: 'function1', r: 'resource1' } };

      expect(inputToBeProcessed).to.deep.equal(expectedObject);
    });

    it('should return commands and options when both are given', () => {
      const cliWithParameters = new CLI(serverless, isInteractive,
        ['deploy', 'functions', '-f', 'function1']);
      const inputToBeProcessed = cliWithParameters.processInput();

      const expectedObject = { commands: ['deploy', 'functions'], options: { f: 'function1' } };

      expect(inputToBeProcessed).to.deep.equal(expectedObject);
    });
  });
});
