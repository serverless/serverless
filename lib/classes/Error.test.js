'use strict';
/* eslint-disable no-console */

const expect = require('chai').expect;
const ServerlessError = require('../../lib/classes/Error').ServerlessError;
const logError = require('../../lib/classes/Error').logError;

describe('ServerlessError', () => {
  describe('#constructor()', () => {
    it('should store message', () => {
      const error = new ServerlessError('a message', 'a status code');
      expect(error.message).to.be.equal('a message');
    });

    it('should store name', () => {
      const error = new ServerlessError('a message', 'a status code');
      expect(error.name).to.be.equal('ServerlessError');
    });

    it('should store status code', () => {
      const error = new ServerlessError('a message', 'a status code');
      expect(error.statusCode).to.be.equal('a status code');
    });

    it('should have stack trace', () => {
      let expectedError;
      function testStackFrame() {
        expectedError = new ServerlessError('a message', 'a status code');
        throw expectedError;
      }

      let thrownError;
      try {
        testStackFrame();
      } catch (e) {
        thrownError = e;
      }

      expect(thrownError).to.exist; // eslint-disable-line no-unused-expressions
      expect(thrownError).to.deep.equal(expectedError);
      expect(thrownError.stack).to.exist; // eslint-disable-line no-unused-expressions
      expect(thrownError.stack).to.have.string('testStackFrame');
      expect(thrownError.stack).to.not.have.string('new ServerlessError');
      expect(thrownError.stack).to.not.have.string('Error.js');
    });
  });
});

describe('Error', () => {
  describe('#logError()', () => {
    beforeEach(() => {
      this.cbProcessExit = null;
      this.processExitCodes = [];
      this.processExit = process.exit;
      process.exit = (code) => {
        this.processExitCodes.push(code);
        if (this.cbProcessExit) {
          this.cbProcessExit();
        }
      };

      this.consoleLogMessages = [];
      this.consoleLog = console.log;
      console.log = (msg) => {
        this.consoleLogMessages.push(msg);
      };
    });

    afterEach(() => {
      process.exit = this.processExit;
      console.log = this.consoleLog;

      delete process.env.SLS_DEBUG;
    });

    it('should log error and exit', () => {
      const error = new ServerlessError('a message', 'a status code');
      logError(error);
      console.log = this.consoleLog;  // For mocha to echo status of the test

      expect(this.processExitCodes.length).to.be.equal(1);
      expect(this.processExitCodes).gt(0);

      const message = this.consoleLogMessages.join('\n');
      expect(message).to.have.string('Serverless Error');
      expect(message).to.have.string('a message');
    });

    it('should shorten long messages', () => {
      const error = new ServerlessError(
        'a message which is way to long so it gets shortened automatically to fit');
      logError(error);
      console.log = this.consoleLog;

      const message = this.consoleLogMessages.join('\n');
      expect(message).to.have.string('Serverless Error');
      expect(message).to.have.string('a message which is way to long so it gets shortened');
      expect(message).to.not.have.string(
        'a message which is way to long so it gets shortened automatically to fit');
    });

    it('should notify about SLS_DEBUG and ask report for unexpected errors', () => {
      const error = new Error('an unexpected error');
      logError(error);
      console.log = this.consoleLog;

      const message = this.consoleLogMessages.join('\n');
      expect(message).to.have.string('SLS_DEBUG=*');
      expect(message).to.have.string('Please report this error');
    });

    it('should print stack trace with SLS_DEBUG', () => {
      process.env.SLS_DEBUG = 1;
      const error = new ServerlessError('a message');
      logError(error);
      console.log = this.consoleLog;

      const message = this.consoleLogMessages.join('\n');
      expect(message).to.have.string('Stack Trace');
      expect(message).to.have.string(error.stack);
    });

    it('should not print stack trace without SLS_DEBUG', () => {
      const error = new ServerlessError('a message');
      logError(error);
      console.log = this.consoleLog;

      const message = this.consoleLogMessages.join('\n');
      expect(message).to.not.have.string('Stack Trace');
      expect(message).to.not.have.string(error.stack);
    });

    it('should re-throw error when handling raises an exception itself', () => {
      const error = new ServerlessError('a message');
      const handlingError = new Error('an unexpected error');
      this.cbProcessExit = () => { throw handlingError; };

      let thrownError = null;
      try {
        logError(error);
      } catch (e) {
        thrownError = e;
      }
      console.log = this.consoleLog;

      expect(thrownError).to.deep.equal(handlingError);
    });
  });
});
