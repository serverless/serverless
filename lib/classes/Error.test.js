'use strict';
/* eslint-disable no-console */

const expect = require('chai').expect;
const ServerlessError = require('./Error').ServerlessError;
const logError = require('./Error').logError;
const logWarning = require('./Error').logWarning;

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
      this.consoleLogMessages = [];
      this.consoleLog = console.log;
      console.log = (msg) => {
        this.consoleLogMessages.push(msg);
      };
    });

    afterEach(() => {
      console.log = this.consoleLog;
      delete process.env.SLS_DEBUG;
    });

    it('should log error and exit', () => {
      const error = new ServerlessError('a message', 'a status code');
      logError(error);
      console.log = this.consoleLog;  // For mocha to echo status of the test

      // TODO @David Not sure how to make async test for this
      // If tracking enabled, the process exits in a callback and is not defined yet
      // expect(this.processExitCodes.length).to.be.equal(1);
      // expect(this.processExitCodes).gt(0);

      const message = this.consoleLogMessages.join('\n');
      expect(message).to.have.string('Serverless Error');
      expect(message).to.have.string('a message');
    });

    it('should notify about SLS_DEBUG and ask report for unexpected errors', () => {
      const error = new Error('an unexpected error');
      logError(error);
      console.log = this.consoleLog;

      const message = this.consoleLogMessages.join('\n');
      expect(message).to.have.string('SLS_DEBUG=*');
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
      const handlingError = new Error('an unexpected error');

      let thrownError = null;
      try {
        logError('INVALID INPUT');
      } catch (e) {
        thrownError = e;
      }
      console.log = this.consoleLog;

      expect(thrownError).to.deep.equal(handlingError);
    });
  });

  describe('#logWarning()', () => {
    beforeEach(() => {
      this.consoleLogMessages = [];
      this.consoleLog = console.log;
      console.log = (msg) => {
        this.consoleLogMessages.push(msg);
      };
    });

    afterEach(() => {
      console.log = this.consoleLog;
    });

    it('should log warning and proceed', () => {
      logWarning('a message');

      const message = this.consoleLogMessages.join('\n');
      expect(message).to.have.string('Serverless Warning');
      expect(message).to.have.string('a message');
    });
  });
});
